import {error,fail} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// The router console. Every read goes browser -> portal -> API -> router, and
// the browser only ever names a menu from the API's own list.
export const load=async(event:any)=>{
 const parent=await event.parent();
 if(parent.staff.role!=='ADMIN')error(403,'Administrator access required');
 // Auto-refresh re-runs only this load, not the whole workspace.
 event.depends('app:router');
 const menu=event.url.searchParams.get('menu')||'interfaces';
 const failed=(e:unknown)=>{
  const message=(e as Error).message;
  return {error:/abort|timeout/i.test(message)?'The router took too long to answer. Press Refresh to try again.':message};
 };
 const [menus,overview,view]=await Promise.all([
  api(event,'/network/router/menus'),
  api(event,'/network/router/overview').catch(failed),
  // The terminal has no list to load; it talks through the action below.
  menu==='terminal'?Promise.resolve({terminal:true}):
  /^[a-z0-9-]{1,40}$/.test(menu)?api(event,'/network/router/menus/'+menu).catch(failed):Promise.resolve({error:'Unknown router menu'}),
 ]);
 return {menus,overview,view,menu};
};

export const actions={
 // One terminal line. The API parses it and allows only print, ping and help.
 terminal:async(event:any)=>{
  const form=await event.request.formData();
  const command=String(form.get('command')??'').slice(0,200);
  try{return await api(event,'/network/router/terminal',{command});}
  catch(e){
   const message=(e as Error).message;
   return fail(503,{ok:false,output:/abort|timeout/i.test(message)?'failure: the router took too long to answer':'failure: '+message});
  }
 },
};
