import {connection} from '../packages/database/src/connection.ts';
import 'dotenv/config';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
if(process.env.NODE_ENV==='production')throw new Error('Development seed is disabled in production');
if(!process.env.DATABASE_ADMIN_URL)throw new Error('Set DATABASE_ADMIN_URL for development seed');
const db=new pg.Client({...connection(process.env.DATABASE_ADMIN_URL)});await db.connect();try{await db.query(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));console.info('Development packages seeded; no staff accounts were created.');}finally{await db.end();}
