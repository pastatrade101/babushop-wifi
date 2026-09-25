import {connection} from '../packages/database/src/connection.ts';
import {readFileSync,writeFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';import {parse} from 'dotenv';import pg from 'pg';
const file=process.env.BABU_ENV_FILE||'.env';const original=readFileSync(file,'utf8'),e=parse(original);const url=new URL(e.DATABASE_ADMIN_URL);url.searchParams.set('sslmode','verify-full');
const db=new pg.Client({...connection(url.toString()),connectionTimeoutMillis:15000});await db.connect();
try{const role='babu_app',password=randomBytes(32).toString('hex');const exists=(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount;
 if(exists&&!e.DATABASE_URL)throw new Error('Runtime role already exists; configure its existing connection instead of rotating credentials automatically.');
 let runtime=e.DATABASE_URL;
 if(!exists){await db.query('begin');await db.query(`create role babu_app login password '${password}'`);await db.query('grant babu_runtime to babu_app');await db.query('commit');const r=new URL(url);const username=decodeURIComponent(r.username);r.username='babu_app'+(username.includes('.')?'.'+username.split('.').slice(1).join('.'):'');r.password=password;runtime=r.toString();}
 const test=new pg.Client({...connection(runtime),connectionTimeoutMillis:15000});await test.connect();await test.query('select id from wifi.sites limit 1');await test.end();
 const additions:Record<string,string>={DATABASE_URL:runtime!,SUPABASE_PUBLISHABLE_KEY:e.SUPABASE_PUBLISHABLE_KEY||e.SUPABASE_ANON_KEY,SUPABASE_SECRET_KEY:e.SUPABASE_SECRET_KEY||e.SUPABASE_SERVICE_ROLE_KEY,WIFI_BRAND:'JIACHIE WIFI',APP_ORIGIN:'http://127.0.0.1:5188',OMADA_MODE:'mock',PORTAL_SITE:'babu-shop',PORTAL_SSID:'JIACHIE WIFI',PORTAL_AP_MACS:'AA:BB:CC:DD:EE:01'};
 for(const name of ['VOUCHER_LOOKUP_KEY','VOUCHER_ENCRYPTION_KEY','PORTAL_CONTEXT_SECRET'])if(!e[name])additions[name]=randomBytes(32).toString('hex');
 let text=original.trimEnd()+'\n\n# JIACHIE WIFI Phase 1 settings\n';for(const [name,value] of Object.entries(additions))if(!e[name])text+=name+'='+JSON.stringify(value)+'\n';writeFileSync(file,text,{mode:0o600});console.info('Restricted runtime connection verified. Missing Phase 1 settings added; existing secrets preserved.');
}finally{await db.end();}
