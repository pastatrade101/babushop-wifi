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
 const [menus,overview,view,files]=await Promise.all([
  api(event,'/network/router/menus'),
  api(event,'/network/router/overview').catch(failed),
  // The terminal has no list to load; it talks through the action below.
  menu==='terminal'?Promise.resolve({terminal:true}):
  // Every window closed: WinBox's empty workspace.
  menu==='none'?Promise.resolve({none:true}):
  /^[a-z0-9-]{1,40}$/.test(menu)?api(event,'/network/router/menus/'+menu).catch(failed):Promise.resolve({error:'Unknown router menu'}),
  // Whether hotspot uploads are set up, and into which folder. Files window only.
  menu==='files'?api(event,'/network/router/files/capability').catch(()=>null):Promise.resolve(null),
 ]);
 return {menus,overview,view,menu,files};
};

const TEXT_FILE=60000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const actions={
 // A hotspot page, from the Files window. The API checks the name, type and
 // size again, keeps the file it replaces, and verifies the router's copy.
 upload:async(event:any)=>{
  const form=await event.request.formData();
  const file=form.get('file');
  if(!(file instanceof File)||!file.size)return fail(400,{upload:{ok:false,message:'Choose a file to upload.'}});
  if(file.size>TEXT_FILE)return fail(400,{upload:{ok:false,message:`The file is ${Math.ceil(file.size/1024)} KB; the router accepts at most 60 KB.`}});
  const name=String(form.get('name')||file.name).trim().slice(0,130);
  try{
   const result=await api(event,'/network/router/files',{name,contents:await file.text()});
   return {upload:{ok:true,message:result.replaced?`Replaced ${result.name}. The previous version is in its History.`:`Created ${result.name}.`}};
  }catch(e){return fail(502,{upload:{ok:false,message:(e as Error).message}});}
 },
 restore:async(event:any)=>{
  const id=String((await event.request.formData()).get('id')??'');
  if(!uuid.test(id))return fail(400,{restore:{ok:false,message:'Unknown version.'}});
  try{
   const result=await api(event,`/network/router/files/versions/${id}/restore`,{});
   return {restore:{ok:true,message:`Restored ${result.name}. The version it replaced is in History too.`}};
  }catch(e){return fail(502,{restore:{ok:false,message:(e as Error).message}});}
 },
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
