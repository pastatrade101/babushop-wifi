import {pool,audit,requireValue,Problem,SITE,type Staff} from './index.ts';
import {connectionFromEnv} from '../../network/src/index.ts';
import {bindingWriterFromEnv,normalizeMac,reconcile,vipIdOf,type MikroTikBindingWriter,type RouterBinding} from '../../network/src/bindings.ts';

// VIP devices: the portal's list of phones that go online free, kept in step
// with the router's tagged bypass bindings. A change the router could not take
// is saved with its error and retried by "Sync with router"; removing a device
// needs the router, so a free pass is never left behind with no record of it.

const NOT_SET_UP='Router changes are not set up. Add the portal-files account (MIKROTIK_FILES_USERNAME and MIKROTIK_FILES_PASSWORD) to the server.';
const COLUMNS='id,mac,name,note,enabled,router_binding_id,synced_at,sync_error,created_at,updated_at';
const iso=(d:Date|string|null)=>d===null||d===undefined?null:new Date(d).toISOString();
const shape=(r:any)=>({id:r.id,mac:r.mac,name:r.name,note:r.note,enabled:r.enabled,on_router:!!r.router_binding_id&&!r.sync_error,router_binding_id:r.router_binding_id,synced_at:iso(r.synced_at),sync_error:r.sync_error,created_at:iso(r.created_at)!,updated_at:iso(r.updated_at)!});

function writer():MikroTikBindingWriter{const w=bindingWriterFromEnv();if(!w)throw new Problem(503,NOT_SET_UP);return w;}
const routerError=(e:unknown)=>{const m=(e as Error).message||'error';return /timed out|ECONN|EHOST|ENET|socket/i.test(m)?'The router is not answering. Check its internet and the tunnel to the server.':'The router refused the change: '+m;};

export async function listVip(){
 const {rows}=await pool.query(`select ${COLUMNS} from wifi.vip_devices where site_id=$1 order by created_at desc`,[SITE]);
 return {items:rows.map(shape)};
}

async function one(id:string){const r=(await pool.query(`select ${COLUMNS} from wifi.vip_devices where id=$1 and site_id=$2`,[id,SITE])).rows[0];requireValue(r,404,'VIP device not found');return r;}

/** Put one device's binding on the router (removing any stale one of ours first) and record the outcome. */
async function push(row:any){
 let w:MikroTikBindingWriter|null=null;
 try{
  w=writer();
  const stale=(await w.list()).filter(b=>vipIdOf(b.comment)===row.id);
  for(const b of stale)await w.remove(b);
  const bindingId=row.enabled?await w.add({id:row.id,mac:row.mac,name:row.name}):null;
  await pool.query('update wifi.vip_devices set router_binding_id=$2,synced_at=now(),sync_error=null where id=$1',[row.id,bindingId]);
 }catch(e){
  const message=e instanceof Problem?e.message:routerError(e);
  await pool.query('update wifi.vip_devices set sync_error=$2 where id=$1',[row.id,message]);
 }finally{w?.close();}
 return shape(await one(row.id));
}

export async function addVip(staff:Staff,input:{mac:string;name:string;note?:string|null}){
 let mac:string;try{mac=normalizeMac(input.mac);}catch(e){throw new Problem(400,(e as Error).message);}
 const name=String(input.name||'').trim();requireValue(name.length>=1&&name.length<=60,400,'Give the device a name, like "Owner phone".');
 const note=input.note?.trim()||null;requireValue(!note||note.length<=200,400,'Keep the note under 200 characters.');
 const row=(await pool.query(`insert into wifi.vip_devices(site_id,mac,name,note,created_by) values($1,$2,$3,$4,$5)
  on conflict (site_id,mac) do nothing returning ${COLUMNS}`,[SITE,mac,name,note,staff.id])).rows[0];
 requireValue(row,409,`${mac} is already a VIP device.`);
 await audit(pool,staff.id,'VIP_DEVICE_ADDED',row.id,{mac,name});
 return push(row);
}

export async function updateVip(staff:Staff,id:string,input:{name:string;note?:string|null;enabled:boolean}){
 const name=String(input.name||'').trim();requireValue(name.length>=1&&name.length<=60,400,'Give the device a name.');
 const note=input.note?.trim()||null;requireValue(!note||note.length<=200,400,'Keep the note under 200 characters.');
 const row=(await pool.query(`update wifi.vip_devices set name=$3,note=$4,enabled=$5,updated_at=now() where id=$1 and site_id=$2 returning ${COLUMNS}`,[id,SITE,name,note,input.enabled])).rows[0];
 requireValue(row,404,'VIP device not found');
 await audit(pool,staff.id,input.enabled?'VIP_DEVICE_UPDATED':'VIP_DEVICE_SWITCHED_OFF',row.id,{mac:row.mac,name,enabled:input.enabled});
 return push(row);
}

/** Remove a device: its binding comes off the router first, and only then the record. */
export async function removeVip(staff:Staff,id:string){
 const row=await one(id);
 const w=writer();
 try{for(const b of (await w.list()).filter(b=>vipIdOf(b.comment)===row.id))await w.remove(b);}
 catch(e){throw new Problem(502,routerError(e)+' The device keeps its free access until it can be removed.');}
 finally{w.close();}
 await pool.query('delete from wifi.vip_devices where id=$1',[row.id]);
 await audit(pool,staff.id,'VIP_DEVICE_REMOVED',row.id,{mac:row.mac,name:row.name});
 return {ok:true,message:`${row.name} (${row.mac}) no longer has free access.`};
}

/** Make the router's tagged bindings match the list: add what is missing, remove what is not wanted. */
export async function syncVip(staff:Staff){
 const rows=(await pool.query(`select ${COLUMNS} from wifi.vip_devices where site_id=$1`,[SITE])).rows;
 const w=writer();
 try{
  let bindings:RouterBinding[];
  try{bindings=await w.list();}catch(e){throw new Problem(502,routerError(e));}
  const plan=reconcile(rows.filter(r=>r.enabled).map(r=>({id:r.id,mac:r.mac,name:r.name})),bindings);
  let removed=0,added=0;const failed:string[]=[];
  for(const b of plan.remove){try{await w.remove(b);removed++;}catch(e){failed.push(routerError(e));}}
  for(const k of plan.kept)await pool.query('update wifi.vip_devices set router_binding_id=$2,synced_at=now(),sync_error=null where id=$1',[k.id,k.bindingId]);
  for(const v of plan.add){
   try{const bindingId=await w.add(v);added++;await pool.query('update wifi.vip_devices set router_binding_id=$2,synced_at=now(),sync_error=null where id=$1',[v.id,bindingId]);}
   catch(e){const m=routerError(e);failed.push(m);await pool.query('update wifi.vip_devices set sync_error=$2 where id=$1',[v.id,m]);}
  }
  for(const r of rows.filter(r=>!r.enabled))await pool.query('update wifi.vip_devices set router_binding_id=null,synced_at=now(),sync_error=null where id=$1',[r.id]);
  await audit(pool,staff.id,'VIP_DEVICES_SYNCED',null,{added,removed,failed:failed.length});
  return {ok:failed.length===0,message:failed.length?`Synced with ${failed.length} problem(s): ${failed[0]}`:`The router matches the list${added||removed?` (${added} added, ${removed} removed)`:''}.`};
 }finally{w.close();}
}

/** Phones on the shop Wi-Fi right now, from the router (read-only), for making one VIP with a tap. */
export async function vipCandidates(){
 let c;try{c=connectionFromEnv();}catch(e){throw new Problem(503,(e as Error).message);}
 try{
  const [hosts,leases,active]=await Promise.all([c.read('ip/hotspot/host'),c.read('ip/dhcp-server/lease'),c.read('ip/hotspot/active')]) as any[];
  const names=new Map<string,string>();for(const l of Array.isArray(leases)?leases:[])if(l['mac-address']&&l['host-name'])names.set(String(l['mac-address']).toUpperCase(),String(l['host-name']));
  const users=new Map<string,string>();for(const a of Array.isArray(active)?active:[])if(a['mac-address'])users.set(String(a['mac-address']).toUpperCase(),String(a.user||''));
  const vips=new Set((await pool.query('select mac from wifi.vip_devices where site_id=$1',[SITE])).rows.map(r=>r.mac));
  const items=(Array.isArray(hosts)?hosts:[]).filter((h:any)=>h['mac-address']).map((h:any)=>{
   const mac=String(h['mac-address']).toUpperCase(),user=users.get(mac)||'';
   return {mac,address:String(h.address||''),host_name:names.get(mac)||null,
    signed_in_as:user?(user.startsWith('OFA-BURE')?'free offer':user.replace(/^(.{4}).+/,'$1…')):null,
    bypassed:h.bypassed==='true',vip:vips.has(mac),idle:String(h['idle-time']||'')};
  });
  return {items};
 }catch(e){if(e instanceof Problem)throw e;throw new Problem(502,routerError(e));}
 finally{c.close();}
}
