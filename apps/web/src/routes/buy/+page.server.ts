import {fail} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {api,brand} from '$lib/server/api';
// The customer pages are the One Network design; the shop's own details on it
// come from the environment. The router's sign-in page is where a voucher is
// redeemed, so the buy page needs its address too.
export const load=async(event:any)=>{
 const shop=await api(event,'/portal/shop').catch(()=>({enabled:false,flow:'redirect',networks:[],items:[]}));
 return {brand:brand(),support:env.WIFI_SUPPORT_CONTACT||'',phone:env.WIFI_SELLER_PHONE||'0758342054',loginUrl:env.HOTSPOT_LOGIN_URL||'http://10.78.0.1/login',logo:'/logo.webp',
  enabled:shop.enabled,flow:shop.flow||'redirect',networks:shop.networks||[],items:shop.items||[]};
};
export const actions={
 default:async(event:any)=>{
  const form=await event.request.formData();
  try{
   // The claim token comes back to the browser and is never persisted server
   // side in a form the buyer could be identified by -- only its digest is stored.
   const started=await api(event,'/portal/purchase',{package_id:String(form.get('package_id')||''),
    ...(form.get('phone')?{phone:String(form.get('phone'))}:{}),
    ...(form.get('network')?{network:String(form.get('network'))}:{})});
   return {claim_token:started.claim_token,checkout_url:started.checkout_url,flow:started.flow,instruction:started.instruction,amount_tzs:started.amount_tzs};
  }catch(e){return fail(400,{error:(e as Error).message});}
 }
};
