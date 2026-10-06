import {it,expect,vi,afterEach} from 'vitest';
import {forwardTarget,forwardCallback} from '../packages/database/src/purchases.ts';

// Callbacks for payments JIACHIE does not own go to the system that named them.
const env={PAYMENT_FORWARD_URL:'https://wifi.example/api/v1/portal/payments/azam/saas-token',
 PAYMENT_FORWARD_ROUTES:' MKC-=https://connect.example/webhooks/payments/azam/connect-token , XYZ=https://other.example/cb?x=1'};

afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

it('sends Makutano Connect its own payments, and everything else to the Wi-Fi platform',()=>{
 expect(forwardTarget('MKC-LXT2K9-8F3A1C',env)).toBe('https://connect.example/webhooks/payments/azam/connect-token');
 expect(forwardTarget('mkc-lxt2k9-8f3a1c',env)).toBe('https://connect.example/webhooks/payments/azam/connect-token');
 expect(forwardTarget('XYZ-1',env)).toBe('https://other.example/cb?x=1');
 // ONE NETWORK's payments start with the shop's receipt prefix; any shop's do.
 expect(forwardTarget('ONE-8B3E2F1A-0C1D',env)).toBe(env.PAYMENT_FORWARD_URL);
 expect(forwardTarget(null,env)).toBe(env.PAYMENT_FORWARD_URL);
 expect(forwardTarget('MKC-1',{PAYMENT_FORWARD_URL:env.PAYMENT_FORWARD_URL})).toBe(env.PAYMENT_FORWARD_URL);
 expect(forwardTarget('ONE-1',{})).toBeNull();
 // A malformed rule is skipped, not guessed at.
 expect(forwardTarget('MKC-1',{PAYMENT_FORWARD_ROUTES:'=https://x.example,MKC-',PAYMENT_FORWARD_URL:'https://d.example'})).toBe('https://d.example');
});

it('hands the callback on byte for byte, so the signature and every field arrive as AzamPay sent them',async()=>{
 vi.stubEnv('PAYMENT_FORWARD_URL',env.PAYMENT_FORWARD_URL);vi.stubEnv('PAYMENT_FORWARD_ROUTES',env.PAYMENT_FORWARD_ROUTES);
 const calls:{url:string;body:string;type:string}[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,init:any)=>{calls.push({url:String(url),body:String(init.body),type:init.headers['content-type']});return new Response('{"ok":true}',{status:200});});
 const connect=Buffer.from('{"utilityref":"MKC-LXT2K9-8F3A1C","transactionstatus":"success","signature":"c2ln"}');
 const shop=Buffer.from('{"utilityref":"ONE-8B3E2F1A","transactionstatus":"success"}');
 await forwardCallback(connect,{'content-type':'application/json'},'T1','MKC-LXT2K9-8F3A1C');
 await forwardCallback(shop,{'content-type':'application/json'},'T2','ONE-8B3E2F1A');
 expect(calls).toEqual([
  {url:'https://connect.example/webhooks/payments/azam/connect-token',body:connect.toString(),type:'application/json'},
  {url:env.PAYMENT_FORWARD_URL,body:shop.toString(),type:'application/json'},
 ]);
});
