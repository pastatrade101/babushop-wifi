import https from 'node:https';
import {readFileSync} from 'node:fs';
export type Context={clientMac:string;clientIp?:string;apMac:string;ssidName:string;radioId:string;site:string};
export type Outcome={status:'accepted'|'rejected'|'unknown';evidence:{code:string}};
export interface Adapter {mode:'mock'|'live';authorize(context:Context,deadline:Date):Promise<Outcome>;test():Promise<{ok:boolean;message:string}>;capabilities():object;}
export class MockAdapter implements Adapter {
 mode='mock' as const;calls=0;
 constructor(public scenario='success'){}
 async authorize(_context:Context,deadline:Date):Promise<Outcome>{this.calls++;if(this.scenario==='timeout')return {status:'unknown',evidence:{code:'SIMULATED_TIMEOUT'}};if(this.scenario==='rejection'||deadline.getTime()<=Date.now())return {status:'rejected',evidence:{code:'SIMULATED_REJECTION'}};if(this.scenario==='expired-session'){this.calls++;}return {status:'accepted',evidence:{code:this.scenario==='expired-session'?'SIMULATED_SESSION_REFRESH':'SIMULATED_ACCEPTANCE'}};}
 async test(){return {ok:true,message:'Simulation only. No controller contacted.'};}
 capabilities(){return {mode:this.mode,expiry:'simulated',lookup:'unsupported',disconnect:'unsupported',reconciliation:'unsupported',rateLimits:false};}
}
export type LiveConfig={baseUrl:string;controllerId:string;username:string;password:string;profile:'legacy-pre511'|'legacy'|'modern';timeUnit:'milliseconds'|'microseconds';timeMeaning:'timestamp'|'duration';fieldType:'number'|'string';expiryVerified:boolean;caPath?:string};
export class LiveAdapter implements Adapter {
 mode='live' as const;private cookie='';private csrf='';private agent:https.Agent;private url:URL;
 constructor(private config:LiveConfig){
  this.url=new URL(config.baseUrl);
  if(this.url.protocol!=='https:'||this.url.username||this.url.password||this.url.pathname!=='/'||!/^[-\w]+$/.test(config.controllerId))throw new Error('Invalid HTTPS controller configuration');
  if(!config.username||!config.password||!config.expiryVerified||!['legacy-pre511','legacy','modern'].includes(config.profile)||!['milliseconds','microseconds'].includes(config.timeUnit)||!['timestamp','duration'].includes(config.timeMeaning)||!['number','string'].includes(config.fieldType))throw new Error('Live authorization requires an explicitly commissioned expiry profile');
  this.agent=new https.Agent({ca:config.caPath?readFileSync(config.caPath):undefined,rejectUnauthorized:true});
 }
 private async request(endpoint:string,body:object):Promise<{http:number;body:any;cookies:string[]}>{
  return new Promise((resolve,reject)=>{const data=JSON.stringify(body);const r=https.request(new URL(`/${this.config.controllerId}/api/v2/hotspot/${endpoint}`,this.url),{method:'POST',agent:this.agent,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),...(this.cookie?{Cookie:this.cookie,'Csrf-Token':this.csrf}:{})}},res=>{let raw='';res.on('data',chunk=>{raw+=chunk;if(raw.length>65536)r.destroy(new Error('Controller response too large'));});res.on('end',()=>{try{resolve({http:res.statusCode||500,body:JSON.parse(raw),cookies:res.headers['set-cookie']||[]});}catch{reject(new Error('Unrecognized controller response'));}});});r.setTimeout(8000,()=>r.destroy(new Error('Controller timeout')));r.on('error',reject);r.end(data);});
 }
 private async login(){const r=await this.request('login',{name:this.config.username,password:this.config.password});const name=this.config.profile==='legacy-pre511'?'TPEAP_SESSIONID':'TPOMADA_SESSIONID';const cookie=r.cookies.map(v=>v.split(';')[0]).find(v=>v.startsWith(name+'='));if(r.http!==200||r.body.errorCode!==0||!r.body.result?.token||!cookie)throw new Error('Operator login rejected');this.csrf=String(r.body.result.token);this.cookie=cookie;}
 async authorize(context:Context,deadline:Date):Promise<Outcome>{
  // Login has no client authorization side effect. An unavailable login is a definite no-send.
  try{if(!this.cookie)await this.login();}catch{return {status:'rejected',evidence:{code:'OPERATOR_LOGIN_UNAVAILABLE'}};}
  for(let attempt=0;attempt<2;attempt++){
   if(deadline.getTime()<=Date.now())return {status:'rejected',evidence:{code:'DEADLINE_ELAPSED'}};
   const value=this.config.timeMeaning==='timestamp'?deadline.getTime():Math.max(0,deadline.getTime()-Date.now()-1000);
   const time=Math.floor(value*(this.config.timeUnit==='microseconds'?1000:1));
   const numeric=(n:number)=>this.config.fieldType==='string'?String(n):n;
   const body={clientMac:context.clientMac,apMac:context.apMac,ssidName:context.ssidName,radioId:numeric(Number(context.radioId)),site:context.site,time:numeric(time),authType:numeric(4),...(this.config.profile==='modern'?{clientIp:context.clientIp,originUrl:''}:{})};
   try{const r=await this.request('extPortal/auth',body);
    if((r.http===401||r.http===403)&&attempt===0){this.cookie='';this.csrf='';try{await this.login();}catch{return {status:'rejected',evidence:{code:'OPERATOR_SESSION_REJECTED'}};}continue;}
    if(r.http===200&&r.body.errorCode===0)return {status:'accepted',evidence:{code:'CONTROLLER_ACCEPTED'}};
    if(r.http===401||r.http===403)return {status:'rejected',evidence:{code:'OPERATOR_SESSION_REJECTED'}};
    if(r.http===200&&typeof r.body.errorCode==='number')return {status:'rejected',evidence:{code:`CONTROLLER_ERROR_${r.body.errorCode}`}};
    return {status:'unknown',evidence:{code:'UNRECOGNIZED_AUTH_RESPONSE'}};
   }catch{return {status:'unknown',evidence:{code:'AUTH_OUTCOME_UNKNOWN'}};}
  }return {status:'unknown',evidence:{code:'AUTH_OUTCOME_UNKNOWN'}};
 }
 async test(){try{await this.login();return {ok:true,message:'Operator login verified. This does not verify client expiry or AP enforcement.'};}catch{return {ok:false,message:'Controller login failed. Check private connectivity, TLS and operator configuration.'};}}
 capabilities(){return {mode:this.mode,profile:this.config.profile,expiry:'operator-commissioned',lookup:'unsupported',disconnect:'unsupported',reconciliation:'unsupported',rateLimits:false};}
}
export function adapterFromEnv():Adapter{
 if(process.env.OMADA_MODE==='mock')return new MockAdapter(process.env.OMADA_MOCK_SCENARIO||'success');
 if(process.env.NETWORK_PROVIDER==='mikrotik')throw new Error('MikroTik live authorization is not commissioned. Keep OMADA_MODE=mock until the MikroTik access integration is implemented and verified on hardware.');
 if(process.env.OMADA_MODE!=='live')throw new Error('OMADA_MODE must be explicitly mock or live');
 return new LiveAdapter({baseUrl:process.env.OMADA_BASE_URL||'',controllerId:process.env.OMADA_CONTROLLER_ID||'',username:process.env.OMADA_OPERATOR_USERNAME||'',password:process.env.OMADA_OPERATOR_PASSWORD||'',profile:process.env.OMADA_PROFILE as LiveConfig['profile'],timeUnit:process.env.OMADA_TIME_UNIT as LiveConfig['timeUnit'],timeMeaning:process.env.OMADA_TIME_MEANING as LiveConfig['timeMeaning'],fieldType:process.env.OMADA_FIELD_TYPE as LiveConfig['fieldType'],expiryVerified:process.env.OMADA_EXPIRY_VERIFIED==='true',caPath:process.env.OMADA_CA_PATH});
}
export function unsupported(capability:string){return {supported:false,message:`${capability} is not verified for this external-portal integration.`};}
