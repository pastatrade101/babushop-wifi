import {createClient} from '@supabase/supabase-js';
import {pool,audit,Problem} from '../../../packages/database/src/index.ts';

// Sign-in for the JIACHIE WIFI phone app. The phone knows only this API; the
// Supabase project stays behind it. A session is Supabase's own access token
// (what every other API call already accepts) plus its refresh token, and is
// handed out only to an enabled staff member.

const client=()=>{
 // A fresh client per call: a sign-in must never leave one person's session in a shared client.
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Problem(503,'Sign-in is not available right now.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
};

type SupabaseSession={access_token:string;refresh_token:string;expires_at?:number;expires_in:number;user:{id:string;email?:string}};

async function staffSession(session:SupabaseSession|null){
 if(!session?.access_token||!session.user?.id)throw new Problem(401,'Wrong email or password.');
 const staff=(await pool.query('select id,display_name,role,enabled from wifi.staff_profiles where id=$1',[session.user.id])).rows[0];
 if(!staff?.enabled)throw new Problem(403,'This account has no access to JIACHIE WIFI.');
 return {
  access_token:session.access_token,refresh_token:session.refresh_token,
  expires_at:session.expires_at??Math.floor(Date.now()/1000)+(session.expires_in||3600),
  staff:{id:staff.id as string,name:(staff.display_name||'') as string,email:session.user.email??'',role:staff.role as string},
  brand:process.env.WIFI_BRAND||'JIACHIE WIFI',
 };
}

export async function mobileLogin(email:string,password:string){
 const {data,error}=await client().auth.signInWithPassword({email:email.trim().toLowerCase(),password});
 if(error||!data.session)throw new Problem(401,'Wrong email or password.');
 const out=await staffSession(data.session as SupabaseSession);
 await audit(pool,out.staff.id,'MOBILE_SIGNED_IN',null,{});
 return out;
}

export async function mobileRefresh(refreshToken:string){
 const {data,error}=await client().auth.refreshSession({refresh_token:refreshToken});
 if(error||!data.session)throw new Problem(401,'Please sign in again.');
 return staffSession(data.session as SupabaseSession);
}
