<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import SellerContact from '$lib/components/SellerContact.svelte';
import {enhance} from '$app/forms';
let {data,form}=$props();let busy=$state(false);let chosen=$state('');
const number=(n:number)=>new Intl.NumberFormat('en-TZ').format(n);
// Customers buy in Swahili. Lengths, speeds and every message the purchase API
// can return come from one place, so the flow never switches language mid-way.
import {durationSw,speedSw,tsh,messageSw} from '$lib/sw';
const SW_SELLER='Wasiliana na muuzaji kununua vocha';
const SW_CALL='Mpigie muuzaji kwa 0758342054 kununua vocha';
const push=$derived(data.flow==='push');
const picked=$derived(data.items.find((item:any)=>item.id===chosen)??null);
// Hand the claim token to the browser only, then move on. Storage keeps it out
// of the URL, out of history and out of any referrer.
//
// localStorage, not sessionStorage: the payment completes on the server when
// AzamPay calls back, whether or not this page is still open, so the token has
// to survive the tab closing or the phone locking while the PIN prompt is up.
// It is removed the moment the code has been shown.
//
// Two destinations, because the two payment shapes end differently: a hosted
// page takes the buyer away, while a push leaves them here and asks their
// network to prompt the handset, so we send them straight to the waiting screen.
$effect(()=>{
 if(!form?.claim_token)return;
 try{localStorage.setItem('jw_claim',form.claim_token);}catch{/* private mode: the attendant can look the sale up by phone */}
 window.location.href=form.checkout_url||'/buy/done';
});
</script>
<svelte:head><title>Nunua Wi-Fi · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap buy" lang="sw">
 <!-- Shares a row with the theme picker, so the card starts near the top of a phone's captive-portal sheet. -->
 <header class="buy-top"><span class="brand-mark"><Icon size={18}/></span><strong>{data.brand}</strong></header>
 <section class="portal-card"><div class="portal-body">
  <p class="eyebrow">NUNUA WI-FI</p>
  <h1>Lipa kwa simu yako.</h1>

  {#if !data.enabled}
   <p class="notice">Malipo kwa simu hayapatikani kwa sasa. Tafadhali nunua vocha kwa muhudumu.</p>
  {:else if data.items.length===0}
   <p class="notice">Vifurushi vyote vimeisha kwa sasa. Tafadhali muulize muhudumu.</p>
  {:else}
   <p class="lead">Chagua kifurushi, thibitisha malipo kwenye simu yako, na vocha yako itatokea hapa hapa.</p>
   <p class="tip"><Icon name="wifi" size={15}/><span>Baki kwenye Wi-Fi hii na usifunge ukurasa huu. Huhitaji bando.</span></p>
   {#if form?.error}<p class="notice error" role="alert">{messageSw(form.error,'Imeshindikana kuanza malipo. Jaribu tena au lipa kwa muhudumu.')}</p>{/if}
   <form method="POST" use:enhance={()=>{busy=true;return async({update})=>{await update({reset:false});busy=false;};}}>
    <fieldset disabled={busy}>
     <legend class="section-label">Chagua kifurushi</legend>
     <div class="packages">
      {#each data.items as item, i (item.id)}
       <!-- Each card gets its own colour, in a fixed order, so neighbours never match. -->
       <label class="pkg tone-{i%5}">
        <input type="radio" name="package_id" value={item.id} bind:group={chosen} required>
        <span class="pkg-main">
         <strong class="pkg-name">{item.name}</strong>
         <span class="pkg-meta">
          <span><Icon name="clock" size={13}/>{durationSw(item.duration_minutes)}</span>
          {#if item.download_mbps}<span><Icon name="bolt" size={13}/>{speedSw(item.download_mbps)}</span>{/if}
         </span>
         {#if item.description}<span class="pkg-note">{item.description}</span>{/if}
        </span>
        <span class="pkg-price"><small>TSh</small><strong>{number(item.price_tzs)}</strong></span>
       </label>
      {/each}
     </div>

     <div class="pay-fields">
      {#if push}
       <label for="network">Mtandao wa malipo</label>
       <select id="network" name="network" required>
        {#each data.networks as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
       </select>
       <label for="phone">Namba ya simu itakayolipa</label>
       <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="07XX XXX XXX" required>
      {:else}
       <label for="phone">Namba ya simu <span class="optional">(si lazima)</span></label>
       <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="07XX XXX XXX">
      {/if}
     </div>
     <button class="button full pay" disabled={busy||!chosen}>{busy?(push?'Tunatuma ombi la malipo…':'Tunafungua malipo…'):picked?`Lipa ${tsh(picked.price_tzs)} →`:'Chagua kifurushi kwanza'}</button>
    </fieldset>
   </form>
   <p class="fine"><Icon name="lock" size={13}/><span>{push?'Utaombwa kuthibitisha kwa namba yako ya siri (PIN) kwenye simu yako. Sisi hatuioni kamwe.':'Utalipa kwenye ukurasa salama wa mtandao wako. Sisi hatuioni namba yako ya siri.'} Vocha yako imeshikiliwa kwa dakika 15.</span></p>
  {/if}

  <SellerContact label={SW_SELLER} callLabel={SW_CALL}/>
  {#if data.support}<p class="small support">Unahitaji msaada? {data.support}</p>{/if}
 </div></section>
 <p class="portal-footer">Intaneti rahisi. Muda wako, muunganisho wako.</p>
</main>

<style>
.lead{margin:0 0 10px;font-size:.88rem;line-height:1.5;color:var(--muted)}
.tip{display:flex;align-items:flex-start;gap:8px;margin:0;padding:8px 10px;border-radius:10px;background:var(--surface-muted);color:var(--ink);font-size:.8rem;line-height:1.45}
.tip :global(svg),.fine :global(svg){flex-shrink:0;margin-top:2px;color:var(--primary-text)}
form{margin:14px 0 0}
fieldset{border:0;padding:0;margin:0;min-width:0}
.section-label{padding:0;margin:0 0 8px;font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}

/* Package cards: a tinted face, a coloured edge and a coloured price, with the
   small text in a deeper shade of the same colour so it stays readable
   (at least 5.9:1 on its tint, in both themes). */
.packages{display:grid;gap:8px}
.pkg{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;margin:0;padding:11px 14px 11px 12px;border-radius:12px;background:var(--tone-soft);border:1px solid transparent;border-left:4px solid var(--tone);cursor:pointer;font-weight:400;flex-direction:row;transition:box-shadow .15s,border-color .15s}
.pkg:has(input:checked){border-color:var(--tone);box-shadow:0 0 0 1px var(--tone),0 6px 18px var(--shadow-color)}
.pkg input[type=radio]{margin:0;width:20px;height:20px;min-height:0;padding:0;accent-color:var(--tone)}
.pkg-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.pkg-name{font-size:.92rem;font-weight:750;color:var(--ink);letter-spacing:.01em;overflow-wrap:anywhere}
.pkg-meta{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:.76rem;color:var(--tone-deep);font-weight:550}
.pkg-meta span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.pkg-note{font-size:.74rem;color:var(--tone-deep);line-height:1.35}
.pkg-price{display:flex;flex-direction:column;align-items:flex-end;line-height:1.05;color:var(--tone-deep);white-space:nowrap}
.pkg-price strong{font-size:1.2rem;font-weight:800;letter-spacing:-.02em}
.pkg-price small{font-size:.66rem;font-weight:700;letter-spacing:.04em;margin-bottom:2px}

.tone-0{--tone:#487fff;--tone-soft:#edf3ff;--tone-deep:#2a4fa8}
.tone-1{--tone:#1f9d62;--tone-soft:#e7f7ee;--tone-deep:#0f6b41}
.tone-2{--tone:#8252e9;--tone-soft:#f3eeff;--tone-deep:#5b33b8}
.tone-3{--tone:#e3a008;--tone-soft:#fff7e5;--tone-deep:#7a4f0f}
.tone-4{--tone:#0898b5;--tone-soft:#e6f7fb;--tone-deep:#0b6275}
:global(:root[data-theme=dark]) .tone-0{--tone:#6090ff;--tone-soft:#23385d;--tone-deep:#96b7ff}
:global(:root[data-theme=dark]) .tone-1{--tone:#4cc38a;--tone-soft:#193e37;--tone-deep:#6bdaad}
:global(:root[data-theme=dark]) .tone-2{--tone:#a37cf5;--tone-soft:#322a50;--tone-deep:#b998ff}
:global(:root[data-theme=dark]) .tone-3{--tone:#e0ad4f;--tone-soft:#3d3424;--tone-deep:#f3c775}
:global(:root[data-theme=dark]) .tone-4{--tone:#3cc3dc;--tone-soft:#173d4c;--tone-deep:#67d9ed}

.pay-fields{display:grid;gap:6px;margin:14px 0 12px}
.pay-fields label{margin:6px 0 0;font-size:.8rem;font-weight:600}
.pay-fields label:first-child{margin-top:0}
.pay-fields select,.pay-fields input{min-height:44px}
.optional{font-weight:400;color:var(--muted)}
/* The deeper brand blue: white on it is 4.96:1, where the lighter #487fff is 3.65:1. */
.button.pay{min-height:48px;font-size:.95rem;background:#3869dd;color:#fff}
.button.pay:hover:not(:disabled){background:#2f5bc4}
.button.pay:disabled{opacity:.55}
.fine{display:flex;align-items:flex-start;gap:7px;margin:12px 0 0;font-size:.75rem;line-height:1.45;color:var(--muted)}
.support{margin:10px 0 0}
</style>
