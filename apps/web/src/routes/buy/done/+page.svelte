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
let timer:ReturnType<typeof setTimeout>;let attempts=0;

async function check(){
 // sessionStorage is still read so a purchase started before this change completes.
 let claim='';try{claim=localStorage.getItem('jw_claim')||sessionStorage.getItem('jw_claim')||'';}catch{/* blocked storage */}
 if(!claim){phase='lost';return;}
 try{
  const response=await fetch('/buy/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({claim_token:claim})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'');
  message=result.message||'';packageName=result.package_name||'';
  if(result.status==='PAID'){
   code=result.code;phase='paid';
   // The code is issued once. Keeping the token would only let a shared device
   // show someone else's voucher.
   try{localStorage.removeItem('jw_claim');sessionStorage.removeItem('jw_claim');}catch{/* ignore */}
   return;
  }
  if(result.status==='REFUND_DUE'){phase='refund';return;}
  if(result.status==='PENDING'){phase='pending';if(attempts++<90)timer=setTimeout(check,2000);return;}
  phase='failed';
 }catch(e){message=(e as Error).message;phase='pending';if(attempts++<90)timer=setTimeout(check,3000);}
}
async function copy(){try{await navigator.clipboard.writeText(code);copied=true;setTimeout(()=>copied=false,2000);}catch{/* selection still works */}}
onMount(()=>{check();return()=>clearTimeout(timer);});
</script>
<svelte:head><title>Vocha yako · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap buy" lang="sw"><header class="buy-top"><span class="brand-mark"><img src="/logo.webp" alt="" width="38" height="38"></span><strong>{data.brand}</strong></header><section class="portal-card"><div class="portal-body" aria-live="polite">

{#if phase==='loading'||phase==='pending'}
 <div class="wifi-symbol" aria-hidden="true"><Icon size={26}/></div>
 <p class="eyebrow">MALIPO</p><h1>Tunathibitisha malipo yako…</h1>
 <p>Usifunge ukurasa huu. Ukiombwa namba ya siri (PIN), ithibitishe kwenye simu yako.</p>
 <p class="small muted">Kwa kawaida huchukua sekunde chache.</p>
 <button class="button secondary" onclick={check}>Angalia tena</button>

{:else if phase==='paid'}
 <p class="eyebrow">IMELIPWA</p><h1>Hii hapa vocha yako.</h1>
 {#if packageName}<p>{packageName}</p>{/if}
 <p class="voucher-code">{code}</p>
 <button class="button full" onclick={copy}>{copied?'Imenakiliwa ✓':'Nakili vocha'}</button>
 <p class="small"><strong>Iandike sasa hivi.</strong> Kwa usalama wako, inaonyeshwa mara moja tu na haitumwi kwa SMS.</p>
 <!-- The code rides in the fragment, never the query string: a fragment is not
      sent to the server, so the voucher stays out of the router's HTTP log. The
      sign-in page fills it in and submits it, because only that page can do the
      CHAP handshake the hotspot requires. -->
 <a class="button full connect" href="http://10.78.0.1/login#code={code.replace(/-/g,'')}">Niunganishe sasa →</a>
 <p class="small muted">Hii inakuunganisha moja kwa moja ukiwa kwenye Wi-Fi ya duka. Hifadhi vocha yako endapo utahitaji kuingia tena.</p>
 <a class="button secondary full" href="http://10.78.0.1/login">Nitaiingiza mwenyewe</a>

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
.voucher-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:clamp(20px,7vw,30px);font-weight:700;letter-spacing:.06em;
 padding:14px;margin:14px 0;border:1px dashed var(--primary-text);border-radius:10px;background:var(--primary-soft);color:var(--primary-text);text-align:center;user-select:all;word-break:break-all}
</style>
