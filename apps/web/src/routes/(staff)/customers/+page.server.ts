import {error,fail} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// Wi-Fi users: phone numbers from sales and payments, names and notes the shop
// adds, and custom SMS through MoSMS. Administrators only.
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const q=(event.url.searchParams.get('q')||'').slice(0,100);
 const raw=event.url.searchParams.get('filter');
 const filter=raw==='bought'||raw==='tried'||raw==='online'?raw:'all';
 const params=new URLSearchParams({filter});if(q)params.set('q',q);
 return {...await api(event,'/customers?'+params),q,filter};
};

const text=(f:FormData,n:string)=>String(f.get(n)??'').trim();
export const actions={
 save:async(event:any)=>{
  const f=await event.request.formData();
  const input={phone:text(f,'phone'),name:text(f,'name')||null,note:text(f,'note')||null,sms_opt_out:f.get('sms_opt_out')==='on'};
  try{const c=await api(event,'/customers',input,'PUT');return {message:`Saved ${c.name??'the number'}${c.sms_opt_out?' (no SMS)':''}.`};}
  catch(e){return fail(400,{error:(e as Error).message,form:'save'});}
 },
 sms:async(event:any)=>{
  const f=await event.request.formData();
  let phones:string[]=[];try{phones=JSON.parse(text(f,'phones'));}catch{/* checked below */}
  if(!Array.isArray(phones)||!phones.length)return fail(400,{error:'Choose at least one person.',form:'sms'});
  try{
   const r=await api(event,'/customers/sms',{phones,text:String(f.get('text')??'')});
   return {message:`Queued ${r.queued} SMS (${r.credits} credit${r.credits===1?'':'s'}).${r.skipped?` ${r.skipped} skipped: they asked for no SMS.`:''} They go out over the next few minutes.`};
  }catch(e){return fail(400,{error:(e as Error).message,form:'sms'});}
 },
};
