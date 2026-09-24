import {it,expect} from 'vitest';
import {emailConfig,sendEmail,renderSalePaid,formatDuration,maskPhone,type SalePaid} from '../packages/notifications/src/index.ts';
import {formatDuration as portalDuration} from '../apps/web/src/lib/duration.ts';

const sale:SalePaid={saleId:'s-1',receipt:'JW-ABC',reference:'JW-REF-1',amountTzs:10000,packageName:'JIACHIE MWEZI',
 durationMinutes:43200,downloadMbps:10,uploadMbps:5,provider:'azam',network:'vodacom',customer:maskPhone('0758123054'),paidAt:'2026-09-24T09:05:00Z'};
const context={brand:'JIACHIE WIFI',portalUrl:'https://jiachie-wifi.com/payments?q=JW-REF-1',todayCount:3,todayTotalTzs:12000};

it('stays off until both a key and a valid recipient are set',()=>{
 expect(emailConfig({})).toBeNull();
 expect(emailConfig({RESEND_API_KEY:'re_x'})).toBeNull();
 expect(emailConfig({SALE_ALERT_EMAIL:'pastory56@gmail.com'})).toBeNull();
 expect(emailConfig({RESEND_API_KEY:'re_x',SALE_ALERT_EMAIL:'not-an-email'})).toBeNull();
 expect(emailConfig({RESEND_API_KEY:' re_x ',SALE_ALERT_EMAIL:'pastory56@gmail.com, bad, b@x.co'}))
  .toEqual({apiKey:'re_x',from:'JIACHIE WIFI <onboarding@resend.dev>',to:['pastory56@gmail.com','b@x.co']});
 expect(emailConfig({RESEND_API_KEY:'re_x',SALE_ALERT_EMAIL:'a@b.co',RESEND_FROM:'JIACHIE WIFI <sales@jiachie-wifi.com>'})?.from).toBe('JIACHIE WIFI <sales@jiachie-wifi.com>');
});

it('puts the amount and package up front, and never a voucher code or a full number',()=>{
 const {subject,html,text}=renderSalePaid(sale,context);
 expect(subject).toBe('New sale · TZS 10,000 · JIACHIE MWEZI');
 for(const body of [html,text]){
  expect(body).toContain('TZS 10,000');
  expect(body).toContain('JIACHIE MWEZI');
  expect(body).toContain('1 month (30 days)');
  expect(body).toContain('Up to 10 Mbps down · 5 Mbps up');
  expect(body).toContain('M-Pesa (Vodacom) through AzamPay');
  expect(body).toContain('0758 ••• 054');
  expect(body).not.toContain('0758123054');
  expect(body).toContain('JW-ABC');
  expect(body).toContain('Sale #3 today · TZS 12,000 so far');
  expect(body).toContain('24 Sept 2026, 12:05'); // 09:05 UTC is midday in Dar es Salaam
 }
 expect(html).toContain('href="https://jiachie-wifi.com/payments?q=JW-REF-1"');
});

it('escapes everything that came from a person or a provider',()=>{
 const {html}=renderSalePaid({...sale,packageName:'<img src=x onerror=alert(1)>',reference:'"><script>'},{...context,brand:'A&B'});
 expect(html).not.toContain('<img src=x');
 expect(html).not.toContain('"><script>');
 expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
 expect(html).toContain('A&amp;B');
});

it('describes a package length exactly as the portal does',()=>{
 for(const minutes of [1,30,60,90,120,1440,2880,10080,20160,43200,86400,525600])
  expect(formatDuration(minutes)).toBe(portalDuration(minutes));
});

it('masks numbers down to the first four and last three digits',()=>{
 expect(maskPhone('0758123054')).toBe('0758 ••• 054');
 expect(maskPhone('+255 758 123 054')).toBe('2557 ••• 054');
 expect(maskPhone(null)).toBe('Not given');
 expect(maskPhone('12')).toBe('Not given');
});

it('tells a retryable failure from one that retrying cannot fix',async()=>{
 const message={from:'f@x.co',to:['t@x.co'],subject:'s',html:'h',text:'t',idempotencyKey:'sale-paid/1'};
 const reply=(status:number,body:object)=>(async()=>new Response(JSON.stringify(body),{status})) as unknown as typeof fetch;
 let seen:RequestInit|undefined;
 const ok=await sendEmail(message,'re_key',(async(_url:string,init:RequestInit)=>{seen=init;return new Response(JSON.stringify({id:'em_1'}),{status:200});}) as unknown as typeof fetch);
 expect(ok).toEqual({ok:true,id:'em_1'});
 expect((seen!.headers as Record<string,string>)['Idempotency-Key']).toBe('sale-paid/1');
 expect((seen!.headers as Record<string,string>).Authorization).toBe('Bearer re_key');
 for(const status of [408,429,500,503])expect(await sendEmail(message,'k',reply(status,{message:'busy'}))).toMatchObject({ok:false,retryable:true,status});
 expect(await sendEmail(message,'k',reply(403,{message:'The jiachie-wifi.com domain is not verified.'})))
  .toEqual({ok:false,retryable:false,status:403,error:'The jiachie-wifi.com domain is not verified.'});
 expect(await sendEmail(message,'k',(async()=>{throw new TypeError('fetch failed');}) as unknown as typeof fetch))
  .toMatchObject({ok:false,retryable:true,status:0});
});
