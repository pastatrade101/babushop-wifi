import {error} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// Money and stock for a chosen period, plus what people and the system did.
// Dates are Tanzania's local days; with none given, the API reports today.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const q=event.url.searchParams;
 const from=DAY.test(q.get('from')??'')?q.get('from')!:'';
 const to=DAY.test(q.get('to')??'')?q.get('to')!:'';
 const page=Math.min(200,Math.max(1,Math.floor(Number(q.get('page'))||1)));
 const range=new URLSearchParams();if(from)range.set('from',from);if(to)range.set('to',to);
 const [totals,inventory,audit]=await Promise.all([
  api(event,'/reports/sales?'+range),
  api(event,'/reports/inventory'),
  api(event,'/audit?page='+page),
 ]);
 return {totals,inventory,audit,query:{from,to,page}};
};
