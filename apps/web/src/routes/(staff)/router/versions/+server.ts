import {json,error} from '@sveltejs/kit';
import {api} from '$lib/server/api';

// A hotspot file's saved versions, for the Files window's History. The API
// allows administrators only.
export const GET=async(event:any)=>{
 const name=event.url.searchParams.get('name')??'';
 try{return json(await api(event,'/network/router/files/versions?'+new URLSearchParams({name})));}
 catch(e){error(502,(e as Error).message);}
};
