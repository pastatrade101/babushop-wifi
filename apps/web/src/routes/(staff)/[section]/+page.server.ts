import {fail,error} from '@sveltejs/kit';
import {randomUUID} from 'node:crypto';
import {api} from '$lib/server/api';
const allowed=['sell','vouchers','voucher-batches','packages','sales','access-grants','reports','staff','settings'];
export const load=async(event:any)=>{const parent=await event.parent(),section=event.params.section;if(!allowed.includes(section))error(404,'Page not found');if(parent.staff.role!=='ADMIN'&&!['sell','vouchers','packages','sales'].includes(section))error(403,'Administrator access required');const query=new URLSearchParams();for(const k of ['page','q','state','sort','from','to'])if(event.url.searchParams.has(k))query.set(k,event.url.searchParams.get(k)!);let result:any={};
 if(section==='sell')result.packages=await api(event,'/packages');
 else if(section==='settings')result.integration=await api(event,'/integrations/omada/status');
 else if(section==='reports')result={totals:await api(event,'/reports/sales?'+query),inventory:await api(event,'/reports/inventory'),audit:await api(event,'/audit')};
 else{result.list=await api(event,'/'+section+'?'+query);if(section==='voucher-batches')result.packages=await api(event,'/packages');if(section==='access-grants')result.attempts=await api(event,'/authorization-attempts?state=NEEDS_REVIEW');if(section==='sales'&&event.url.searchParams.has('sale'))result.sale=await api(event,'/sales/'+event.url.searchParams.get('sale'));}
 return {section,...result,query:Object.fromEntries(query)};
};
export const actions={default:async(event:any)=>{const f=await event.request.formData(),get=(n:string)=>String(f.get(n)||''),op=get('op'),id=get('id');try{
 if(op==='package'){const body={name:get('name'),description:get('description'),price_tzs:Number(get('price_tzs')),duration_minutes:Number(get('duration_minutes')),active:get('active')==='on'};await api(event,'/packages'+(id?'/'+id:''),body,id?'PATCH':'POST');return {message:'Package saved. Existing voucher terms stay unchanged.'};}
 if(op==='batch'){const b=await api(event,'/voucher-batches',{package_id:get('package_id'),quantity:Number(get('quantity')),label:get('label')});return {message:'Voucher batch created.',batch:b};}
 if(op==='reserve'){const reservation=await api(event,'/sales/reserve',{package_id:get('package_id'),quantity:Number(get('quantity'))});return {reservation,idempotency_key:randomUUID()};}
 if(op==='sell'){const s=await api(event,'/sales',{reservation_id:get('reservation_id'),cash_received:get('cash_received')==='on',customer_name:get('customer_name'),customer_phone:get('customer_phone'),notes:get('notes')},'POST',{'idempotency-key':get('idempotency_key')});return {sale:await api(event,'/sales/'+s.id),printed:await api(event,'/sales/'+s.id+'/print',{}),message:'Cash sale recorded. Print the receipt and vouchers below.'};}
 if(op==='print-batch'||op==='print-sale'){const type=op==='print-batch'?'voucher-batches':'sales';return {printed:await api(event,'/'+type+'/'+id+'/print',{}),...(type==='sales'?{sale:await api(event,'/sales/'+id)}:{}),message:'Print preview ready. This access has been audited.'};}
 if(op==='reveal')return {printed:await api(event,'/vouchers/'+id+'/reveal',{}),message:'Voucher revealed. This access has been audited.'};
 if(op==='void'||op==='reverse'||op==='revoke'){const path=op==='void'?'vouchers':op==='reverse'?'sales':'access-grants';const response=await api(event,'/'+path+'/'+id+'/'+op,{reason:get('reason')});return {message:response.message||(op==='reverse'?'Sale reversed; all codes permanently voided.':'Change saved.')};}
 if(op==='review'){await api(event,'/authorization-attempts/'+id+'/review',{decision:get('decision'),reason:get('reason')});return {message:'Evidence recorded. The original deadline is unchanged.'};}
 if(op==='staff'){await api(event,'/staff/'+id,{role:get('role'),enabled:get('enabled')==='on'},'PATCH');return {message:'Staff access updated.'};}
 if(op==='test'){const r=await api(event,'/integrations/omada/test',{});return {message:r.message};}
 return fail(400,{error:'Unknown action'});
 }catch(e){if((e as any).status===303)throw e;return fail(400,{error:(e as Error).message});}}};
