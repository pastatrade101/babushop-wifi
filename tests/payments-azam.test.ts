import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {azamProvider,normalizePhone,snippeProvider,callbackShape} from '../packages/payments/src/index.ts';
import {paymentProvider,webhookUrl} from '../packages/payments/src/index.ts';

const KEYS=['PAYMENT_PROVIDER','AZAM_CHECKOUT_URL','AZAM_SOURCE','AZAM_CALLBACK_PUBLIC_KEY','AZAM_ALLOW_UNSIGNED_CALLBACKS','AZAM_APP_NAME','AZAM_CLIENT_ID','AZAM_CLIENT_SECRET','AZAM_CALLBACK_TOKEN','SNIPPE_API_KEY','SNIPPE_WEBHOOK_SECRET','PUBLIC_API_URL','APP_ORIGIN'];
const saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
afterEach(()=>{for(const k of KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
const azamConfigured=()=>{process.env.AZAM_APP_NAME='JIACHIE';process.env.AZAM_CLIENT_ID='id';process.env.AZAM_CLIENT_SECRET='secret';process.env.AZAM_CALLBACK_TOKEN='tok';};

it('sends the local 0XXXXXXXXX form, which is what actually reaches handsets',()=>{
 for(const value of ['0712345678','712345678','+255712345678','255712345678','0712 345 678','+255 712-345-678'])
  expect(normalizePhone(value)).toBe('0712345678');
 expect(normalizePhone('0655000111')).toBe('0655000111');
 // Exactly the shape the settling partner's integration validates.
 expect(/^0\d{9}$/.test(normalizePhone('+255 712 345 678'))).toBe(true);
 for(const bad of ['071234567','07123456789','0812345678','','abc'])expect(()=>normalizePhone(bad)).toThrow();
});

it('maps every network AzamPay accepts, and nothing it does not',async()=>{
 // Airtel, Tigo, Halopesa, Azampesa, Mpesa -- the documented enum.
 expect(azamProvider.networks.map(n=>n.value)).toEqual(['vodacom','airtel','tigo','halopesa','azampesa']);
 azamConfigured();
 const seen:string[]=[];
 const realFetch=globalThis.fetch;
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).includes('GenerateToken'))return new Response(JSON.stringify({data:{accessToken:'t'}}),{status:200});
  seen.push(JSON.parse(init.body).provider);
  return new Response(JSON.stringify({transactionId:'TX'}),{status:200});
 }) as any;
 try{
  for(const network of ['vodacom','airtel','tigo','halopesa','azampesa'])
   await azamProvider.createCheckout({amount:1000,currency:'TZS',description:'d',reference:'JW-N',
    customer:{phone:'0712345678'},network,returnUrl:'https://x/y',webhookUrl:'https://x/w'});
  expect(seen).toEqual(['Mpesa','Airtel','Tigo','Halopesa','Azampesa']);
 }finally{globalThis.fetch=realFetch;}
});

it('prefers property2 for the reference, as AzamPay guarantees to carry it',()=>{
 const viaProperty2=azamProvider.parseEvent({additionalProperties:{property2:'JW-P2',intent_reference:'JW-CUSTOM'},transid:'T7',status:'success'});
 expect(viaProperty2.ownReference).toBe('JW-P2');
 const viaCustom=azamProvider.parseEvent({additionalProperties:{intent_reference:'JW-CUSTOM'},transid:'T7',status:'success'});
 expect(viaCustom.ownReference).toBe('JW-CUSTOM');
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

// AzamPay signs utilityref + externalreference + transactionstatus + operator,
// concatenated in that order, with RSA PKCS#1 v1.5 over SHA-256, base64.
const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const signed=(body:Record<string,unknown>,key=keys.privateKey)=>{
 const message=['utilityref','externalreference','transactionstatus','operator'].map(n=>String(body[n]??'')).join('');
 return JSON.stringify({...body,signature:createSign('RSA-SHA256').update(message).end().sign(key,'base64')});
};
const CALLBACK={utilityref:'JW-ABC',externalreference:'EXT1',transactionstatus:'success',operator:'Mpesa',amount:'1000'};

it('needs both the URL secret and a real signature',()=>{
 process.env.AZAM_CALLBACK_TOKEN='s3cret';
 process.env.AZAM_CALLBACK_PUBLIC_KEY=keys.publicKey;
 const body=signed(CALLBACK);
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'s3cret'})).toBe(true);
 expect(azamProvider.verifyWebhook(body,{authorization:'Bearer s3cret'})).toBe(true);
 // Right signature, wrong secret.
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'wrong'})).toBe(false);
 expect(azamProvider.verifyWebhook(body,{})).toBe(false);
 // Right secret, no signature: this is the forgery the secret alone cannot stop.
 expect(azamProvider.verifyWebhook(JSON.stringify(CALLBACK),{'x-callback-token':'s3cret'})).toBe(false);
 // Right secret, signature from somebody else's key.
 const other=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 expect(azamProvider.verifyWebhook(signed(CALLBACK,other.privateKey),{'x-callback-token':'s3cret'})).toBe(false);
 // A signature that covers a different amount than the body now claims.
 expect(azamProvider.verifyWebhook(signed({...CALLBACK,transactionstatus:'failed'}).replace('"failed"','"success"'),{'x-callback-token':'s3cret'})).toBe(false);
 // Not JSON at all.
 expect(azamProvider.verifyWebhook('not json',{'x-callback-token':'s3cret'})).toBe(false);
 // No secret configured is a closed door, not an open one.
 delete process.env.AZAM_CALLBACK_TOKEN;
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'anything'})).toBe(false);
});

it('fails closed when no public key is configured',()=>{
 process.env.AZAM_CALLBACK_TOKEN='s3cret';
 delete process.env.AZAM_CALLBACK_PUBLIC_KEY;
 const body=signed(CALLBACK);
 // Refused by default: an unverifiable callback is the only thing between a
 // stranger and a free voucher, and there is no status endpoint to fall back on.
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'s3cret'})).toBe(false);
 // Downgrading has to be deliberate and explicit.
 process.env.AZAM_ALLOW_UNSIGNED_CALLBACKS='true';
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'s3cret'})).toBe(true);
 expect(azamProvider.verifyWebhook(body,{'x-callback-token':'wrong'})).toBe(false);
});

it('escapes a PEM written on one line, as an env file forces',()=>{
 process.env.AZAM_CALLBACK_TOKEN='s3cret';
 process.env.AZAM_CALLBACK_PUBLIC_KEY=keys.publicKey.replace(/\n/g,'\\n');
 expect(azamProvider.verifyWebhook(signed(CALLBACK),{'x-callback-token':'s3cret'})).toBe(true);
});

it('cannot ask AzamPay about a collection, and does not pretend to',async()=>{
 azamConfigured();
 // GetTransactionStatus answers for disbursements, not MNO checkout. Null means
 // "not known", which purchases.ts already treats as "not paid".
 expect(await azamProvider.fetchStatus('T1')).toBeNull();
 expect(azamProvider.confirmsOutOfBand).toBe(false);
 expect(snippeProvider.confirmsOutOfBand).toBe(false);
});

it('records the shape of a refused callback without its contents',()=>{
 const shape=callbackShape(JSON.stringify(CALLBACK),{'x-azampay-signature':'abc','content-type':'application/json','user-agent':'x'});
 // Body names, then any header that could carry a signature. Values never.
 expect(shape).toContain('body.utilityref');
 expect(shape).toContain('body.transactionstatus');
 expect(shape).toContain('header.x-azampay-signature');
 expect(shape).toContain('header.content-type');
 expect(shape).not.toContain('header.user-agent');
 expect(shape.join()).not.toContain('JW-ABC');
 expect(shape.join()).not.toContain('abc');
 expect(callbackShape('not json')).toEqual(['body.<unparseable>']);
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

it('defaults the source tag to the exact value the partner routes on',()=>{
 delete process.env.AZAM_SOURCE;
 // Lower case. A capitalised value is accepted at checkout and then never
 // called back, which is the worst possible failure: money moves, nothing tells us.
 expect(azamProvider.networks.length).toBe(5);
});

it('marks the transaction as ours, for the partner who disburses it',async()=>{
 azamConfigured();
 process.env.AZAM_SOURCE='pastory';
 let sent:any=null;
 const realFetch=globalThis.fetch;
 globalThis.fetch=(async(url:any,init:any)=>{
  const body=JSON.parse(init.body);
  if(String(url).includes('GenerateToken'))return new Response(JSON.stringify({data:{accessToken:'t'}}),{status:200});
  sent={url:String(url),body};
  return new Response(JSON.stringify({transactionId:'TX1'}),{status:200});
 }) as any;
 try{
  const result=await azamProvider.createCheckout({amount:1000,currency:'TZS',description:'d',reference:'JW-1',
   customer:{phone:'0712345678'},network:'vodacom',returnUrl:'https://x/y',webhookUrl:'https://x/w'});
  expect(result).toMatchObject({provider:'azam',reference:'TX1',checkout_url:null,flow:'push'});
  expect(sent.body.additionalProperties.source).toBe('pastory');
  expect(sent.body.additionalProperties.intent_reference).toBe('JW-1');
  expect(sent.body).toMatchObject({accountNumber:'0712345678',amount:'1000',currency:'TZS',provider:'Mpesa',externalId:'JW-1'});
  // The reference rides three fields, because only property2 is guaranteed.
  expect(sent.body.additionalProperties.property2).toBe('JW-1');
  expect(sent.body.externalId.length).toBeLessThanOrEqual(128);
  // Every value AzamPay documents must be a string.
  for(const key of ['accountNumber','amount','currency','externalId','provider'])expect(typeof sent.body[key]).toBe('string');
  // Direct to AzamPay unless a partner gateway is configured.
  expect(sent.url).toBe('https://checkout.azampay.co.tz/azampay/mno/checkout');
  process.env.AZAM_CHECKOUT_URL='https://partner.example/api/azampay/request/payment';
  await azamProvider.createCheckout({amount:1000,currency:'TZS',description:'d',reference:'JW-2',
   customer:{phone:'0712345678'},network:'airtel',returnUrl:'https://x/y',webhookUrl:'https://x/w'});
  expect(sent.url).toBe('https://partner.example/api/azampay/request/payment');
  expect(sent.body.provider).toBe('Airtel');
 }finally{globalThis.fetch=realFetch;}
});

it('will not send a payment request over plaintext or to a credentialed URL',async()=>{
 azamConfigured();
 for(const bad of ['http://partner.example/pay','https://user:pass@partner.example/pay','not a url']){
  process.env.AZAM_CHECKOUT_URL=bad;
  await expect(azamProvider.createCheckout({amount:1000,currency:'TZS',description:'d',reference:'JW-3',
   customer:{phone:'0712345678'},network:'vodacom',returnUrl:'https://x/y',webhookUrl:'https://x/w'})).rejects.toThrow();
 }
});

it('refuses a checkout it cannot address to a real network or number',async()=>{
 azamConfigured();
 delete process.env.AZAM_CHECKOUT_URL;
 const base={amount:1000,currency:'TZS',description:'d',reference:'JW-4',returnUrl:'https://x/y',webhookUrl:'https://x/w'};
 await expect(azamProvider.createCheckout({...base,customer:{phone:'0712345678'},network:'mtn'})).rejects.toThrow('network');
 await expect(azamProvider.createCheckout({...base,customer:{},network:'vodacom'})).rejects.toThrow('number');
 await expect(azamProvider.createCheckout({...base,customer:{phone:'0812345678'},network:'vodacom'})).rejects.toThrow();
});
