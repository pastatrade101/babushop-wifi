import {json} from '@sveltejs/kit';
import {api} from '$lib/server/api';
export const POST=async(event:any)=>{try{const body=await event.request.json();return json(await api(event,'/portal/status',{status_token:body.status_token}));}catch{return json({error:'Unable to refresh status. Please try again.'},{status:400});}};
