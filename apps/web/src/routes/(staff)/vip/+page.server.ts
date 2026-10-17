import {error,fail} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// VIP devices: phones that go online free, with no sign-in. Administrators only.
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const [list,candidates]=await Promise.all([
  api(event,'/vip-devices'),
  // The phones on the Wi-Fi now come from the router; the page still works if it is not answering.
  api(event,'/vip-devices/candidates').then(r=>({items:r.items,error:null})).catch(e=>{if((e as any).status===303)throw e;return {items:[],error:(e as Error).message};}),
 ]);
 return {devices:list.items,candidates:candidates.items,candidatesError:candidates.error};
};

const text=(f:FormData,n:string)=>String(f.get(n)??'').trim();
export const actions={
 add:async(event:any)=>{
  const f=await event.request.formData();
  const input={mac:text(f,'mac'),name:text(f,'name'),note:text(f,'note')||null};
  try{
   const d=await api(event,'/vip-devices',input);
   return d.on_router?{message:`${d.name} (${d.mac}) now goes online free, without signing in.`}:{warning:`${d.name} is saved, but the router has not taken it yet: ${d.sync_error??'unknown problem'} Press Sync with router once the router is reachable.`};
  }catch(e){return fail(400,{error:(e as Error).message,values:input});}
 },
 toggle:async(event:any)=>{
  const f=await event.request.formData();
  const id=text(f,'id');
  const device=((await api(event,'/vip-devices')).items as any[]).find(d=>d.id===id);
  if(!device)return fail(404,{error:'VIP device not found.'});
  try{
   const d=await api(event,'/vip-devices/'+id,{name:device.name,note:device.note,enabled:!device.enabled},'PATCH');
   if(d.sync_error)return {warning:`Saved, but the router has not taken the change yet: ${d.sync_error}`};
   return {message:d.enabled?`${d.name} has free access again.`:`${d.name} is switched off: it signs in like everyone else.`};
  }catch(e){return fail(400,{error:(e as Error).message});}
 },
 remove:async(event:any)=>{
  const f=await event.request.formData();
  try{return {message:(await api(event,'/vip-devices/'+text(f,'id'),undefined,'DELETE')).message};}
  catch(e){return fail(502,{error:(e as Error).message});}
 },
 sync:async(event:any)=>{
  try{const r=await api(event,'/vip-devices/sync',{});return r.ok?{message:r.message}:{warning:r.message};}
  catch(e){return fail(502,{error:(e as Error).message});}
 },
};
