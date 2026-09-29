<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import SellerContact from '$lib/components/SellerContact.svelte';
import {onMount} from 'svelte';
// The second half of buying, so in Swahili like the first. Server messages
// are translated; anything unexpected falls back to the phase's own line.
import {messageSw} from '$lib/sw';
const SW_SELLER='Wasiliana na muuzaji kununua vocha';
const SW_CALL='Mpigie muuzaji kwa 0758342054 kununua vocha';
let {data}=$props();
// loading | pending | paid | failed | refund | lost
let phase=$state('loading');
let code=$state('');let packageName=$state('');let message=$state('');let copied=$state(false);
let connecting=$state(false);let checking=$state(false);
let timer:ReturnType<typeof setTimeout>;let disposed=false;
// Seconds the paid voucher stays on screen before connecting by itself. Once
// the router page takes over, this page and its code are gone, and the
// hotspot has no auto-login cookie: any later disconnect needs the code again.
const SAVE_SECONDS=10;
let countdown=$state(0);let countdownTimer:ReturnType<typeof setInterval>|undefined;
const loginUrl=$derived(`http://10.78.0.1/login#code=${code.replace(/-/g,'')}`);

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
  // Only the router page has the CHAP challenge. Its fragment handler fills
  // and submits the voucher without a tap; no code enters a query string.
  try{window.location.assign(loginUrl);}catch{connecting=false;}
 },1000);
}

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
  message=result.message||'';packageName=result.package_name||'';
  if(result.status==='PAID'){
   if(typeof result.code!=='string'||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(result.code.replace(/-/g,'')))throw new Error('');
   code=result.code;phase='paid';
   connect(claim);
   return;
  }
  if(result.status==='REFUND_DUE'){phase='refund';return;}
  // The server owns the 15-minute payment deadline. Do not stop checking after
  // three minutes while the customer is still approving the mobile-money PIN.
  if(result.status==='PENDING'){phase='pending';timer=setTimeout(check,2000);return;}
  phase='failed';
 }catch(e){if(!disposed){message=(e as Error).message;phase='pending';timer=setTimeout(check,3000);}}
 finally{checking=false;}
}
async function copy(){try{await navigator.clipboard.writeText(code);copied=true;setTimeout(()=>copied=false,2000);}catch{/* selection still works */}}
onMount(()=>{
 check();
 const resume=()=>{if(document.visibilityState==='visible')check();};
 document.addEventListener('visibilitychange',resume);
 window.addEventListener('focus',resume);
 return()=>{disposed=true;clearTimeout(timer);clearInterval(countdownTimer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
});
</script>
<svelte:head><title>Vocha yako · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap buy" lang="sw"><header class="buy-top"><span class="brand-mark"><img src="/logo.webp" alt="" width="38" height="38"></span><strong>{data.brand}</strong></header><section class="portal-card"><div class="portal-body" aria-live="polite">

{#if phase==='loading'||phase==='pending'}
 <div class="wifi-symbol" aria-hidden="true"><Icon size={26}/></div>
 <p class="eyebrow">MALIPO</p><h1>Tunathibitisha malipo yako…</h1>
 <p>Usifunge ukurasa huu. Ukiombwa namba ya siri (PIN), ithibitishe kwenye simu yako.</p>
 <p class="small muted">Kwa kawaida huchukua sekunde chache.</p>
 <button class="button secondary" onclick={check} disabled={checking}>Angalia tena</button>

{:else if phase==='paid'}
 <p class="eyebrow">IMELIPWA</p><h1>Hii hapa vocha yako.</h1>
 {#if connecting}
  <p class="connect-note" role="status"><span class="spinner" aria-hidden="true"></span>Tunakuunganisha kwenye Wi-Fi baada ya sekunde {countdown}. Huhitaji kubonyeza kitufe.</p>
 {:else}
  <p>Malipo yako yamekamilika. Kama bado hujaunganishwa, baki kwenye Wi-Fi ya duka na ujaribu kuunganisha tena.</p>
 {/if}
 {#if packageName}<p>{packageName}</p>{/if}
 <p class="voucher-code">{code}</p>
 <button class="button full" onclick={copy}>{copied?'Imenakiliwa ✓':'Nakili vocha'}</button>
 <p class="small"><strong>Iandike au inakili sasa.</strong> Utaihitaji kuunganisha tena ukikatika. Haitumwi kwa SMS.</p>
 <p class="small muted">Kama tayari umeunganishwa kwa vocha nyingine, hifadhi hii na uiingize muda wako wa sasa ukiisha.</p>
 {#if !connecting}
  <!-- The code rides in the fragment, never the query string: a fragment is not
       sent to the server, so the voucher stays out of the router's HTTP log. The
       sign-in page fills it in and submits it, because only that page can do the
       CHAP handshake the hotspot requires. -->
  <a class="button full connect" href={loginUrl}>Jaribu kuunganisha tena →</a>
  <p class="small muted">Kama hujaunganishwa moja kwa moja, hakikisha uko kwenye Wi-Fi ya duka kisha ujaribu tena.</p>
  <a class="button secondary full" href="http://10.78.0.1/login">Nitaiingiza mwenyewe</a>
 {/if}

{:else if phase==='refund'}
 <p class="eyebrow">INAHITAJI MSAADA</p><h1>Malipo yako yanahitaji muhudumu.</h1>
 <p>{messageSw(message,'Malipo yako yamefika baada ya muda wa kukushikilia vocha kuisha.')}</p>
 <p class="small">Mwonyeshe muhudumu skrini hii. Pesa yako imerekodiwa na utarudishiwa au kupewa vocha.</p>

{:else if phase==='lost'}
 <p class="eyebrow">MALIPO</p><h1>Hatuoni ununuzi huu kwenye kifaa hiki.</h1>
 <p>Vocha yako imefungwa kwenye kivinjari ulicholipia. Kama umelipa, mwonyeshe muhudumu ujumbe wa malipo kwenye simu yako.</p>
 <p class="small muted">Hii hutokea ukurasa ukifunguliwa kwenye kivinjari kingine au dirisha la faragha.</p>
 <a class="button full" href="/buy">Anza upya</a>

{:else}
 <p class="eyebrow">MALIPO</p><h1>Malipo hayakukamilika.</h1>
 <p>{messageSw(message,'Hakuna pesa iliyokatwa. Unaweza kujaribu tena.')}</p>
 <a class="button full" href="/buy">Jaribu tena</a>
{/if}

<SellerContact label={SW_SELLER} callLabel={SW_CALL}/>
{#if data.support}<p class="small">Unahitaji msaada? {data.support}</p>{/if}
</div></section><p class="portal-footer">Intaneti rahisi. Muda wako, muunganisho wako.</p></main>
<style>
/* Sized so all four groups fit one line on a phone; if it ever must wrap, it wraps at a dash. */
.voucher-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:clamp(16px,5.3vw,30px);font-weight:700;letter-spacing:.04em;
 padding:14px 10px;margin:14px 0;border:1px dashed var(--primary-text);border-radius:10px;background:var(--primary-soft);color:var(--primary-text);text-align:center;user-select:all;word-break:normal;overflow-wrap:normal}
.connect-note{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--success-soft);color:var(--success);font-weight:600;font-size:.86rem;line-height:1.4}
.spinner{width:16px;height:16px;flex-shrink:0;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spinner{animation:none;border-right-color:currentColor}}
</style>
