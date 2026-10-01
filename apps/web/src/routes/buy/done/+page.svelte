<script lang="ts">
import PortalShell from '$lib/components/PortalShell.svelte';
import {onMount} from 'svelte';
// The second half of buying, in the same frame as the first. Server messages
// are translated; anything unexpected falls back to the phase's own line.
import {messageSw} from '$lib/sw';
let {data}=$props();
// loading | pending | paid | failed | refund | lost
let phase=$state('loading');
let code=$state('');let packageName=$state('');let bySms=$state(false);let message=$state('');let copied=$state(false);
let connecting=$state(false);let checking=$state(false);
let timer:ReturnType<typeof setTimeout>;let disposed=false;
// Seconds the paid voucher stays on screen before connecting by itself. Once
// the router page takes over, this page and its code are gone, and the
// hotspot has no auto-login cookie: any later disconnect needs the code again.
const SAVE_SECONDS=3;
let countdown=$state(0);let countdownTimer:ReturnType<typeof setInterval>|undefined;
// The code rides in the fragment, never the query string: a fragment is not
// sent to the router, so the voucher stays out of its HTTP log. The sign-in
// page fills it in and submits it, since only that page can do the CHAP
// handshake the hotspot requires.
const loginUrl=$derived(`${data.loginUrl}#code=${code.replace(/-/g,'')}`);

function connect(claim:string){
 // The claim stays in localStorage after payment, so reopening /buy/done in
 // this browser -- after the sign-in window closed, or from another tab --
 // shows the same voucher again. The per-tab marker stops a redirect loop.
 let attempted=false;
 try{
  attempted=sessionStorage.getItem('jw_connect_attempt')===claim;
  sessionStorage.setItem('jw_claim',claim);
 }catch{/* Tab storage unavailable: the localStorage claim still recovers. */}
 if(attempted)return;
 connecting=true;countdown=SAVE_SECONDS;
 countdownTimer=setInterval(()=>{
  if(disposed){clearInterval(countdownTimer);return;}
  if(--countdown>0)return;
  clearInterval(countdownTimer);
  try{sessionStorage.setItem('jw_connect_attempt',claim);}catch{/* no marker: a return may count down again */}
  try{window.location.assign(loginUrl);}catch{connecting=false;}
 },1000);
}
// "Wait": stop the countdown to write the code down; connect with the button after.
function hold(){clearInterval(countdownTimer);connecting=false;}
// How long the customer has been waiting, for the hint about a PIN prompt that never came.
const started=Date.now();
let waited=$state(0);
const slow=$derived(waited>75);

async function check(){
 if(disposed||checking||!['loading','pending'].includes(phase))return;
 clearTimeout(timer);
 // sessionStorage is still read so a purchase started before this change completes.
 let claim='';try{claim=localStorage.getItem('jw_claim')||'';}catch{/* blocked storage */}
 if(!claim)try{claim=sessionStorage.getItem('jw_claim')||'';}catch{/* blocked storage */}
 if(!claim){phase='lost';return;}
 checking=true;
 try{
  const response=await fetch('/buy/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({claim_token:claim})});
  const result=await response.json();
  if(disposed)return;
  if(!response.ok)throw new Error(result.error||'');
  message=result.message||'';packageName=result.package_name||'';bySms=result.sms===true;
  if(result.status==='PAID'){
   if(typeof result.code!=='string'||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(result.code.replace(/-/g,'')))throw new Error('');
   code=result.code;phase='paid';
   connect(claim);
   return;
  }
  if(result.status==='REFUND_DUE'){phase='refund';return;}
  // The server owns the 15-minute payment deadline. Do not stop checking after
  // three minutes while the customer is still approving the mobile-money PIN.
  if(result.status==='PENDING'){phase='pending';waited=Math.round((Date.now()-started)/1000);timer=setTimeout(check,2000);return;}
  phase='failed';
 }catch(e){if(!disposed){message=(e as Error).message;phase='pending';waited=Math.round((Date.now()-started)/1000);timer=setTimeout(check,3000);}}
 finally{checking=false;}
}
async function copy(){try{await navigator.clipboard.writeText(code);copied=true;setTimeout(()=>copied=false,2000);}catch{/* selection still works */}}
onMount(()=>{
 check();
 // Back from the mobile-money PIN prompt: ask straight away rather than at the next tick.
 const resume=()=>{if(document.visibilityState==='visible')check();};
 document.addEventListener('visibilitychange',resume);
 window.addEventListener('focus',resume);
 return()=>{disposed=true;clearTimeout(timer);clearInterval(countdownTimer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
});
</script>

<PortalShell brand={data.brand} phone={data.phone} support={data.support} logo={data.logo} title="Vocha yako">
<section class="hero"><h1>{phase==='paid'?'Uko tayari.':phase==='loading'||phase==='pending'?'Karibu tunamaliza.':'Tutalishughulikia.'}</h1></section>
<section class="card" aria-live="polite">
{#if phase==='loading'||phase==='pending'}
 <div class="card-icon"><svg aria-hidden="true"><use href="#p-phone"/></svg></div>
 <span class="tag">MALIPO</span>
 <h2>Tunathibitisha malipo yako…</h2>
 <p>Usifunge ukurasa huu. Simu yako ikiomba PIN, ithibitishe hapo. Kwa kawaida huchukua sekunde chache.</p>
 {#if slow}
  <p class="small"><strong>Bado hujapata ombi la PIN?</strong> Hakikisha simu yako ina mtandao wa simu na salio la kutosha, kisha subiri kidogo. Ukishalipa, vocha yako itatokea hapa yenyewe.</p>
  <p class="small"><strong>Usinunue tena kwa sasa,</strong> ili usikatwe mara mbili. Ikichelewa sana, muulize muhudumu{#if data.phone}{' au mpigie '}<a class="contact" href={'tel:+255'+data.phone.replace(/^0/,'')}>{data.phone}</a>{/if}.</p>
 {/if}
 <button type="button" class={slow?'primary-action':'secondary-action'} onclick={check} disabled={checking}>Angalia tena</button>

{:else if phase==='paid'}
 <div class="card-icon success"><svg aria-hidden="true"><use href="#p-check"/></svg></div>
 <span class="tag">IMELIPWA</span>
 <h2>Hii hapa vocha yako.</h2>
 {#if connecting}
  <p class="connect-note" role="status"><span class="spinner" aria-hidden="true"></span>Tunakuunganisha kwenye Wi-Fi baada ya sekunde {countdown}. Huhitaji kubonyeza kitufe.</p>
 {/if}
 {#if packageName}<p>{packageName}</p>{/if}
 <div class="summary"><span class="voucher-code">{code}</span><button type="button" class="copy" onclick={copy}>{copied?'Imenakiliwa ✓':'Nakili vocha'}</button></div>
 <p class="small"><strong>Iandike au inakili sasa.</strong> Utaihitaji kuunganisha tena ukikatika.{#if bySms}{' '}Tunaituma pia kwa SMS kwenye namba uliyolipia.{:else}{' '}Haitumwi kwa SMS.{/if}</p>
 <p class="small muted">Kama tayari umeunganishwa kwa vocha nyingine, hifadhi hii na uiingize muda wako wa sasa ukiisha.</p>
 {#if connecting}
  <button type="button" class="secondary-action" onclick={hold}>Subiri, nataka kuiandika kwanza</button>
 {:else}
  <a class="primary-action" href={loginUrl}>Jaribu kuunganisha tena<svg aria-hidden="true"><use href="#p-arrow"/></svg></a>
  <p class="small muted">Kama hujaunganishwa moja kwa moja, hakikisha uko kwenye Wi-Fi ya duka kisha ujaribu tena.</p>
  <a class="secondary-action" href={data.loginUrl}>Nitaiingiza mwenyewe</a>
 {/if}

{:else if phase==='refund'}
 <div class="card-icon"><svg aria-hidden="true"><use href="#p-help"/></svg></div>
 <span class="tag">INAHITAJI MUHUDUMU</span>
 <h2>Malipo yako yanahitaji muhudumu.</h2>
 <p>{messageSw(message,'Malipo yako yamefika baada ya muda wa kukushikilia vocha kuisha.')}</p>
 <p class="small">Mwonyeshe muhudumu skrini hii. Malipo yako yamerekodiwa na utarudishiwa pesa au kupewa vocha.</p>

{:else if phase==='lost'}
 <div class="card-icon"><svg aria-hidden="true"><use href="#p-help"/></svg></div>
 <span class="tag">MALIPO</span>
 <h2>Hatuoni ununuzi huu kwenye kifaa hiki.</h2>
 <p>Vocha yako imefungwa kwenye kivinjari ulicholipia. Kama umelipa, mwonyeshe muhudumu ujumbe wa malipo kwenye simu yako.</p>
 <p class="small muted">Hii hutokea ukurasa ukifunguliwa kwenye kivinjari kingine au dirisha la faragha.</p>
 <a class="primary-action" href="/buy">Anza upya<svg aria-hidden="true"><use href="#p-arrow"/></svg></a>

{:else}
 <div class="card-icon"><svg aria-hidden="true"><use href="#p-help"/></svg></div>
 <span class="tag">MALIPO</span>
 <h2>Malipo hayakukamilika.</h2>
 <p>{messageSw(message,'Hakuna pesa iliyokatwa. Unaweza kujaribu tena.')}</p>
 <a class="primary-action" href="/buy">Jaribu tena<svg aria-hidden="true"><use href="#p-arrow"/></svg></a>
{/if}
</section>
</PortalShell>

<style>
.hero{padding:23px 0 22px;color:white}.hero h1{font-size:29px;line-height:1.15;letter-spacing:-.8px;margin:0;font-weight:760}
.card{background:white;border-radius:24px;padding:30px;max-width:460px;color:var(--navy);box-shadow:0 20px 50px #0024561c}
.card-icon{height:60px;width:60px;border-radius:20px;background:color-mix(in srgb,var(--bright) 8%,white);color:var(--blue);display:grid;place-items:center;margin:0 0 22px}.card-icon svg{width:29px;height:29px}.card-icon.success{background:var(--lime);color:var(--on-lime)}
.tag{color:#527093;background:#f1f5fb;display:inline-block;padding:5px 9px;border-radius:5px;font-size:9px;letter-spacing:1px;font-weight:700;margin-bottom:11px}
.card h2{font-size:27px;letter-spacing:-1px;line-height:1.15;margin:0 0 12px;font-weight:750;color:var(--navy)}.card p{font-size:13px;line-height:1.7;color:#5c6b83;margin:0 0 16px}.card .small{font-size:12px}.card .muted{color:#64748b}.card p strong{color:var(--navy);font-weight:700}.card .contact{color:var(--contact);font-weight:700;text-decoration:underline;text-underline-offset:3px}
.summary{background:#f5f8fc;padding:17px;border-radius:12px;margin:6px 0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
/* Sized so all four groups fit one line on a phone; if it ever must wrap, it wraps at a dash. */
.voucher-code{display:inline;margin:0;color:var(--blue);font-size:clamp(16px,5.3vw,22px);font-weight:700;letter-spacing:.04em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;user-select:all;word-break:normal;overflow-wrap:normal}
.connect-note{display:flex;align-items:center;gap:10px;padding:11px 13px;margin:0 0 14px;border-radius:12px;background:color-mix(in srgb,var(--lime) 22%,white);color:var(--navy);font-size:12px;font-weight:600;line-height:1.45}
.spinner{width:16px;height:16px;flex-shrink:0;border:2px solid var(--blue);border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spinner{animation:none;border-right-color:var(--blue)}}
.copy{border:1px solid #dbe3ee;background:white;border-radius:8px;padding:9px 12px;font-size:11px;font-weight:650;color:var(--blue);cursor:pointer}
.primary-action{height:46px;display:flex;cursor:pointer;gap:8px;justify-content:center;align-items:center;width:100%;border:0;background:var(--blue);color:var(--on-blue);border-radius:10px;font-size:12px;font-weight:650;text-decoration:none;margin-top:6px}.primary-action svg{width:16px;height:16px;color:var(--lime)}.primary-action:disabled{opacity:.6;cursor:wait}
.secondary-action{border:0;background:none;font-size:12px;color:#5c6b83;display:block;padding:14px 10px 0;width:100%;text-align:center;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.secondary-action:disabled{opacity:.6;cursor:wait}
@media(max-width:800px){.hero{padding:17px 0 16px}.hero h1{font-size:23px}.card{padding:24px 20px;border-radius:20px}.card h2{font-size:23px}}
</style>
