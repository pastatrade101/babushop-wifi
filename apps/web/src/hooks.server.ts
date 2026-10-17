import {createServerClient} from '@supabase/ssr';
import {env} from '$env/dynamic/private';
import {error} from '@sveltejs/kit';
import type {Handle} from '@sveltejs/kit';
import {createHash} from 'node:crypto';
// Sessions Supabase confirmed in the last 30 seconds, by a hash of the access token: one page
// click is several requests, and each used to ask Supabase again (50 ms warm, ~500 ms cold).
const confirmed=new Map<string,{user:any;until:number}>();
export const handle:Handle=async({event,resolve})=>{
 event.locals.user=null;event.locals.accessToken=null;event.locals.supabase=null;event.locals.staff=null;
 if(['POST','PATCH','PUT','DELETE'].includes(event.request.method)&&event.request.headers.get('origin')!==event.url.origin)error(403,'Request origin is not allowed');
 // Customer portal never initializes Supabase, even if the browser has staff cookies.
 if(!event.url.pathname.startsWith('/portal')&&env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY){
  const client=createServerClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>event.cookies.getAll(),setAll:values=>{for(const {name,value,options} of values)event.cookies.set(name,value,{...options,path:'/',httpOnly:true,sameSite:'lax',secure:event.url.protocol==='https:'});}},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});event.locals.supabase=client;
  const {data:{session}}=await client.auth.getSession();if(session){const key=createHash('sha256').update(session.access_token).digest('hex'),hit=confirmed.get(key),now=Date.now();if(hit&&hit.until>now&&hit.user?.id===session.user.id){event.locals.user=hit.user;event.locals.accessToken=session.access_token;}else{const {data:{user},error:authError}=await client.auth.getUser();if(!authError&&user?.id===session.user.id){event.locals.user=user;event.locals.accessToken=session.access_token;if(confirmed.size>500)confirmed.clear();confirmed.set(key,{user,until:now+30_000});}}}
 }
 const response=await resolve(event);if(!event.url.pathname.startsWith('/_app/'))response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','same-origin');response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return response;
};
