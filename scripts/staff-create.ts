import {connection} from '../packages/database/src/connection.ts';
import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
const rl=createInterface({input:stdin,output:stdout});
try{
 const email=(await rl.question('Staff email: ')).trim(),name=(await rl.question('Display name: ')).trim(),role=(await rl.question('Role (ADMIN or CASHIER): ')).trim().toUpperCase();
 if(!email.includes('@')||!name||!['ADMIN','CASHIER'].includes(role))throw new Error('Invalid staff details');
 // Password comes from an ephemeral environment variable: never printed or placed in shell arguments.
 const password=process.env.STAFF_INITIAL_PASSWORD;if(!password||password.length<12)throw new Error('Set STAFF_INITIAL_PASSWORD to a unique password of at least 12 characters, then unset it after this command.');
 if(!process.env.SUPABASE_SECRET_KEY||!process.env.DATABASE_ADMIN_URL)throw new Error('Bootstrap needs SUPABASE_SECRET_KEY and DATABASE_ADMIN_URL');
 const supabase=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await supabase.auth.admin.createUser({email,password,email_confirm:true});if(error||!data.user)throw new Error(error?.message||'Staff account creation failed');
 const db=new pg.Client({...connection(process.env.DATABASE_ADMIN_URL)});
 try{await db.connect();await db.query('begin');await db.query('insert into wifi.staff_profiles(id,display_name,role) values($1,$2,$3)',[data.user.id,name,role]);await db.query("insert into wifi.audit_logs(actor_id,action,entity_id) values($1,'STAFF_CREATED',$1)",[data.user.id]);await db.query('commit');console.info('Staff account created. Share the password privately.');}
 catch(e){await supabase.auth.admin.deleteUser(data.user.id);throw e;}finally{await db.end();}
}finally{rl.close();}
