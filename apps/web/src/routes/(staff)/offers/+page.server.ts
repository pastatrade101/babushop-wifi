import {error,fail} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// Free Wi-Fi offers: when anyone on the shop Wi-Fi may go online with one tap.
// Times are typed and shown in Tanzanian time (UTC+3, no daylight saving).
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 return {offers:(await api(event,'/offers')).items};
};

/** "2026-10-15T08:00" typed in Dar es Salaam, as an instant. */
const instant=(local:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)?local+':00+03:00':'';

function body(form:FormData){
 const get=(n:string)=>String(form.get(n)??'').trim();
 const daily=form.get('daily')==='on';
 return {
  name:get('name'),starts_at:instant(get('starts_at')),ends_at:instant(get('ends_at')),
  daily_start:daily?get('daily_start')||null:null,daily_end:daily?get('daily_end')||null:null,
  download_mbps:Number(get('download_mbps')),upload_mbps:Number(get('upload_mbps')),
  enabled:form.get('enabled')==='on',
 };
}

export const actions={
 save:async(event:any)=>{
  const form=await event.request.formData();
  const id=String(form.get('id')??'');
  const input=body(form);
  if(!input.starts_at||!input.ends_at)return fail(400,{error:'Set when the offer starts and ends.',values:input,id});
  if(form.get('daily')==='on'&&(!input.daily_start||!input.daily_end))return fail(400,{error:'Set both daily hours, or untick “Only between these hours”.',values:input,id});
  try{
   const saved=id?await api(event,'/offers/'+id,input,'PATCH'):await api(event,'/offers',input);
   return {message:id?`Saved “${saved.name}”.`:`Created “${saved.name}”.`};
  }catch(e){return fail(400,{error:(e as Error).message,values:input,id});}
 },
 toggle:async(event:any)=>{
  const form=await event.request.formData();
  const id=String(form.get('id')??'');
  const offer=((await api(event,'/offers')).items as any[]).find(o=>o.id===id);
  if(!offer)return fail(404,{error:'Offer not found.'});
  const {name,starts_at,ends_at,daily_start,daily_end,download_mbps,upload_mbps}=offer;
  try{
   const saved=await api(event,'/offers/'+id,{name,starts_at,ends_at,daily_start,daily_end,download_mbps,upload_mbps,enabled:!offer.enabled},'PATCH');
   return {message:saved.enabled?`“${saved.name}” is switched on.`:`“${saved.name}” is switched off. Anyone online for free keeps their session until it ends.`};
  }catch(e){return fail(400,{error:(e as Error).message});}
 },
};
