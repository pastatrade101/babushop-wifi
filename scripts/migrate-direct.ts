import {connection} from '../packages/database/src/connection.ts';
/** Applies the canonical Supabase SQL files and records Supabase CLI-compatible history. */
import {config} from 'dotenv';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
config({path:process.env.BABU_ENV_FILE||'.env',quiet:true});
const url=process.env.DATABASE_ADMIN_URL;if(!url)throw new Error('DATABASE_ADMIN_URL is required for migration');
const db=new pg.Client({...connection(url),connectionTimeoutMillis:15000,statement_timeout:60000});
try{
 await db.connect();const target=(await db.query("select current_database() name,current_user role,to_regnamespace('wifi') is not null schema_exists")).rows[0];console.info(`Connected to database ${target.name}. Existing wifi schema: ${target.schema_exists}.`);
 await db.query('begin');await db.query('select pg_advisory_xact_lock(884422)');
 await db.query('create schema if not exists supabase_migrations');
 await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)');
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(v=>/^\d+_.+\.sql$/.test(v)).sort()){
  const version=file.split('_')[0];if((await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rowCount){console.info(`Already applied: ${file}`);continue;}
  const sql=await readFile(new URL(file,dir),'utf8');await db.query(sql);await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,file.slice(version.length+1,-4),[sql]]);console.info(`Applied: ${file}`);
 }
 await db.query("insert into wifi.sites(id,name) values('00000000-0000-4000-8000-000000000001',$1) on conflict do nothing",[process.env.WIFI_BRAND||'JIACHIE WIFI']);
 await db.query('commit');const count=(await db.query("select count(*)::int n from pg_tables where schemaname='wifi'")).rows[0].n;console.info(`Migration committed. ${count} business tables; initial site ready. Existing application tables were not modified.`);
}catch(e){await db.query('rollback').catch(()=>{});console.error('Migration failed; transaction rolled back:',e instanceof Error?e.message:'database error');process.exitCode=1;}finally{await db.end();}
