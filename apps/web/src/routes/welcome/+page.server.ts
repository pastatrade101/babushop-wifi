import {fail,redirect} from '@sveltejs/kit';
import {brand,api} from '$lib/server/api';

// Where an invite link lands. The page shows a password form; nothing is
// verified until it is submitted, so a mail scanner that opens the link does
// not use up the one-time token. On submit the token becomes a session, the
// password is set on it, and the person is signed in.

const TOKEN=/^[A-Za-z0-9._:-]{16,512}$/;
const MIN_PASSWORD=10;
const attempts=new Map<string,{count:number;until:number}>();

export const load=async(event:any)=>({brand:brand(),token:TOKEN.test(event.url.searchParams.get('token_hash')??'')?event.url.searchParams.get('token_hash'):'',min:MIN_PASSWORD});

export const actions={
 default:async(event:any)=>{
  const now=Date.now(),ip=event.getClientAddress();
  for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  const rate=attempts.get(ip)||{count:0,until:now+60000};rate.count++;attempts.set(ip,rate);
  if(rate.count>10)return fail(429,{error:'Please wait a minute before trying again.',expired:false});

  const f=await event.request.formData();
  const token=String(f.get('token_hash')||''),password=String(f.get('password')||''),confirm=String(f.get('confirm')||'');
  if(!TOKEN.test(token))return fail(400,{error:'This link is incomplete. Open the invite email again and use the button in it.',expired:false});
  if(password.length<MIN_PASSWORD||password.length>200)return fail(400,{error:`Choose a password of at least ${MIN_PASSWORD} characters.`,expired:false});
  if(password!==confirm)return fail(400,{error:'The two passwords do not match.',expired:false});
  if(!event.locals.supabase)return fail(503,{error:'Sign-in is not configured on this server.',expired:false});

  const {data,error}=await event.locals.supabase.auth.verifyOtp({token_hash:token,type:'invite'});
  if(error||!data.session)return fail(400,{error:'This invite link is invalid or has already been used. Ask your administrator to send a new one.',expired:true});
  const {error:pwError}=await event.locals.supabase.auth.updateUser({password});
  if(pwError){
   // The link is spent but no password was saved: sign the session out so the
   // person is not left half in, and have them ask for a fresh invite.
   await event.locals.supabase.auth.signOut();
   return fail(400,{error:'That password was not accepted ('+pwError.message+'). Ask your administrator to send a new invite.',expired:true});
  }
  event.locals.accessToken=data.session.access_token;
  try{await api(event,'/staff/activate',{});}catch{/* signed in either way; the Staff page catches up on their next visit */}
  redirect(303,'/');
 },
};
