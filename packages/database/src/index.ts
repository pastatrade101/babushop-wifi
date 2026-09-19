import pg from 'pg';
import {connection} from './connection.ts';
export const pool = new pg.Pool({...connection(process.env.DATABASE_URL),max:10,connectionTimeoutMillis:5000,statement_timeout:10000,application_name:'babu-shop-wifi'});
pool.on('error',()=>console.error('Database connection interrupted; subsequent requests will reconnect.'));
export type DB = Pick<pg.PoolClient,'query'>;
export async function tx<T>(fn:(db:DB)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('begin');const result=await fn(c);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
export async function audit(db:DB,actor:string|null,action:string,id:string|null,details:object={}){await db.query('insert into wifi.audit_logs(actor_id,action,entity_id,details) values($1,$2,$3,$4)',[actor,action,id,details]);}
export class Problem extends Error {constructor(public status:number,message:string){super(message);}}
export function requireValue(condition:unknown,status:number,message:string):asserts condition {if(!condition)throw new Problem(status,message);}
export type Staff={id:string;role:'ADMIN'|'CASHIER';display_name:string;enabled:boolean};
export const SITE='00000000-0000-4000-8000-000000000001';
