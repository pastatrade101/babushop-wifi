import {api} from '$lib/server/api';
export const load=async(event:any)=>{const parent=await event.parent();return {metrics:await api(event,'/dashboard'),integration:parent.staff.role==='ADMIN'?await api(event,'/integrations/omada/status'):null};};
