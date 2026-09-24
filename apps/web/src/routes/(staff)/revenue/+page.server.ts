import {error} from '@sveltejs/kit';
import {api} from '$lib/server/api';
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const start=(days:number)=>{const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-days+1);return date.toISOString().slice(0,10);};
 const from=event.url.searchParams.get('from')||start(30),to=event.url.searchParams.get('to')||today;
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to)||from>to)error(400,'Choose a valid date range with From on or before To.');
 const query=new URLSearchParams({from,to});
 const optional=async(path:string)=>{
  try{return {items:(await api(event,path)).items,error:false};}
  catch(e){if((e as {status?:number}).status===303)throw e;return {items:[],error:true};}
 };
 const [summary,trend,byPackage]=await Promise.all([
  api(event,'/reports/revenue?'+query),
  optional('/reports/trend?days=30'),
  optional('/reports/by-package?days=30')
 ]);
 return {summary,trend:trend.items,byPackage:byPackage.items,trendError:trend.error,packageError:byPackage.error,
  presets:[{label:'Today',from:today,to:today},{label:'7 days',from:start(7),to:today},{label:'30 days',from:start(30),to:today}]};
};
