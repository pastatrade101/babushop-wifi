import {error,fail} from '@sveltejs/kit';
import {api} from '$lib/server/api';

export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const id=event.params.id;
 const site=await api(event,'/network/sites/'+id);
 // Status reads the live router. If the tunnel is down the rest of the page is
 // still useful, so a failure here becomes a message rather than an error page.
 let status=null,statusError=null;
 try{status=await api(event,'/network/sites/'+id+'/status');}
 catch(e){statusError=(e as Error).message;}
 const [devices,plans,audit]=await Promise.all([
  api(event,'/network/sites/'+id+'/devices'),
  api(event,'/network/sites/'+id+'/wireguard/plans'),
  api(event,'/network/sites/'+id+'/audit'),
 ]);
 return {site,status,statusError,devices,plans,audit};
};

export const actions={default:async(event:any)=>{
 const form=await event.request.formData(),get=(name:string)=>String(form.get(name)||'');
 const op=get('op'),id=event.params.id;
 try{
  if(op==='discover'){const r=await api(event,'/network/sites/'+id+'/discover',{});return {message:`Discovery complete. ${r.discovered} device${r.discovered===1?'':'s'} known to the router. Nothing was changed on it.`};}
  if(op==='probe'){const r=await api(event,'/network/devices/'+get('device_id')+'/ping',{});return {probe:r,message:'Diagnostic complete.'};}
  if(op==='approve'){await api(event,'/network/devices/'+get('device_id')+'/approve',{approved:get('approved')==='on'});return {message:'Management approval updated.'};}
  if(op==='plan'){const r=await api(event,'/network/sites/'+id+'/wireguard/plan',{});return {plan:r,message:'Dry run generated. Nothing has been applied.'};}
  if(op==='omada'){await api(event,'/network/sites/'+id+'/omada',{url:get('url')||null},'PATCH');return {message:'Omada site URL saved.'};}
  return fail(400,{error:'Unknown action'});
 }catch(e){if((e as any).status===303)throw e;return fail(400,{error:(e as Error).message});}
}};
