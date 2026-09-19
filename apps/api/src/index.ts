import {buildApp} from './app.ts';
import {validateEnvironment} from '../../../packages/database/src/config.ts';
import {pool} from '../../../packages/database/src/index.ts';
validateEnvironment();const app=await buildApp({logger:true});
await app.listen({host:process.env.API_HOST||'127.0.0.1',port:Number(process.env.API_PORT||4000)});
async function stop(){await app.close();await pool.end();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
