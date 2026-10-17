import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {azamProvider,resetToken,lastCheckoutFailure,neverSent} from '../packages/payments/src/azam.provider.ts';

// A payment request is sent again at most once, and only when the gateway
// cannot have acted on it: our token was rejected, or the connection never got
// through. Anything else is shown to the buyer, because a second request after
// one that may have arrived could push a second PIN prompt to the same phone.

const KEYS=['AZAM_APP_NAME','AZAM_CLIENT_ID','AZAM_CLIENT_SECRET','AZAM_CALLBACK_TOKEN','AZAM_CHECKOUT_URL','AZAM_SOURCE'];
const saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
const realFetch=globalThis.fetch;
let warn:ReturnType<typeof vi.spyOn>;
beforeEach(()=>{
 Object.assign(process.env,{AZAM_APP_NAME:'JIACHIE',AZAM_CLIENT_ID:'id',AZAM_CLIENT_SECRET:'secret',AZAM_CALLBACK_TOKEN:'tok',AZAM_CHECKOUT_URL:'https://gateway.test/api/pastory/azampay/request/payment'});
 resetToken();
 warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
});
afterEach(()=>{
 globalThis.fetch=realFetch;warn.mockRestore();resetToken();
 for(const k of KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});

type Step=Response|Error;
const ok=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const refused=()=>Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNREFUSED'}});
/** A fake network: tokens are numbered as issued; checkout replies follow the script. */
function network(checkout:Step[],tokens:Step[]=[]){
 let issued=0;const sent:{auth:string;body:string}[]=[];
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).includes('GenerateToken')){
   const next=tokens.shift();if(next instanceof Error)throw next;
   return next??ok({data:{accessToken:'token-'+(++issued)}});
  }
  sent.push({auth:init.headers.Authorization,body:init.body});
  const next=checkout.shift();if(!next)throw new Error('unexpected extra checkout');
  if(next instanceof Error)throw next;return next;
 }) as any;
 return sent;
}
const buy=(reference='JW-R1')=>azamProvider.createCheckout({amount:500,currency:'TZS',description:'d',reference,customer:{phone:'0752093014'},network:'vodacom',returnUrl:'https://x/y',webhookUrl:'https://x/w'});

it('a rejected token: one retry with a fresh token, the same request, and the buyer sees no error',async()=>{
 const sent=network([new Response('{"message":"Unauthorized"}',{status:401}),ok({transactionId:'TX-9'})]);
 expect(await buy()).toMatchObject({reference:'TX-9',flow:'push'});
 expect(sent.map(s=>s.auth)).toEqual(['Bearer token-1','Bearer token-2']);
 expect(sent[1].body).toBe(sent[0].body);                       // same reference, same amount: still one purchase
 expect(JSON.parse(sent[0].body).externalId).toBe('JW-R1');
 expect(warn.mock.calls.join(' ')).toMatch(/rejected the kept token \(\d+s old\); retrying JW-R1 once/);
});

it('a token rejected twice is shown, after exactly one retry',async()=>{
 const sent=network([new Response('',{status:401}),new Response('',{status:401})]);
 await expect(buy()).rejects.toThrow(/rejected this request/);
 expect(sent).toHaveLength(2);
 expect(lastCheckoutFailure()?.status).toBe(401);
});

it('a connection that never got through: one retry with the same token',async()=>{
 const sent=network([refused(),ok({transactionId:'TX-2'})]);
 expect(await buy()).toMatchObject({reference:'TX-2'});
 expect(sent.map(s=>s.auth)).toEqual(['Bearer token-1','Bearer token-1']);
 expect(warn.mock.calls.join(' ')).toMatch(/Could not connect to the payment gateway \(ECONNREFUSED\); retrying JW-R1 once/);
});

it('never retries what may have reached the gateway: a timeout, a reset, a gateway error or a decline',async()=>{
 const timeout=Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
 const reset=Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}});
 for(const step of [timeout,reset,new Response('{"message":"Server Error"}',{status:500}),ok({success:false,message:'Checkout failed'},400)]){
  resetToken();
  const sent=network([step]);
  await expect(buy()).rejects.toThrow();
  expect(sent,String((step as any).name??(step as any).status)).toHaveLength(1);
 }
 expect(warn).not.toHaveBeenCalled();
});

it('a connection failure on the retry itself is shown, not retried again',async()=>{
 const sent=network([refused(),refused()]);
 await expect(buy()).rejects.toThrow(/Could not reach the payment service/);
 expect(sent).toHaveLength(2);
});

it('signing in to AzamPay is also retried once when the connection never got through',async()=>{
 const sent=network([ok({transactionId:'TX-3'})],[refused()]);
 expect(await buy()).toMatchObject({reference:'TX-3'});
 expect(sent).toHaveLength(1);
 expect(warn.mock.calls.join(' ')).toMatch(/sign-in could not connect \(ECONNREFUSED\)/);
});

it('two buyers who meet a dead token at once share one fresh sign-in',async()=>{
 let signIns=0;
 const replies=new Map<string,number>();
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).includes('GenerateToken')){signIns++;await new Promise(r=>setTimeout(r,5));return ok({data:{accessToken:'token-'+signIns}});}
  const auth=init.headers.Authorization;replies.set(auth,(replies.get(auth)??0)+1);
  // The first token is dead; any later one works.
  return auth==='Bearer token-1'?new Response('',{status:401}):ok({transactionId:'TX-'+JSON.parse(init.body).externalId});
 }) as any;
 const [a,b]=await Promise.all([buy('JW-A'),buy('JW-B')]);
 expect([a.reference,b.reference]).toEqual(['TX-JW-A','TX-JW-B']);
 expect(signIns).toBe(2);                         // the first sign-in, then one shared fresh one
});

it('knows which failures happened before anything was sent',()=>{
 for(const code of ['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT'])expect(neverSent({cause:{code}}),code).toBe(true);
 for(const code of ['ECONNRESET','UND_ERR_SOCKET','EPIPE'])expect(neverSent({cause:{code}}),code).toBe(false);
 expect(neverSent({name:'TimeoutError'})).toBe(false);
 expect(neverSent(undefined)).toBe(false);
});

it('does not retry after a slow first attempt, so the buyer is never shown an error while a prompt may still come',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  let checkouts=0;
  globalThis.fetch=(async(url:any)=>{
   if(String(url).includes('GenerateToken'))return ok({data:{accessToken:'token-x'}});
   checkouts++;vi.setSystemTime(Date.now()+10_000);            // the gateway took ten seconds to refuse
   return new Response('',{status:401});
  }) as any;
  await expect(buy()).rejects.toThrow(/rejected this request/);
  expect(checkouts).toBe(1);
  expect(warn).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});

it('records why a retry failed when the fresh sign-in itself fails',async()=>{
 const sent=network([new Response('',{status:401})],[ok({data:{accessToken:'token-1'}}),ok({error:'down'},500)]);
 await expect(buy()).rejects.toThrow();
 expect(sent).toHaveLength(1);
 expect(lastCheckoutFailure()).toMatchObject({status:401});
 expect(lastCheckoutFailure()?.detail).toMatch(/fresh sign-in failed/);
});

it('logs the age of the token this request used, not of a newer one',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  network([ok({transactionId:'T1'}),new Response('',{status:401}),ok({transactionId:'T2'})]);
  await buy('JW-OLD');                                            // signs in: token-1, issued now
  vi.setSystemTime(Date.now()+120_000);                           // two minutes later AzamPay rejects it
  await buy('JW-LATER');
  expect(warn.mock.calls.join(' ')).toMatch(/\(120s old\); retrying JW-LATER/);
 }finally{vi.useRealTimers();}
});
