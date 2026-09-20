<script lang="ts">
import SellerContact from '$lib/components/SellerContact.svelte';
import {enhance} from '$app/forms';
let {data,form}=$props();let busy=$state(false);let chosen=$state('');
const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(n)+' TZS';
const duration=(m:number)=>m<60?m+' minutes':m%60===0?(m/60)+' hour'+(m===60?'':'s'):Math.floor(m/60)+'h '+(m%60)+'m';
// Hand the claim token to the browser only, then leave for the hosted checkout.
// sessionStorage keeps it out of the URL, out of history and out of any referrer.
$effect(()=>{
 if(!form?.checkout_url||!form?.claim_token)return;
 try{sessionStorage.setItem('jw_claim',form.claim_token);}catch{/* private mode: the reference on screen is the fallback */}
 window.location.href=form.checkout_url;
});
</script>
<svelte:head><title>Buy Wi-Fi · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap"><div class="portal-brand">◉ {data.brand}</div><section class="portal-card"><div class="portal-body">
<p class="eyebrow">BUY WI-FI</p><h1>Pay with your phone.</h1>

{#if !data.enabled}
 <p class="notice">Mobile payment is not available right now. Please buy a voucher from the attendant.</p>
{:else if data.items.length===0}
 <p class="notice">Every package is sold out at the moment. Please ask the attendant.</p>
{:else}
 <p>Choose a package, pay with mobile money, and get your voucher code.</p>
 <p class="small muted">Stay on the shop Wi-Fi and keep this browser open until your code appears. No mobile data bundle needed.</p>
 {#if form?.error}<p class="notice error" role="alert">{form.error}</p>{/if}
 <form method="POST" use:enhance={()=>{busy=true;return async({update})=>{await update({reset:false});busy=false;};}}>
  <fieldset disabled={busy}>
   <legend class="eyebrow">PACKAGES</legend>
   {#each data.items as item (item.id)}
    <label class="package-option">
     <input type="radio" name="package_id" value={item.id} bind:group={chosen} required>
     <span class="package-detail">
      <strong>{item.name}</strong>
      <span class="small muted">{duration(item.duration_minutes)}{#if item.download_mbps} · up to {item.download_mbps} Mbps{/if}</span>
      {#if item.description}<span class="small muted">{item.description}</span>{/if}
     </span>
     <span class="package-price">{money(item.price_tzs)}</span>
    </label>
   {/each}
   <label for="phone">Mobile money number <span class="small muted">(optional)</span></label>
   <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="07XX XXX XXX">
   <button class="button full" disabled={busy||!chosen}>{busy?'Opening payment…':'Continue to payment →'}</button>
  </fieldset>
 </form>
 <p class="small muted">You pay on your mobile money provider's secure page. We never see your PIN.</p>
 <p class="small muted">Your code is held for 15 minutes while you pay.</p>
{/if}

<SellerContact/>
{#if data.support}<p class="small">Need help? {data.support}</p>{/if}
</div></section><p class="portal-footer">Simple access. Your time, your connection.</p></main>
<style>
.package-option{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:8px 0;border:1px solid #dce7d2;border-radius:10px;cursor:pointer}
.package-option:has(input:checked){border-color:#255337;background:#f4f8ed}
.package-option input{margin:0;flex:none}
.package-detail{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.package-price{font-weight:700;white-space:nowrap}
fieldset{border:0;padding:0;margin:0}
legend{padding:0}
</style>
