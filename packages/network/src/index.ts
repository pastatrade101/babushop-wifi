import https from 'node:https';
import {readFileSync} from 'node:fs';

export type Check={ok:boolean;message:string};
export function networkPlan(env:NodeJS.ProcessEnv=process.env){
 const provider=env.NETWORK_PROVIDER||'omada';
 if(!['mikrotik','omada'].includes(provider))throw new Error('NETWORK_PROVIDER must be mikrotik or omada');
 const down=Number(env.WAN_DOWNLOAD_MBPS||150),up=env.WAN_UPLOAD_MBPS?Number(env.WAN_UPLOAD_MBPS):null;
 if(!Number.isInteger(down)||down<1||down>10000||up!==null&&(!Number.isInteger(up)||up<1||up>10000))throw new Error('Invalid WAN capacity');
 return {provider,download_mbps:down,upload_mbps:up,commissioned:false};
}
export function validateSpeeds(input:{download_mbps?:number|null;upload_mbps?:number|null},env:NodeJS.ProcessEnv=process.env){
 const plan=networkPlan(env),down=input.download_mbps??null,up=input.upload_mbps??null;
 for(const value of [down,up])if(value!==null&&(!Number.isInteger(value)||value<1))throw new Error('Speeds must be positive whole Mbps');
 if((down===null)!==(up===null))throw new Error('Set both download and upload speeds, or leave both blank');
 if(down!==null&&down>plan.download_mbps)throw new Error('Package download exceeds the fibre capacity');
 if(up!==null&&(up>10000||plan.upload_mbps!==null&&up>plan.upload_mbps))throw new Error('Package upload exceeds the configured capacity');
 if(down!==null&&plan.provider!=='mikrotik')throw new Error('Package speed enforcement is not supported by the Omada integration');
 return {download_mbps:down,upload_mbps:up};
}

// Read-only commissioning transport. Never accepts a destination supplied by a browser.
export class MikroTikConnection {
 private url:URL;private agent:https.Agent;
 constructor(private config:{baseUrl:string;username:string;password:string;caPath?:string}){
  this.url=new URL(config.baseUrl);
  if(this.url.protocol!=='https:'||this.url.username||this.url.password||this.url.pathname!=='/'||this.url.search||this.url.hash||!config.username||!config.password)throw new Error('Configure an HTTPS MikroTik management origin and credentials');
  this.agent=new https.Agent({rejectUnauthorized:true,ca:config.caPath?readFileSync(config.caPath):undefined});
 }
 async read(path:'system/resource'|'ip/hotspot') :Promise<unknown>{
  return new Promise((resolve,reject)=>{
   const request=https.request(new URL('/rest/'+path,this.url),{method:'GET',agent:this.agent,headers:{Authorization:'Basic '+Buffer.from(this.config.username+':'+this.config.password).toString('base64'),Accept:'application/json'}},response=>{
    let raw='';response.on('data',chunk=>{raw+=chunk;if(raw.length>262144)request.destroy(new Error('Response too large'));});
    response.on('error',reject);response.on('end',()=>{if(response.statusCode!==200)return reject(new Error('Router rejected request'));try{resolve(JSON.parse(raw));}catch{reject(new Error('Invalid router response'));}});
   });
   request.setTimeout(5000,()=>request.destroy(new Error('Router connection timed out')));request.on('error',reject);request.end();
  });
 }
 close(){this.agent.destroy();}
}
export async function checkMikroTik(env:NodeJS.ProcessEnv=process.env,connection?:Pick<MikroTikConnection,'read'>):Promise<Check>{
 if(!connection&&(!env.MIKROTIK_BASE_URL||!env.MIKROTIK_USERNAME||!env.MIKROTIK_PASSWORD))return {ok:false,message:'Router not connected. Add its private HTTPS address and dedicated API credentials after unboxing.'};
 let owned:MikroTikConnection|undefined;
 try{
  const router=connection||(owned=new MikroTikConnection({baseUrl:env.MIKROTIK_BASE_URL!,username:env.MIKROTIK_USERNAME!,password:env.MIKROTIK_PASSWORD!,caPath:env.MIKROTIK_CA_PATH}));
  const resource=await router.read('system/resource'),hotspots=await router.read('ip/hotspot');
  const row=Array.isArray(resource)?resource[0]:resource;
  if(!row||typeof row.version!=='string'||!/^7\./.test(row.version))return {ok:false,message:'RouterOS 7 is required. Verify the installed version in WinBox.'};
  const server=env.MIKROTIK_HOTSPOT_SERVER;
  if(!server||!Array.isArray(hotspots)||!hotspots.some(h=>h.name===server&&(h.disabled===false||h.disabled==='false')&&!(h.invalid===true||h.invalid==='true')))return {ok:false,message:'Router reachable. Configure the named customer HotSpot server before commissioning.'};
  return {ok:true,message:'RouterOS 7 and customer HotSpot are reachable. This read-only check does not enable vouchers or verify speed and expiry enforcement.'};
 }catch{return {ok:false,message:'Router check failed. Check private connectivity, trusted TLS certificate and API permissions.'};}
 finally{owned?.close();}
}
