import {createServerClient} from '@supabase/ssr';
import {env} from '$env/dynamic/private';
import {error} from '@sveltejs/kit';
import type {Handle} from '@sveltejs/kit';
export const handle:Handle=async({event,resolve})=>{
 event.locals.user=null;event.locals.accessToken=null;event.locals.supabase=null;event.locals.staff=null;
 if(['POST','PATCH','PUT','DELETE'].includes(event.request.method)&&event.request.headers.get('origin')!==event.url.origin)error(403,'Request origin is not allowed');
 // Customer portal never initializes Supabase, even if the browser has staff cookies.
 if(!event.url.pathname.startsWith('/portal')&&env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY){
  const client=createServerClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>event.cookies.getAll(),setAll:values=>{for(const {name,value,options} of values)event.cookies.set(name,value,{...options,path:'/',httpOnly:true,sameSite:'lax',secure:event.url.protocol==='https:'});}},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});event.locals.supabase=client;
  const {data:{session}}=await client.auth.getSession();if(session){const {data:{user},error:authError}=await client.auth.getUser();if(!authError&&user?.id===session.user.id){event.locals.user=user;event.locals.accessToken=session.access_token;}}
 }
 const response=await resolve(event);if(!event.url.pathname.startsWith('/_app/'))response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','same-origin');response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return response;
};
