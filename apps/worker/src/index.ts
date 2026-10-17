import {pool} from '../../../packages/database/src/index.ts';
import {processOne,housekeeping} from '../../../packages/database/src/access.ts';
import {expireStale} from '../../../packages/database/src/purchases.ts';
import {deliverOne,deliverSmsOne,deliverWhatsAppOne,deliverCustomSmsOne} from '../../../packages/database/src/notifications.ts';
import {emailConfig,smsConfig,whatsappConfig,whatsappSetupIssue} from '../../../packages/notifications/src/index.ts';
import {validateEnvironment} from '../../../packages/database/src/config.ts';
import {adapterFromEnv} from '../../../packages/omada/src/index.ts';
validateEnvironment();const adapter=adapterFromEnv();let running=true;
process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
console.info(`JIACHIE WIFI worker started (${adapter.mode})`);
// Abandoned checkouts free their own stock through the reserved_until filter,
// but their intent rows would otherwise sit PENDING for ever. Sweep them on a
// slow cadence; this is tidying, not a correctness guarantee.
let lastSweep=0;
// Sale emails: checked every few seconds, a handful at a time, and fenced off
// so a mail problem is logged rather than stalling Wi-Fi authorization work.
const mail=emailConfig();let lastMail=0;
const sms=smsConfig();let lastSms=0;let lastCustom=0;
const wa=whatsappConfig();let lastWa=0;
console.info(sms?`Buyer SMS on: MoSMS (${sms.baseUrl}).`:'Buyer SMS off: set MOSMS_TOKEN to send each buyer their voucher by SMS.');
console.info(mail?`Sale emails on: ${mail.to.length} recipient(s)`:'Sale emails off: set RESEND_API_KEY and SALE_ALERT_EMAIL to turn them on');
console.info(wa?`Sale WhatsApp on: Makutano Connect, ${wa.to.length} number(s), ${wa.template?`template ${wa.template.name} (${wa.template.language})`:'free text (only reaches an owner who wrote to the business number in the last 24 hours)'}.`:`Sale WhatsApp off: ${whatsappSetupIssue()}.`);
while(running){try{await housekeeping();
 if(Date.now()-lastSweep>60000){lastSweep=Date.now();await expireStale().catch(()=>0);}
 if(mail&&Date.now()-lastMail>5000){lastMail=Date.now();try{for(let n=0;n<5&&await deliverOne(mail);n++);}catch{console.error('Sale email delivery failed; it will be retried.');}}
 if(sms&&Date.now()-lastSms>3000){lastSms=Date.now();try{for(let n=0;n<5&&await deliverSmsOne(sms);n++);}catch{console.error('Voucher SMS delivery failed; it will be retried.');}}
 // Custom SMS to Wi-Fi users: a few at a time, after the buyers' vouchers, well inside MoSMS's 60 a minute.
 if(sms&&Date.now()-lastCustom>10000){lastCustom=Date.now();try{for(let n=0;n<5&&await deliverCustomSmsOne(sms);n++);}catch{console.error('Custom SMS delivery failed; it will be retried.');}}
 if(wa&&Date.now()-lastWa>5000){lastWa=Date.now();try{for(let n=0;n<5&&await deliverWhatsAppOne(wa);n++);}catch{console.error('Sale WhatsApp delivery failed; it will be retried.');}}if(process.env.NETWORK_PROVIDER==='mikrotik'&&adapter.mode==='live'||!await processOne(adapter))await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error('Worker operation failed; persisted work will be recovered.');await new Promise(resolve=>setTimeout(resolve,2000));}}
await pool.end();
