import {readFileSync} from 'node:fs';
import type {ClientConfig} from 'pg';
export function connection(connectionString:string|undefined):ClientConfig{
 if(!connectionString)return {};
 const url=new URL(connectionString);
 if(url.hostname.endsWith('.supabase.com')||url.hostname.endsWith('.supabase.co')||process.env.DATABASE_CA_PATH){
  // URL ssl parameters override pg's ssl object: remove them and apply verified TLS explicitly.
  for(const name of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(name);
  const ca=readFileSync(process.env.DATABASE_CA_PATH||new URL('../../../infra/certs/supabase-prod-ca.crt',import.meta.url));
  return {connectionString:url.toString(),ssl:{ca,rejectUnauthorized:true}};
 }
 return {connectionString};
}
