<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import SellerContact from '$lib/components/SellerContact.svelte';
import {onMount} from 'svelte';
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
  if(!response.ok)throw new Error(result.error||'Could not check the payment');
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
<svelte:head><title>Your voucher · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap"><div class="portal-brand brand"><span class="brand-mark"><Icon/></span>{data.brand}</div><section class="portal-card"><div class="portal-body" aria-live="polite">

{#if phase==='loading'||phase==='pending'}
 <div class="wifi-symbol" aria-hidden="true"><Icon size={26}/></div>
 <p class="eyebrow">PAYMENT</p><h1>Confirming your payment…</h1>
 <p>Keep this page open. If your provider asked for a PIN, approve it on your phone.</p>
 <p class="small muted">This usually takes a few seconds.</p>
 <button class="button secondary" onclick={check}>Check again</button>

{:else if phase==='paid'}
 <p class="eyebrow">PAID</p><h1>Here is your code.</h1>
 {#if packageName}<p>{packageName}</p>{/if}
 <p class="voucher-code">{code}</p>
 <button class="button full" onclick={copy}>{copied?'Copied ✓':'Copy code'}</button>
 <p class="small"><strong>Write this down now.</strong> For your security it is shown once and is not sent by SMS.</p>
 <!-- The code rides in the fragment, never the query string: a fragment is not
      sent to the server, so the voucher stays out of the router's HTTP log. The
      sign-in page fills it in and submits it, because only that page can do the
      CHAP handshake the hotspot requires. -->
 <a class="button full connect" href="http://10.78.0.1/login#code={code.replace(/-/g,'')}">Connect me now →</a>
 <p class="small muted">This connects you automatically while you are on the shop Wi-Fi. Keep your code in case you need to sign in again.</p>
 <a class="button secondary full" href="http://10.78.0.1/login">Enter it myself instead</a>

{:else if phase==='refund'}
 <p class="eyebrow">NEEDS ATTENTION</p><h1>Your payment needs the attendant.</h1>
 <p>{message||'Your payment arrived after the voucher was released.'}</p>
 <p class="small">Show this screen to the attendant. Your money is recorded and will be refunded or exchanged for a voucher.</p>

{:else if phase==='lost'}
 <p class="eyebrow">PAYMENT</p><h1>We can't find this purchase on this device.</h1>
 <p>Your code is tied to the browser you paid from. If you paid, show the attendant your mobile money message.</p>
 <p class="small muted">This happens when the page is reopened in a different browser or private window.</p>
 <a class="button full" href="/buy">Start again</a>

{:else}
 <p class="eyebrow">PAYMENT</p><h1>That payment didn't complete.</h1>
 <p>{message||'No money was taken. You can try again.'}</p>
 <a class="button full" href="/buy">Try again</a>
{/if}

<SellerContact/>
{#if data.support}<p class="small">Need help? {data.support}</p>{/if}
</div></section><p class="portal-footer">Simple access. Your time, your connection.</p></main>
<style>
.voucher-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:clamp(20px,7vw,30px);font-weight:700;letter-spacing:.06em;
 padding:14px;margin:14px 0;border:1px dashed var(--primary-text);border-radius:10px;background:var(--primary-soft);color:var(--primary-text);text-align:center;user-select:all;word-break:break-all}
</style>
