import {fail} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {api,brand} from '$lib/server/api';
export const load=async(event:any)=>{
 const shop=await api(event,'/portal/shop').catch(()=>({enabled:false,items:[]}));
 return {brand:brand(),support:env.WIFI_SUPPORT_CONTACT||'',enabled:shop.enabled,items:shop.items||[]};
};
export const actions={
 default:async(event:any)=>{
  const form=await event.request.formData();
  try{
   // The claim token comes back to the browser and is never persisted server
   // side in a form the buyer could be identified by -- only its digest is stored.
   const started=await api(event,'/portal/purchase',{package_id:String(form.get('package_id')||''),...(form.get('phone')?{phone:String(form.get('phone'))}:{})});
   return {claim_token:started.claim_token,checkout_url:started.checkout_url,amount_tzs:started.amount_tzs};
  }catch(e){return fail(400,{error:(e as Error).message});}
 }
};
