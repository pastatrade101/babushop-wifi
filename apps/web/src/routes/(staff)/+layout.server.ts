import {redirect,error} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {api,brand} from '$lib/server/api';
export const load=async(event:any)=>{
 if(!event.locals.accessToken)redirect(303,'/login');
 let staff,runtime;
 try{[staff,runtime]=await Promise.all([api(event,'/me'),api(event,'/runtime')]);}
 catch(e){if((e as any).status===303)throw e;error(403,(e as Error).message);}
 // The signed-in account's own email, from the session hooks.server.ts has
 // already verified with Supabase -- shown only to that same person.
 return {staff,email:event.locals.user?.email??null,
  // A per-browser preference, read on the server so the collapsed rail is
  // rendered collapsed rather than snapping shut after the page loads.
  navCollapsed:event.cookies.get('wifi-nav')==='collapsed',
  brand:brand(),mode:runtime.mode,networkProvider:runtime.provider,radiusEnabled:runtime.radius_enabled,wanDownload:Number(env.WAN_DOWNLOAD_MBPS||150),wanUpload:env.WAN_UPLOAD_MBPS?Number(env.WAN_UPLOAD_MBPS):null};
};
