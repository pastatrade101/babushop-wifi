import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {pool,tx,audit,requireValue,Problem,type Staff,type Role} from './index.ts';
import {mailerConfig,sendEmail,renderStaffInvite,isEmail} from '../../notifications/src/index.ts';

// Staff accounts: inviting, re-inviting, and recording when set-up is done.
//
// An invite is three things, in order: an account in Supabase Auth with no
// password yet, a profile row here, and an email carrying a one-time link to
// the page where the person chooses their own password. The API is the only
// holder of the admin key that makes the first step possible, and this module
// is the only code that uses it. Nothing is ever sent to the person but that
// link -- no temporary password exists to be shared, guessed or reused.

const ROLES:Role[]=['ADMIN','CASHIER','SALES'];

/** Why invites cannot be sent right now, or null when they can. */
export function inviteBlocker(env:NodeJS.ProcessEnv=process.env):string|null{
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return 'Staff invites need SUPABASE_SECRET_KEY on the API server.';
 if(!mailerConfig(env))return 'Staff invites need RESEND_API_KEY on the API server.';
 if(!env.APP_ORIGIN)return 'Staff invites need APP_ORIGIN on the API server.';
 return null;
}
export const inviteStatus=()=>{const reason=inviteBlocker();return {enabled:!reason,reason};};

const adminClient=():SupabaseClient=>createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const origin=()=>process.env.APP_ORIGIN!.replace(/\/+$/,'');

/**
 * A one-time link to /welcome. Supabase creates the account when the address
 * is new, re-keys the link when the account exists but has never signed in,
 * and refuses an address that already has a password.
 */
async function inviteLink(client:SupabaseClient,email:string,name:string){
 const {data,error}=await client.auth.admin.generateLink({type:'invite',email,options:{data:{display_name:name}}});
 if(error||!data.user||!data.properties?.hashed_token){
  const message=error?.message||'';
  if(/already/i.test(message))throw new Problem(409,'That email address already has an account.');
  throw new Problem(502,'Supabase could not create the invite: '+(message||'no link returned').slice(0,160));
 }
 return {userId:data.user.id,link:`${origin()}/welcome?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`};
}

async function deliver(actor:Staff,to:{email:string;name:string;role:Role},link:string){
 const mailer=mailerConfig()!;
 const email=renderStaffInvite({name:to.name,email:to.email,role:to.role,invitedBy:actor.display_name,link},{brand:process.env.WIFI_BRAND||'JIACHIE WIFI',portalOrigin:origin()});
 const result=await sendEmail({from:mailer.from,to:[to.email],...email},mailer.apiKey);
 if(!result.ok)throw new Problem(502,'The invite email could not be sent: '+result.error);
}

/** Create the account, the profile and the email together; if any part fails, none of it stays. */
export async function invite(actor:Staff,input:{email:string;display_name:string;role:string}){
 const blocker=inviteBlocker();if(blocker)throw new Problem(503,blocker);
 const email=input.email.trim().toLowerCase(),name=input.display_name.trim(),role=input.role as Role;
 requireValue(isEmail(email),400,'Enter a valid email address.');
 requireValue(name.length>=1&&name.length<=80,400,"Enter the person's name.");
 requireValue(ROLES.includes(role),400,'Choose a role.');
 const existing=(await pool.query('select activated_at from wifi.staff_profiles where email=$1',[email])).rows[0];
 requireValue(!existing,409,existing?.activated_at?'That person already has an account.':'That person has already been invited. Use "Resend invite" on their row.');
 const client=adminClient();
 const {userId,link}=await inviteLink(client,email,name);
 try{
  // The email goes out inside the transaction: if it cannot be sent, the
  // profile row and its audit entry roll back with it.
  await tx(async db=>{
   await db.query('insert into wifi.staff_profiles(id,display_name,role,email,invited_by,invited_at) values($1,$2,$3,$4,$5,now())',[userId,name,role,email,actor.id]);
   await audit(db,actor.id,'STAFF_INVITED',userId,{email,role});
   await deliver(actor,{email,name,role},link);
  });
 }catch(error){
  // An invite that never reached the person leaves nothing behind.
  await client.auth.admin.deleteUser(userId).catch(()=>undefined);
  throw error;
 }
 return {id:userId,email,display_name:name,role};
}

/** A fresh link for someone who has not set up yet. The earlier link stops working. */
export async function resendInvite(actor:Staff,id:string){
 const blocker=inviteBlocker();if(blocker)throw new Problem(503,blocker);
 const row=(await pool.query('select id,display_name,role,email,activated_at from wifi.staff_profiles where id=$1',[id])).rows[0];
 requireValue(row,404,'Staff member not found');
 requireValue(!row.activated_at,409,'This person has already set up their account.');
 requireValue(row.email,409,'This account has no email address on file.');
 const client=adminClient();
 const {userId,link}=await inviteLink(client,row.email,row.display_name);
 if(userId!==row.id){
  // The Supabase account behind this row is gone; the link just made belongs
  // to a fresh one that matches nothing here. Remove it rather than keep two.
  await client.auth.admin.deleteUser(userId).catch(()=>undefined);
  throw new Problem(409,'The sign-in account for this person no longer exists. Disable this row and invite them again.');
 }
 await deliver(actor,{email:row.email,name:row.display_name,role:row.role},link);
 await pool.query('update wifi.staff_profiles set invited_at=now(),invited_by=$2 where id=$1',[row.id,actor.id]);
 await audit(pool,actor.id,'STAFF_INVITE_RESENT',row.id,{email:row.email});
 return {ok:true};
}

/** Called once the person has chosen a password from their invite link. */
export async function activate(staff:Staff){
 const row=(await pool.query('update wifi.staff_profiles set activated_at=now() where id=$1 and activated_at is null returning id',[staff.id])).rows[0];
 if(row)await audit(pool,staff.id,'STAFF_ACTIVATED',staff.id,{});
 return {ok:true};
}
