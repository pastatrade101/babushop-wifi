import {test,expect,type Page} from '@playwright/test';

const claim='test-purchase-claim';
const code='ABCD-EFGH-JKLM-NPQR';
const routerLogin='http://10.78.0.1/login';
const paid={status:'PAID',code,package_name:'Test Wi-Fi',message:null};
// How long the paid voucher stays on screen before the page connects by itself.
const SAVE_MS=10000;

// Only browser fixtures: no checkout, payment, database or real router request.
test.beforeEach(async({page,baseURL})=>{
 if(!baseURL||!['127.0.0.1','localhost','[::1]'].includes(new URL(baseURL).hostname))throw new Error('Purchase browser tests require a local web server');
 await page.addInitScript(({origin,claim})=>{
  if(location.origin===origin&&!sessionStorage.getItem('purchase-test-started')){
   localStorage.setItem('jw_claim',claim);
   sessionStorage.setItem('purchase-test-started','true');
  }
 },{origin:new URL(baseURL).origin,claim});
 await page.route('http://10.78.0.1/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Router login fixture</h1>'}));
});

/** The paid voucher is on screen; let the countdown run out and expect the router login. */
async function connectsAfterCountdown(page:Page){
 await expect(page.getByText(code,{exact:true})).toBeVisible();
 await page.clock.runFor(SAVE_MS);
 await expect(page).toHaveURL(`${routerLogin}#code=ABCDEFGHJKLMNPQR`);
}

test('confirmed payment shows the voucher to save, then opens MikroTik login without a tap',async({page})=>{
 const requests:string[]=[];
 page.on('request',request=>requests.push(request.url()));
 await page.clock.install();
 await page.route('**/buy/status',async route=>{
  expect(route.request().method()).toBe('POST');
  expect(route.request().postDataJSON()).toEqual({claim_token:claim});
  await route.fulfill({json:paid});
 });
 await page.goto('/buy/done');
 // Before anything leaves the page: the code, the reminder to keep it, and the countdown.
 await expect(page.getByRole('heading',{name:'Hii hapa vocha yako.'})).toBeVisible();
 await expect(page.getByText(code,{exact:true})).toBeVisible();
 await expect(page.getByText('Iandike au inakili sasa.')).toBeVisible();
 await expect(page.getByText(/Tunakuunganisha kwenye Wi-Fi baada ya sekunde \d+/)).toBeVisible();
 await expect(page.getByText('Kama tayari umeunganishwa kwa vocha nyingine')).toBeVisible();
 await page.clock.runFor(SAVE_MS-2000);
 expect(requests.some(url=>url.startsWith(routerLogin))).toBe(false);
 await page.clock.runFor(2000);
 await expect(page).toHaveURL(`${routerLogin}#code=ABCDEFGHJKLMNPQR`);
 expect(requests.filter(url=>url.startsWith(routerLogin))).toEqual([routerLogin]);
 expect(requests.every(url=>!url.includes(claim)&&!url.includes(code)&&!url.includes('ABCDEFGHJKLMNPQR'))).toBe(true);
});

test('keeps waiting beyond three minutes, then connects without a click',async({page})=>{
 let confirmed=false,calls=0;
 await page.clock.install();
 await page.route('**/buy/status',async route=>{
  calls++;
  await route.fulfill({json:confirmed?paid:{status:'PENDING'}});
 });
 await page.goto('/buy/done');
 await expect(page.getByRole('heading',{name:'Tunathibitisha malipo yako…'})).toBeVisible();
 for(let i=0;i<95;i++){
  const before=calls;
  await expect(page.getByRole('button',{name:'Angalia tena'})).toBeEnabled();
  await page.clock.runFor(2000);
  await expect.poll(()=>calls).toBeGreaterThan(before);
 }
 confirmed=true;
 await expect(page.getByRole('button',{name:'Angalia tena'})).toBeEnabled();
 await page.clock.runFor(2000);
 await connectsAfterCountdown(page);
});

test('checks again on return from the PIN prompt and serializes requests',async({page})=>{
 let calls=0;
 let release:()=>void=()=>{};
 const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.clock.install();
 await page.route('**/buy/status',async route=>{
  calls++;
  if(calls===1){await route.fulfill({json:{status:'PENDING'}});return;}
  await hold;
  await route.fulfill({json:paid});
 });
 await page.goto('/buy/done');
 await expect(page.getByRole('button',{name:'Angalia tena'})).toBeEnabled();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>calls).toBe(2);
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(5000);
 expect(calls).toBe(2);
 release();
 await connectsAfterCountdown(page);
});

for(const status of ['FAILED','REFUND_DUE']){
 test(`${status} never connects or submits a voucher`,async({page})=>{
  let routerRequests=0;
  page.on('request',request=>{if(request.url().startsWith(routerLogin))routerRequests++;});
  await page.clock.install();
  await page.route('**/buy/status',route=>route.fulfill({json:{...paid,status}}));
  await page.goto('/buy/done');
  await expect(page.getByRole('heading',{name:status==='FAILED'?'Malipo hayakukamilika.':'Malipo yako yanahitaji muhudumu.'})).toBeVisible();
  await page.clock.runFor(SAVE_MS+2000);
  expect(routerRequests).toBe(0);
  await expect(page.getByText(code)).toHaveCount(0);
 });
}

test('temporary status errors retry automatically',async({page})=>{
 let calls=0;
 await page.clock.install();
 await page.route('**/buy/status',route=>{
  calls++;
  return calls===1?route.fulfill({status:503,json:{error:'Temporary failure'}}):route.fulfill({json:paid});
 });
 await page.goto('/buy/done');
 await expect(page.getByRole('button',{name:'Angalia tena'})).toBeEnabled();
 await page.clock.runFor(3000);
 await connectsAfterCountdown(page);
});

test('the voucher stays recoverable in this browser after connecting, without a redirect loop',async({page,baseURL})=>{
 await page.clock.install();
 await page.route('**/buy/status',route=>route.fulfill({json:paid}));
 await page.goto('/buy/done');
 await connectsAfterCountdown(page);
 await page.goto(`${baseURL}/buy/done`);
 await expect(page.getByRole('heading',{name:'Hii hapa vocha yako.'})).toBeVisible();
 await expect(page.getByText(code,{exact:true})).toBeVisible();
 // No second countdown in this tab: the retry link is offered instead.
 await expect(page.getByText(/Tunakuunganisha kwenye Wi-Fi baada ya/)).toHaveCount(0);
 // The claim is still in localStorage, so a new tab or a closed sign-in window can recover it too.
 const stored=await page.evaluate(()=>({local:localStorage.getItem('jw_claim'),tab:sessionStorage.getItem('jw_claim')}));
 expect(stored).toEqual({local:claim,tab:claim});
 await page.getByRole('link',{name:'Jaribu kuunganisha tena →'}).click();
 await expect(page).toHaveURL(`${routerLogin}#code=ABCDEFGHJKLMNPQR`);
});

test('a purchase using the legacy session claim connects automatically',async({page})=>{
 let confirmed=false;
 await page.clock.install();
 await page.route('**/buy/status',route=>route.fulfill({json:confirmed?paid:{status:'PENDING'}}));
 await page.goto('/buy/done');
 await expect(page.getByRole('button',{name:'Angalia tena'})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('jw_claim',localStorage.getItem('jw_claim')||'');localStorage.removeItem('jw_claim');});
 confirmed=true;
 await page.reload();
 await connectsAfterCountdown(page);
});
