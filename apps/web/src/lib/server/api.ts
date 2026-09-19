import {env} from '$env/dynamic/private';
import {redirect} from '@sveltejs/kit';
export async function api(event:any,path:string,body?:unknown,method?:string,extra:Record<string,string>={}){
 const response=await event.fetch((env.API_INTERNAL_URL||'http://127.0.0.1:4000')+'/api/v1'+path,{method:method||(body?'POST':'GET'),headers:{...(event.locals.accessToken?{Authorization:'Bearer '+event.locals.accessToken}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(response.status===401&&!path.startsWith('/portal/'))redirect(303,'/login');const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed');return result;
}
export function brand(){return env.WIFI_BRAND||'BABU-SHOP WIFI';}
