import {pool,audit,requireValue,Problem,type Staff} from './index.ts';
import {connectionFromEnv} from '../../network/src/index.ts';
import {fileWriterFromEnv,hotspotPath,checkContents,replaceFile,FileWriteError,sha256,TEXT_TYPES,MAX_BYTES,type MikroTikFileWriter} from '../../network/src/files.ts';

// Hotspot pages: the one thing the portal may change on the router.
//
// Every write goes the same way: read the file that is there now and keep it,
// write the new one, read it back, and if the router did not store exactly
// what was sent, put the old one back. A login page is what every paying
// customer sees first, so a bad upload has to be a moment's problem, not an
// evening's.

const NOT_SET_UP='Hotspot uploads are not set up. Create the portal-files account on the router, then add MIKROTIK_FILES_USERNAME and MIKROTIK_FILES_PASSWORD to the server.';
const NOT_ANSWERING='The router is not answering. Check its connection to the server.';

export function fileUploadsEnabled(env:NodeJS.ProcessEnv=process.env){
 return !!(env.MIKROTIK_BASE_URL&&env.MIKROTIK_FILES_USERNAME&&env.MIKROTIK_FILES_PASSWORD);
}

/** The folder the customer hotspot serves its pages from, as the router says. Read with the read-only account. */
export async function hotspotDirectory():Promise<string>{
 let connection;
 try{connection=connectionFromEnv();}catch(error){throw new Problem(503,(error as Error).message);}
 try{
  const [servers,profiles]=await Promise.all([connection.read('ip/hotspot'),connection.read('ip/hotspot/profile')]) as any[];
  const list=Array.isArray(servers)?servers:[];
  const server=list.find(s=>s.disabled!=='true'&&s.disabled!==true)??list[0];
  const profile=(Array.isArray(profiles)?profiles:[]).find(p=>p.name===server?.profile);
  return String(profile?.['html-directory']||'hotspot').replace(/^\/+|\/+$/g,'');
 }catch{throw new Problem(503,NOT_ANSWERING);}
 finally{connection.close();}
}

export async function fileCapability(){
 const enabled=fileUploadsEnabled();
 return {enabled,directory:enabled?await hotspotDirectory().catch(()=>null):null,types:TEXT_TYPES,max_bytes:MAX_BYTES};
}

// One write per file at a time. The API runs as a single process, so a chain
// of promises per name is enough to stop two uploads interleaving.
const queues=new Map<string,Promise<unknown>>();
function oneAtATime<T>(key:string,task:()=>Promise<T>):Promise<T>{
 const next=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(task);
 queues.set(key,next);
 next.catch(()=>undefined).finally(()=>{if(queues.get(key)===next)queues.delete(key);});
 return next;
}

async function keep(name:string,contents:string,reason:string,staff:Staff){
 return (await pool.query('insert into wifi.router_file_versions(name,contents,sha256,size,reason,created_by) values($1,$2,$3,$4,$5,$6) returning id',
  [name,contents,sha256(contents),Buffer.byteLength(contents,'utf8'),reason,staff.id])).rows[0].id as string;
}

async function put(staff:Staff,name:string,contents:string,[before,after]:[string,string],extra:Record<string,unknown>={}){
 const writer:MikroTikFileWriter|null=fileWriterFromEnv();
 if(!writer)throw new Problem(503,NOT_SET_UP);
 try{
  return await oneAtATime(name,async()=>{
   const size=Buffer.byteLength(contents,'utf8');
   try{
    const {replaced,previous}=await replaceFile(writer,name,contents,previous=>keep(name,previous,before,staff));
    const versionId=await keep(name,contents,after,staff);
    await audit(pool,staff.id,'ROUTER_FILE_WRITTEN',versionId,{name,size,sha256:sha256(contents),replaced,previous_sha256:previous===null?null:sha256(previous),...extra});
    return {name,size,sha256:sha256(contents),replaced,version_id:versionId};
   }catch(error){
    if(!(error instanceof FileWriteError))throw error;
    if(error.status===502)await audit(pool,staff.id,'ROUTER_FILE_WRITE_FAILED',null,{name,size,restored:error.restored,...extra});
    throw new Problem(error.status,error.message);
   }
  });
 }catch(error){
  if(error instanceof Problem)throw error;
  throw new Problem(502,'The router refused the file: '+(error as Error).message);
 }finally{writer.close();}
}

/** Put a text file into the hotspot folder, keeping whatever it replaces. */
export async function uploadHotspotFile(staff:Staff,relative:string,contents:string){
 if(!fileUploadsEnabled())throw new Problem(503,NOT_SET_UP);
 try{checkContents(contents);}catch(error){throw new Problem(400,(error as Error).message);}
 const directory=await hotspotDirectory();
 let name:string;
 try{name=hotspotPath(directory,relative);}catch(error){throw new Problem(400,(error as Error).message);}
 return put(staff,name,contents,['BEFORE_UPLOAD','UPLOADED']);
}

export async function fileVersions(name:string){
 requireValue(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)+$/.test(name)&&!name.includes('..')&&name.length<=200,400,'Invalid file name');
 const {rows}=await pool.query(`select v.id,v.name,v.reason,v.size,v.sha256,v.created_at,s.display_name created_by
  from wifi.router_file_versions v left join wifi.staff_profiles s on s.id=v.created_by where v.name=$1 order by v.created_at desc limit 50`,[name]);
 return {items:rows};
}

/** Put an earlier version back. The version being replaced is kept too, so a restore can itself be undone. */
export async function restoreFileVersion(staff:Staff,id:string){
 const row=(await pool.query('select name,contents from wifi.router_file_versions where id=$1',[id])).rows[0];
 requireValue(row,404,'Version not found');
 // Still inside the hotspot folder as the router has it today.
 const directory=await hotspotDirectory();
 requireValue(row.name.startsWith(directory+'/'),409,'That file is no longer in the hotspot page folder');
 return put(staff,row.name,row.contents,['BEFORE_RESTORE','RESTORED'],{restored_from:id});
}
