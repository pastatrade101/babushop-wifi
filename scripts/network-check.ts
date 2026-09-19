import {config} from 'dotenv';
import {networkPlan,checkMikroTik} from '../packages/network/src/index.ts';
config({quiet:true});
const plan=networkPlan();console.info(`Network: ${plan.provider}; download ${plan.download_mbps} Mbps; upload ${plan.upload_mbps??'unconfirmed'}.`);
const result=await checkMikroTik();console.info(result.message);console.info('Commissioning: pending. No router settings were changed.');if(!result.ok)process.exitCode=1;
