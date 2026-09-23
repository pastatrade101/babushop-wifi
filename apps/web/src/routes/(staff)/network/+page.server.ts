import {error} from '@sveltejs/kit';
import {api} from '$lib/server/api';

export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 const sites=await api(event,'/network/sites');
 // One live read per site. A site whose router is unreachable still gets a card,
 // showing that it is offline rather than disappearing from the list.
 const statuses=await Promise.all(sites.items.map(async(site:any)=>{
  try{return {id:site.id,status:await api(event,'/network/sites/'+site.id+'/status')};}
  catch(e){return {id:site.id,status:null,error:(e as Error).message};}
 }));
 return {sites,statuses:Object.fromEntries(statuses.map(s=>[s.id,s]))};
};
