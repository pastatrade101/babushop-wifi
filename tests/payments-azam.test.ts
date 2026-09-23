import {it,expect,afterEach} from 'vitest';
import {azamProvider,normalizePhone,snippeProvider} from '../packages/payments/src/index.ts';
import {paymentProvider,webhookUrl} from '../packages/payments/src/index.ts';

const KEYS=['PAYMENT_PROVIDER','AZAM_APP_NAME','AZAM_CLIENT_ID','AZAM_CLIENT_SECRET','AZAM_CALLBACK_TOKEN','AZAM_STATUS_BANK','SNIPPE_API_KEY','SNIPPE_WEBHOOK_SECRET','PUBLIC_API_URL','APP_ORIGIN'];
const saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
afterEach(()=>{for(const k of KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
const azamConfigured=()=>{process.env.AZAM_APP_NAME='JIACHIE';process.env.AZAM_CLIENT_ID='id';process.env.AZAM_CLIENT_SECRET='secret';process.env.AZAM_CALLBACK_TOKEN='tok';};

it('normalizes every shape a Tanzanian number is written in',()=>{
 for(const value of ['0712345678','712345678','+255712345678','255712345678','0712 345 678','+255 712-345-678'])
  expect(normalizePhone(value)).toBe('255712345678');
 expect(normalizePhone('0655000111')).toBe('255655000111');
 for(const bad of ['071234567','07123456789','0812345678','','abc'])expect(()=>normalizePhone(bad)).toThrow();
});

it('reads a callback whatever the network chose to call the fields',()=>{
 const viaUtilityRef=azamProvider.parseEvent({utilityref:'JW-ABC',transid:'T1',transactionstatus:'success',amount:'1000',currency:'TZS'});
 expect(viaUtilityRef).toMatchObject({ownReference:'JW-ABC',reference:'T1',status:'success',amount:1000});
 const viaExternalId=azamProvider.parseEvent({externalId:'JW-ABC',transactionId:'T2',status:'completed'});
 expect(viaExternalId).toMatchObject({ownReference:'JW-ABC',reference:'T2'});
 // additionalProperties wins: it is what we set, so it survives a network that
 // rewrites externalId into one of its own reference fields.
 const viaMetadata=azamProvider.parseEvent({additionalProperties:{intent_reference:'JW-OURS'},externalId:'THEIRS',fspReferenceId:'T3',status:'success'});
 expect(viaMetadata.ownReference).toBe('JW-OURS');
 // No reference at all is refused rather than guessed.
 expect(()=>azamProvider.parseEvent({status:'success'})).toThrow();
});

it('treats a retry of the same outcome as one event, and a change of state as another',()=>{
 const first=azamProvider.parseEvent({transid:'T9',status:'pending'});
 const retry=azamProvider.parseEvent({transid:'T9',status:'pending',message:'again'});
 const settled=azamProvider.parseEvent({transid:'T9',status:'success'});
 expect(first.id).toBe(retry.id);
 expect(settled.id).not.toBe(first.id);
});

it('does not read a failure as a payment',()=>{
 for(const status of ['success','successful','completed','transaction successful'])expect(azamProvider.isPaid(status)).toBe(true);
 for(const status of ['failed','cancelled','expired','insufficient balance','timeout','pending'])expect(azamProvider.isPaid(status)).toBe(false);
 for(const status of ['failed','cancelled','insufficient balance'])expect(azamProvider.isFailure(status)).toBe(true);
 expect(azamProvider.isFailure('pending')).toBe(false);
 // "transaction failed successfully" style strings must not settle a voucher.
 expect(azamProvider.isPaid('success but failed')).toBe(false);
});

it('rejects a callback that does not carry the shared secret',()=>{
 process.env.AZAM_CALLBACK_TOKEN='s3cret';
 expect(azamProvider.verifyWebhook('{}',{'x-callback-token':'s3cret'})).toBe(true);
 expect(azamProvider.verifyWebhook('{}',{authorization:'Bearer s3cret'})).toBe(true);
 expect(azamProvider.verifyWebhook('{}',{'x-callback-token':'wrong'})).toBe(false);
 expect(azamProvider.verifyWebhook('{}',{'x-callback-token':'s3cretX'})).toBe(false);
 expect(azamProvider.verifyWebhook('{}',{})).toBe(false);
 // No secret configured is a closed door, not an open one.
 delete process.env.AZAM_CALLBACK_TOKEN;
 expect(azamProvider.verifyWebhook('{}',{'x-callback-token':'anything'})).toBe(false);
});

it('will not confirm a payment it cannot ask about',async()=>{
 azamConfigured();
 delete process.env.AZAM_STATUS_BANK;
 // Unconfigured status lookup returns null, and purchases.ts treats null as
 // "not paid" -- an unsigned callback alone can never release a voucher.
 expect(await azamProvider.fetchStatus('T1')).toBeNull();
 expect(await azamProvider.fetchStatus('')).toBeNull();
 expect(azamProvider.confirmsOutOfBand).toBe(true);
 expect(snippeProvider.confirmsOutOfBand).toBe(false);
});

it('declares the flow the buy page has to render',()=>{
 expect(azamProvider.flow).toBe('push');
 expect(azamProvider.networks.map(n=>n.value)).toEqual(['vodacom','airtel','tigo','halopesa','azampesa']);
 expect(snippeProvider.flow).toBe('redirect');
 expect(snippeProvider.networks).toEqual([]);
});

it('never changes who takes the money by accident',()=>{
 for(const k of KEYS)delete process.env[k];
 expect(paymentProvider()).toBeNull();

 // Snippe alone stays Snippe, so deploying this change takes nothing offline.
 process.env.SNIPPE_API_KEY='k';process.env.SNIPPE_WEBHOOK_SECRET='s';
 expect(paymentProvider()?.name).toBe('snippe');

 // Adding AzamPay credentials is the cutover.
 azamConfigured();
 expect(paymentProvider()?.name).toBe('azam');

 // An explicit choice overrides the preference, in both directions.
 process.env.PAYMENT_PROVIDER='snippe';
 expect(paymentProvider()?.name).toBe('snippe');
 process.env.PAYMENT_PROVIDER='azam';
 expect(paymentProvider()?.name).toBe('azam');
 // Chosen but half-configured is disabled, not silently the other one.
 delete process.env.AZAM_CLIENT_SECRET;
 expect(paymentProvider()).toBeNull();
 process.env.PAYMENT_PROVIDER='paypal';
 expect(()=>paymentProvider()).toThrow('PAYMENT_PROVIDER must be one of');
});

it('builds our own callback URL, with the secret in the path for AzamPay',()=>{
 process.env.PUBLIC_API_URL='https://jiachie-wifi.com/';
 process.env.AZAM_CALLBACK_TOKEN='abc123';
 expect(webhookUrl('azam')).toBe('https://jiachie-wifi.com/api/v1/portal/payments/webhook/azam/abc123');
 expect(webhookUrl('snippe')).toBe('https://jiachie-wifi.com/api/v1/portal/payments/webhook/snippe');
});
