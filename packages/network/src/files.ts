import https from 'node:https';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// The portal's one way of changing the router: putting text files into the
// hotspot's own page folder.
//
// It has its own account (MIKROTIK_FILES_*), separate from the read-only one
// every other feature uses, and this class is the only code that holds it. The
// class knows one REST resource, /file, and every name it touches has passed
// hotspotPath() first -- inside the hotspot folder, a text type, no "..".
//
// RouterOS's own policies are coarse: an account that may write files may also
// write configuration. So the restriction lives here, and the account is
// pinned on the router to the server's tunnel address.

export const TEXT_TYPES=['html','htm','css','js','txt','svg','json','xml'];
/** RouterOS reads and edits file contents up to 60 KB. */
export const MAX_BYTES=60000;
const PART=/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;

export const sha256=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');

/**
 * The full router path for a file inside the hotspot folder, or an error that
 * says what is wrong. `relative` may name one subfolder (css/style.css).
 */
export function hotspotPath(directory:string,relative:string):string{
 if(!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(directory))throw new Error('The hotspot page folder on the router has an unexpected name');
 const parts=relative.trim().replace(/^\/+/,'').split('/');
 if(parts.length>2||!parts.every(p=>PART.test(p)&&p!=='.'&&p!=='..'&&!p.includes('..')))throw new Error('Use a plain file name, optionally in one subfolder, such as login.html or css/style.css');
 const ext=parts[parts.length-1].split('.').pop()!.toLowerCase();
 if(!parts[parts.length-1].includes('.')||!TEXT_TYPES.includes(ext))throw new Error(`Only ${TEXT_TYPES.map(t=>'.'+t).join(', ')} files can be uploaded`);
 return `${directory}/${parts.join('/')}`;
}

/** Text a hotspot page can be made of: UTF-8, not empty, not binary, within RouterOS's limit. */
export function checkContents(contents:string){
 const size=Buffer.byteLength(contents,'utf8');
 if(!size)throw new Error('The file is empty');
 if(size>MAX_BYTES)throw new Error(`The file is ${Math.ceil(size/1024)} KB; the router accepts at most 60 KB`);
 if(contents.includes('\u0000')||contents.includes('\uFFFD'))throw new Error('That is not a UTF-8 text file');
 return size;
}

export type RouterFile={id:string;name:string;size:number;contents?:string;'last-modified'?:string};

export class MikroTikFileWriter{
 private url:URL;private agent:https.Agent;
 constructor(private config:{baseUrl:string;username:string;password:string;caPath?:string}){
  this.url=new URL(config.baseUrl);
  if(this.url.protocol!=='https:'||this.url.pathname!=='/'||this.url.search||!config.username||!config.password)throw new Error('Configure an HTTPS router address and the file account');
  this.agent=new https.Agent({rejectUnauthorized:true,ca:config.caPath?readFileSync(config.caPath):undefined,keepAlive:true,maxSockets:1});
 }
 private request(method:'GET'|'PUT'|'PATCH'|'POST',path:string,body?:object):Promise<unknown>{
  return new Promise((resolve,reject)=>{
   const payload=body?JSON.stringify(body):null;
   const request=https.request(new URL('/rest/'+path,this.url),{method,agent:this.agent,headers:{Authorization:'Basic '+Buffer.from(this.config.username+':'+this.config.password).toString('base64'),Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},response=>{
    let raw='';response.setEncoding('utf8');
    response.on('data',chunk=>{raw+=chunk;if(raw.length>262144)request.destroy(new Error('Response too large'));});
    response.on('error',reject);
    response.on('end',()=>{
     let parsed:any=null;try{parsed=raw?JSON.parse(raw):null;}catch{/* not JSON */}
     // RouterOS explains a refusal in message/detail; neither carries a credential.
     if(response.statusCode!==200)return reject(new Error(String(parsed?.detail||parsed?.message||'Router refused the request (HTTP '+response.statusCode+')').slice(0,200)));
     resolve(parsed);
    });
   });
   request.setTimeout(15000,()=>request.destroy(new Error('Router connection timed out')));request.on('error',reject);request.end(payload??undefined);
  });
 }
 /** The file by exact name, or null. */
 async find(name:string):Promise<RouterFile|null>{
  const rows=await this.request('GET','file?'+new URLSearchParams({name}));
  const row=Array.isArray(rows)?rows.find((r:any)=>r?.name===name):null;
  if(!row)return null;
  if(!/^\*[0-9A-Fa-f]+$/.test(row['.id']))throw new Error('Router returned an unexpected file id');
  return {id:row['.id'],name:row.name,size:Number(row.size??0),contents:typeof row.contents==='string'?row.contents:undefined,'last-modified':row['last-modified']};
 }
 /**
  * A file's text. The listing carries it only for small files; anything larger
  * is fetched with /file get, which RouterOS serves up to 60 KB. Null when the
  * router will not hand it over -- callers treat that as "cannot back up".
  */
 async contents(file:RouterFile):Promise<string|null>{
  if(file.contents!==undefined)return file.contents;
  for(const body of [{number:file.id,'value-name':'contents'},{'.id':file.id,'value-name':'contents'}]){
   try{const out:any=await this.request('POST','file/get',body);if(typeof out?.ret==='string')return out.ret;}catch{/* try the other spelling */}
  }
  return null;
 }
 /** Replace a file's text, or create the file. Callers verify by reading it back. */
 async write(name:string,contents:string,existing:RouterFile|null):Promise<void>{
  if(existing){await this.request('PATCH','file/'+existing.id,{contents});return;}
  try{await this.request('PUT','file',{name,contents});return;}
  catch{/* a RouterOS whose add takes no contents: create it, then set them */}
  let created=await this.find(name);
  if(!created){await this.request('PUT','file',{name,type:'file'});created=await this.find(name);}
  if(!created)throw new Error('The router did not create the file');
  await this.request('PATCH','file/'+created.id,{contents});
 }
 close(){this.agent.destroy();}
}

export type FileStore=Pick<MikroTikFileWriter,'find'|'contents'|'write'>;
export class FileWriteError extends Error{constructor(message:string,public status:number,public restored:boolean|null=null){super(message);}}

// RouterOS may store line endings its own way; that is not a failed upload.
const same=(a:string|null,b:string)=>a!==null&&a.replace(/\r\n/g,'\n').trimEnd()===b.replace(/\r\n/g,'\n').trimEnd();

/**
 * Replace (or create) one file, safely. In order: read what is there and hand
 * it to keepPrevious; write; read back; and if the router's copy is not what
 * was sent, write the previous one back. A file that cannot be read is never
 * overwritten, because there would be nothing to put back.
 */
export async function replaceFile(store:FileStore,name:string,contents:string,keepPrevious:(previous:string)=>Promise<unknown>){
 const existing=await store.find(name);
 let previous:string|null=null;
 if(existing){
  previous=await store.contents(existing);
  if(previous===null)throw new FileWriteError(`Could not read the current ${name} to keep a copy, so it was not replaced.`,409);
  await keepPrevious(previous);
 }
 await store.write(name,contents,existing);
 const stored=await store.find(name);
 if(!same(stored?await store.contents(stored):null,contents)){
  let restored=false;
  if(previous!==null){try{await store.write(name,previous,stored);restored=true;}catch{/* reported below */}}
  throw new FileWriteError(previous===null?`The router did not store ${name} correctly.`
   :restored?`The router did not store ${name} correctly, so the previous version was put back.`
   :`The router did not store ${name} correctly, and putting the previous version back failed too. Restore it from History, or in WinBox.`,502,previous===null?null:restored);
 }
 return {replaced:!!existing,previous};
}

export function fileWriterFromEnv(env:NodeJS.ProcessEnv=process.env):MikroTikFileWriter|null{
 if(!env.MIKROTIK_BASE_URL||!env.MIKROTIK_FILES_USERNAME||!env.MIKROTIK_FILES_PASSWORD)return null;
 return new MikroTikFileWriter({baseUrl:env.MIKROTIK_BASE_URL,username:env.MIKROTIK_FILES_USERNAME,password:env.MIKROTIK_FILES_PASSWORD,caPath:env.MIKROTIK_CA_PATH});
}
