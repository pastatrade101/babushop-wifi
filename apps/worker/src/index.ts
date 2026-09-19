import {pool} from '../../../packages/database/src/index.ts';
import {processOne,housekeeping} from '../../../packages/database/src/access.ts';
import {validateEnvironment} from '../../../packages/database/src/config.ts';
import {adapterFromEnv} from '../../../packages/omada/src/index.ts';
validateEnvironment();const adapter=adapterFromEnv();let running=true;
process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
console.info(`BABU-SHOP WIFI worker started (${adapter.mode})`);
while(running){try{await housekeeping();if(!await processOne(adapter))await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error('Worker operation failed; persisted work will be recovered.');await new Promise(resolve=>setTimeout(resolve,2000));}}
await pool.end();
