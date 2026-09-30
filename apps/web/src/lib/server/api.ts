import {env} from '$env/dynamic/private';
import {redirect} from '@sveltejs/kit';
// timeoutMs: most calls answer in well under 15 s; publishing the router pages is a chain of ~40 router calls and gets longer.
export async function api(event:any,path:string,body?:unknown,method?:string,extra:Record<string,string>={},timeoutMs=15000){
 const response=await event.fetch((env.API_INTERNAL_URL||'http://127.0.0.1:4000')+'/api/v1'+path,{method:method||(body?'POST':'GET'),headers:{...(event.locals.accessToken?{Authorization:'Bearer '+event.locals.accessToken}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
 if(response.status===401&&!path.startsWith('/portal/'))redirect(303,'/login');const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed');return result;
}
export function brand(){return env.WIFI_BRAND||'JIACHIE WIFI';}
