import {json} from '@sveltejs/kit';
import {api} from '$lib/server/api';
// Same-origin proxy so the claim token is POSTed from the browser without the
// page needing the API host, and without the token ever entering a URL.
export const POST=async(event:any)=>{
 try{
  const body=await event.request.json();
  return json(await api(event,'/portal/purchase/status',{claim_token:String(body?.claim_token||'')}));
 }catch(e){return json({error:(e as Error).message},{status:400});}
};
