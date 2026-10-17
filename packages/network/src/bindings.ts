import https from 'node:https';
import {readFileSync} from 'node:fs';

// VIP devices: phones the router lets online without signing in. Each is a
// RouterOS hotspot IP binding of type "bypassed", tagged in its comment with the
// portal's own id, so the portal only ever touches bindings it made. Bindings
// added by hand in WinBox (no tag) are never changed or removed.
//
// The writes go through the same router account as the hotspot pages
// (MIKROTIK_FILES_*), and this class knows exactly one REST resource:
// /ip/hotspot/ip-binding.

export const VIP_TAG='JIACHIE-VIP:';
const RESOURCE='ip/hotspot/ip-binding';

/** A Wi-Fi address in the router's form, AA:BB:CC:DD:EE:FF, or an error saying what is wrong. Accepts dashes, dots, no separators, any case. */
export function normalizeMac(value:string):string{
 const hex=String(value||'').trim().toUpperCase().replace(/[^0-9A-F]/g,'');
 if(hex.length!==12)throw new Error('A Wi-Fi address has 12 letters and digits, like 6E:7E:F2:CA:66:74.');
 const mac=hex.match(/.{2}/g)!.join(':');
 if(mac==='00:00:00:00:00:00'||mac==='FF:FF:FF:FF:FF:FF')throw new Error('That is not a device address.');
 if(parseInt(hex.slice(0,2),16)&1)throw new Error('That is a group address, not a single device.');
 return mac;
}

/** The binding's comment: the tag, the portal id, and the name in characters RouterOS keeps as typed. */
export function vipComment(id:string,name:string){
 const clean=String(name||'').replace(/[^A-Za-z0-9 ._-]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
 return `${VIP_TAG}${id}${clean?' '+clean:''}`;
}
export const vipIdOf=(comment:unknown)=>{const m=String(comment??'').match(/^JIACHIE-VIP:([0-9a-f-]{36})\b/);return m?m[1]:null;};

export type RouterBinding={'.id':string;'mac-address'?:string;type?:string;server?:string;comment?:string;disabled?:string};
export type WantedVip={id:string;mac:string;name:string};

/**
 * What to change so the router's tagged bindings match the portal's enabled VIP
 * devices: bindings to add, and tagged bindings to remove (gone from the portal,
 * switched off, wrong address, wrong type or disabled on the router).
 */
export function reconcile(wanted:WantedVip[],bindings:RouterBinding[]){
 const ours=bindings.filter(b=>vipIdOf(b.comment));
 const keep=new Map<string,RouterBinding>();
 const remove:RouterBinding[]=[];
 for(const b of ours){
  const id=vipIdOf(b.comment)!,want=wanted.find(w=>w.id===id);
  const healthy=want&&String(b['mac-address']||'').toUpperCase()===want.mac&&b.type==='bypassed'&&b.disabled!=='true'&&!keep.has(id);
  if(healthy)keep.set(id,b);else remove.push(b);
 }
 const add=wanted.filter(w=>!keep.has(w.id));
 return {add,remove,kept:[...keep.entries()].map(([id,b])=>({id,bindingId:b['.id']}))};
}

export class MikroTikBindingWriter{
 private url:URL;private agent:https.Agent;
 constructor(private config:{baseUrl:string;username:string;password:string;caPath?:string;server:string}){
  this.url=new URL(config.baseUrl);
  if(this.url.protocol!=='https:'||this.url.pathname!=='/'||this.url.search||!config.username||!config.password)throw new Error('Configure an HTTPS router address and the router write account');
  if(!/^[\w-]{1,64}$/.test(config.server))throw new Error('Set the hotspot server name');
  this.agent=new https.Agent({rejectUnauthorized:true,ca:config.caPath?readFileSync(config.caPath):undefined,keepAlive:true,maxSockets:1});
 }
 private request(method:'GET'|'PUT'|'DELETE',path:string,body?:object):Promise<unknown>{
  return new Promise((resolve,reject)=>{
   const payload=body?JSON.stringify(body):null;
   const request=https.request(new URL('/rest/'+path,this.url),{method,agent:this.agent,headers:{Authorization:'Basic '+Buffer.from(this.config.username+':'+this.config.password).toString('base64'),Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},response=>{
    let raw='';response.setEncoding('utf8');
    response.on('data',chunk=>{raw+=chunk;if(raw.length>262144)request.destroy(new Error('Response too large'));});
    response.on('error',reject);
    response.on('end',()=>{
     let parsed:any=null;try{parsed=raw?JSON.parse(raw):null;}catch{/* not JSON */}
     const ok=response.statusCode===200||response.statusCode===201||response.statusCode===204;
     // RouterOS explains a refusal in message/detail; neither carries a credential.
     if(!ok)return reject(Object.assign(new Error(String(parsed?.detail||parsed?.message||'Router refused the request (HTTP '+response.statusCode+')').slice(0,200)),{status:response.statusCode}));
     resolve(parsed);
    });
   });
   request.setTimeout(10000,()=>request.destroy(new Error('Router connection timed out')));request.on('error',reject);request.end(payload??undefined);
  });
 }
 async list():Promise<RouterBinding[]>{const rows=await this.request('GET',RESOURCE);return Array.isArray(rows)?rows as RouterBinding[]:[];}
 /** Add a bypass binding for one VIP device on the shop's hotspot server. Returns the router's id for it. */
 async add(vip:WantedVip):Promise<string>{
  const created:any=await this.request('PUT',RESOURCE,{'mac-address':normalizeMac(vip.mac),type:'bypassed',server:this.config.server,comment:vipComment(vip.id,vip.name)});
  const id=created?.['.id'];
  if(typeof id==='string'&&/^\*[0-9A-F]+$/i.test(id))return id;
  const found=(await this.list()).find(b=>vipIdOf(b.comment)===vip.id);
  if(!found)throw new Error('The router did not keep the binding');
  return found['.id'];
 }
 /** Remove one binding, but only one the portal made. Gone already counts as removed. */
 async remove(binding:RouterBinding):Promise<void>{
  if(!vipIdOf(binding.comment))throw new Error('Refusing to remove a binding the portal did not make');
  if(!/^\*[0-9A-F]+$/i.test(binding['.id']))throw new Error('Unexpected binding id');
  try{await this.request('DELETE',RESOURCE+'/'+binding['.id']);}
  catch(error){if((error as any).status!==404)throw error;}
 }
 close(){this.agent.destroy();}
}

export function bindingWriterFromEnv(env:NodeJS.ProcessEnv=process.env):MikroTikBindingWriter|null{
 if(!env.MIKROTIK_BASE_URL||!env.MIKROTIK_FILES_USERNAME||!env.MIKROTIK_FILES_PASSWORD)return null;
 return new MikroTikBindingWriter({baseUrl:env.MIKROTIK_BASE_URL,username:env.MIKROTIK_FILES_USERNAME,password:env.MIKROTIK_FILES_PASSWORD,caPath:env.MIKROTIK_CA_PATH,server:env.MIKROTIK_HOTSPOT_SERVER||'babu-hotspot'});
}
