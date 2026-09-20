import {redirect,error} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {api,brand} from '$lib/server/api';
export const load=async(event:any)=>{
 if(!event.locals.accessToken)redirect(303,'/login');
 let staff,runtime;
 try{[staff,runtime]=await Promise.all([api(event,'/me'),api(event,'/runtime')]);}
 catch(e){if((e as any).status===303)throw e;error(403,(e as Error).message);}
 return {staff,brand:brand(),mode:runtime.mode,networkProvider:runtime.provider,radiusEnabled:runtime.radius_enabled,wanDownload:Number(env.WAN_DOWNLOAD_MBPS||150),wanUpload:env.WAN_UPLOAD_MBPS?Number(env.WAN_UPLOAD_MBPS):null};
};
