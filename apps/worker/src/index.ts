import {pool} from '../../../packages/database/src/index.ts';
import {processOne,housekeeping} from '../../../packages/database/src/access.ts';
import {expireStale} from '../../../packages/database/src/purchases.ts';
import {validateEnvironment} from '../../../packages/database/src/config.ts';
import {adapterFromEnv} from '../../../packages/omada/src/index.ts';
validateEnvironment();const adapter=adapterFromEnv();let running=true;
process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
console.info(`BABU-SHOP WIFI worker started (${adapter.mode})`);
// Abandoned checkouts free their own stock through the reserved_until filter,
// but their intent rows would otherwise sit PENDING for ever. Sweep them on a
// slow cadence; this is tidying, not a correctness guarantee.
let lastSweep=0;
while(running){try{await housekeeping();
 if(Date.now()-lastSweep>60000){lastSweep=Date.now();await expireStale().catch(()=>0);}if(process.env.NETWORK_PROVIDER==='mikrotik'&&adapter.mode==='live'||!await processOne(adapter))await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error('Worker operation failed; persisted work will be recovered.');await new Promise(resolve=>setTimeout(resolve,2000));}}
await pool.end();
