import {key} from './crypto.ts';
export function validateEnvironment(){
 for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN','PORTAL_SITE','PORTAL_SSID','PORTAL_AP_MACS'])if(!process.env[name])throw new Error(`${name} is required`);
 for(const name of ['VOUCHER_LOOKUP_KEY','VOUCHER_ENCRYPTION_KEY','PORTAL_CONTEXT_SECRET'])key(name);
 if(process.env.VOUCHER_LOOKUP_KEY===process.env.VOUCHER_ENCRYPTION_KEY)throw new Error('Voucher keys must be independent');
 if(!['mock','live'].includes(process.env.OMADA_MODE||''))throw new Error('Select an explicit OMADA_MODE');
 const origin=new URL(process.env.APP_ORIGIN!);if(process.env.NODE_ENV==='production'&&origin.protocol!=='https:')throw new Error('Production requires HTTPS APP_ORIGIN');
 if(!Number.isInteger(Number(process.env.MAX_BATCH_SIZE||100))||Number(process.env.MAX_BATCH_SIZE||100)>1000)throw new Error('Invalid MAX_BATCH_SIZE');
}
