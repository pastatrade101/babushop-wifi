import {redirect,error} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {api,brand} from '$lib/server/api';
export const load=async(event:any)=>{if(!event.locals.accessToken)redirect(303,'/login');let staff;try{staff=await api(event,'/me');}catch(e){if((e as any).status===303)throw e;error(403,(e as Error).message);}return {staff,brand:brand(),mode:env.OMADA_MODE||'unconfigured'};};
