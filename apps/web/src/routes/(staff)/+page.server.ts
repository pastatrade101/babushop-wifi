import {api} from '$lib/server/api';
export const load=async(event:any)=>{
 const parent=await event.parent(),admin=parent.staff.role==='ADMIN';
 return {
  metrics:await api(event,'/dashboard'),
  integration:admin?await api(event,parent.networkProvider==='mikrotik'?'/integrations/network/status':'/integrations/omada/status'):null
 };
};
