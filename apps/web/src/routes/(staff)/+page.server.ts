import {api} from '$lib/server/api';
export const load=async(event:any)=>{
 const parent=await event.parent(),admin=parent.staff.role==='ADMIN';
 // Charts are an admin view -- they expose shop revenue, which cashiers cannot
 // read. A failing chart must never take the whole dashboard down with it, so
 // each falls back to empty and the panel says so.
 const [trend,byPackage]=admin
  ? await Promise.all([
     api(event,'/reports/trend?days=30').catch(()=>({items:[]})),
     api(event,'/reports/by-package?days=30').catch(()=>({items:[]}))])
  : [{items:[]},{items:[]}];
 return {
  metrics:await api(event,'/dashboard'),
  integration:admin?await api(event,parent.networkProvider==='mikrotik'?'/integrations/network/status':'/integrations/omada/status'):null,
  trend:trend.items,byPackage:byPackage.items
 };
};
