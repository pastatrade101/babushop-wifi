<script lang="ts">
import PortalShell from '$lib/components/PortalShell.svelte';
import {enhance} from '$app/forms';
import {durationSw,messageSw} from '$lib/sw';
import {providerClass,providerText,providerSmall} from '$lib/providers';
import {openModal,closeModal} from '$lib/modal';
let {data,form}=$props();
// The One Network portal: packages as cards, a voucher panel that hands the
// code to the router's sign-in page, and a checkout with the mobile money
// providers as tiles. The shop's real packages drive the cards; the checkout
// drives the purchase API. Nothing here is a sample.
let busy=$state(false);
let chosen=$state('');
let voucherMode=$state(false);
let voucher=$state('');let voucherError=$state('');
let sheet:HTMLDialogElement|undefined=$state();
const number=(n:number)=>new Intl.NumberFormat('en-US').format(n);
const push=$derived(data.flow==='push');
const picked=$derived(data.items.find((item:any)=>item.id===chosen)??null);
$effect(()=>{if(!chosen&&data.items.length)chosen=data.items[0].id;});
const icon=(minutes:number)=>minutes<=180?'p-bolt':minutes<=1440?'p-sun':'p-calendar';
// Hand the claim token to the browser only, then move on. Storage keeps it out
// of the URL, out of history and out of any referrer. localStorage, because
// the payment completes on the server whether or not this page stays open.
$effect(()=>{
 if(!form?.claim_token)return;
 try{localStorage.setItem('jw_claim',form.claim_token);}catch{/* private mode: the attendant can look the sale up by phone */}
 window.location.href=form.checkout_url||'/buy/done';
});
// A voucher bought at the counter. The code rides in the fragment, never the
// query string, so it stays out of the router's HTTP log; the sign-in page
// fills it in and does the CHAP login.
function redeem(e:SubmitEvent){
 e.preventDefault();
 const code=voucher.trim().toUpperCase().replace(/[\s-]/g,'');
 if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code)){voucherError='Weka herufi zote 16 za vocha yako. Vistari si lazima.';return;}
 voucherError='';window.location.href=data.loginUrl+'#code='+code;
}
function openSheet(){openModal(sheet);}
function onBackdrop(e:MouseEvent){if(e.target===sheet)closeModal(sheet);}
const submitting=()=>{busy=true;return async({update}:{update:(o?:{reset?:boolean})=>Promise<void>})=>{await update({reset:false});busy=false;};};
</script>

{#snippet checkout(prefix:string)}
<section class="checkout" aria-labelledby="{prefix}-title">
 <div class="section-heading"><span class="step">02</span><h2 id="{prefix}-title">Kamilisha malipo.</h2></div><p class="section-subtitle">Malipo moja rahisi. Ukishalipa, tunakuunganisha kwenye Wi-Fi moja kwa moja.</p>
 {#if !data.enabled}
  <p class="notice">Malipo kwa simu hayapatikani kwa sasa. Tafadhali nunua vocha kwa muhudumu{#if data.phone}, au mpigie <a href={'tel:+255'+data.phone.replace(/^0/,'')}>{data.phone}</a>{/if}.</p>
 {:else if data.items.length===0}
  <p class="notice">Vifurushi vyote vimeisha kwa sasa. Tafadhali muulize muhudumu.</p>
 {:else}
 <form method="POST" use:enhance={submitting}>
  <input type="hidden" name="package_id" value={chosen}>
  <fieldset disabled={busy}>
  {#if push}
   <p class="checkout-label" id="{prefix}-pay">Lipa kwa pesa za simu</p>
   <div class="payment-options" role="radiogroup" aria-labelledby="{prefix}-pay">
    {#each data.networks as option,i (option.value)}
     <label class="payment-option"><input type="radio" name="network" value={option.value} checked={i===0} required aria-label={option.label}><span class={providerClass(option.value)}><b>{providerText(option.value,option.label)}</b>{#if providerSmall(option.value)}<small>{providerSmall(option.value)}</small>{/if}</span></label>
    {/each}
   </div>
   <label for="{prefix}-phone" class="checkout-label phone-label">Namba yako ya pesa za simu</label>
   <div class="phone-field"><span class="phone-country"><span>TZ</span>+255</span><input type="tel" id="{prefix}-phone" name="phone" placeholder="7XX XXX XXX" inputmode="tel" autocomplete="tel-national" maxlength="18" required></div>
   <p class="field-help">Tumia namba utakayolipa nayo. Utathibitisha kwa PIN kwenye simu yako.</p>
  {:else}
   <label for="{prefix}-phone" class="checkout-label phone-label">Namba yako ya simu <span class="optional">(si lazima)</span></label>
   <div class="phone-field"><span class="phone-country"><span>TZ</span>+255</span><input type="tel" id="{prefix}-phone" name="phone" placeholder="7XX XXX XXX" inputmode="tel" autocomplete="tel-national" maxlength="18"></div>
   <p class="field-help">Utalipa kwenye ukurasa salama wa mtandao wako. Namba humsaidia muhudumu kupata ununuzi wako.</p>
  {/if}
  {#if form?.error}<p class="field-error" role="alert">{messageSw(form.error,'Imeshindikana kuanza malipo. Jaribu tena au lipa kwa muhudumu.')}</p>{/if}
  <div class="summary" aria-live="polite">
   <p class="summary-line"><span>{picked?`${picked.name} · ${durationSw(picked.duration_minutes)}`:'Chagua kifurushi'}</span><strong>{picked?`TSh ${number(picked.price_tzs)}`:''}</strong></p>
   <p class="summary-line"><span>Ada ya huduma</span><strong class="free">Bure</strong></p>
   <div class="summary-total"><span>Jumla ya kulipa</span><strong><small>TSh</small>{picked?number(picked.price_tzs):'0'}</strong></div>
  </div>
  <button class="pay-button" type="submit" disabled={busy||!picked}>{busy?(push?'Tunatuma ombi la malipo…':'Tunafungua malipo salama…'):picked?`Lipa TSh ${number(picked.price_tzs)} na uunganishe`:'Chagua kifurushi kwanza'}<svg aria-hidden="true"><use href="#p-arrow"/></svg></button>
  </fieldset>
 </form>
 <p class="secure"><svg aria-hidden="true"><use href="#p-lock"/></svg>Malipo salama. PIN yako inabaki kwenye simu yako. Vocha yako imeshikiliwa kwa dakika 15.</p>
 {/if}
</section>
{/snippet}

<PortalShell brand={data.brand} phone={data.phone} support={data.support} logo={data.logo} title="Ungana sasa" bar={data.enabled&&data.items.length>0&&!voucherMode}>
<section class="hero" aria-labelledby="hero-title"><div><h1 id="hero-title">Ungana sasa.</h1><p class="hero-description">Chagua kifurushi cha Wi-Fi au tumia vocha yako.</p></div></section>
<div class="mobile-switcher" role="group" aria-label="Njia ya kuunganisha"><button type="button" aria-pressed={!voucherMode} onclick={()=>voucherMode=false}><svg aria-hidden="true"><use href="#p-wifi"/></svg>Nunua kifurushi</button><button type="button" aria-pressed={voucherMode} onclick={()=>voucherMode=true}><svg aria-hidden="true"><use href="#p-ticket"/></svg>Tumia vocha</button></div>
<div class="portal-grid" class:voucher-mode={voucherMode}>
<div class="shop">
 <section class="package-panel" aria-labelledby="package-title">
  <div class="section-heading"><h2 id="package-title">Chagua kifurushi</h2></div>
  {#if !data.enabled||data.items.length===0}
   <p class="notice">{!data.enabled?'Vifurushi vinauzwa na muhudumu kwa sasa. Omba vocha, kisha uiweke hapa chini.':'Vifurushi vyote vimeisha kwa sasa. Tafadhali muulize muhudumu.'}</p>
  {:else}
  <div class="plans" role="radiogroup" aria-label="Chagua kifurushi chako cha Wi-Fi">
   {#each data.items as item (item.id)}
    <label class="plan"><input type="radio" name="plan" value={item.id} bind:group={chosen}><span class="plan-face"><span class="plan-top"><span class="plan-icon"><svg aria-hidden="true"><use href="#{icon(item.duration_minutes)}"/></svg></span><span class="radio-dot"></span></span><span class="plan-duration">{durationSw(item.duration_minutes)}</span><span class="plan-name">{item.name}</span><span class="plan-price"><small>TSh</small>{number(item.price_tzs)}</span><span class="plan-speed">{item.download_mbps?`Kasi hadi Mbps ${item.download_mbps}`:item.description||'Kasi kamili'}</span></span></label>
   {/each}
  </div>
  <div class="included"><span><svg aria-hidden="true"><use href="#p-check"/></svg>Data bila kikomo</span><span><svg aria-hidden="true"><use href="#p-check"/></svg>Kifaa 1 kwa vocha</span><span><svg aria-hidden="true"><use href="#p-check"/></svg>Hakuna usajili</span></div>
  <p class="activation-note"><svg aria-hidden="true"><use href="#p-clock"/></svg>Muda wako unaanza unapounganisha, si unapolipa.</p>
  {/if}
 </section>
 <section class="voucher-panel" aria-labelledby="voucher-title"><div class="voucher-intro"><span class="ticket-icon"><svg aria-hidden="true"><use href="#p-ticket"/></svg></span><div><h2 class="voucher-title" id="voucher-title">Tayari una vocha?</h2><p class="voucher-copy">Vocha yako ndiyo njia ya mkato. Iweke na uingie.</p></div></div><div><form class="voucher-form" onsubmit={redeem} novalidate><label for="voucher" class="sr-only">Vocha yako</label><input id="voucher" name="voucher" bind:value={voucher} placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" aria-describedby="voucher-error" aria-invalid={voucherError?'true':'false'}><button type="submit" class="voucher-submit">Unganisha<svg aria-hidden="true"><use href="#p-arrow"/></svg></button></form><p class="voucher-error" id="voucher-error" role="alert" hidden={!voucherError}>{voucherError}</p></div></section>
</div>
<div class="checkout-desktop">{@render checkout('desk')}</div>
</div>
{#if data.enabled&&data.items.length}
<div class="mobile-continue" class:hidden={voucherMode}><div class="mobile-continue-info" aria-live="polite"><small>{picked?`${picked.name} · ${durationSw(picked.duration_minutes)}`:'Chagua kifurushi'}</small><strong><span>TSh</span>{picked?number(picked.price_tzs):'0'}</strong></div><button type="button" onclick={openSheet} disabled={!picked}>Endelea<svg aria-hidden="true"><use href="#p-arrow"/></svg></button></div>
{/if}
</PortalShell>
<dialog class="mobile-checkout-sheet" bind:this={sheet} onclick={onBackdrop} aria-label="Malipo"><button type="button" class="dialog-close" aria-label="Funga malipo" onclick={()=>closeModal(sheet)}><svg aria-hidden="true"><use href="#p-close"/></svg></button>{@render checkout('sheet')}</dialog>

<style>
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
/* The checkout sheet lives outside the shell's frame, so it carries the palette itself. */
.mobile-checkout-sheet{--blue:#0d3fb6;--bright:#487fff;--navy:#0e2250;--lime:#c9f04b;--on-lime:#0e2250;--teal:#315fce;--contact:#168753;--on-blue:#ffffff}
.hero{display:block;min-height:0;padding:23px 0 22px;color:white}.hero h1{font-size:29px;line-height:1.15;letter-spacing:-.8px;margin:0;font-weight:760}.hero-description{display:block;margin:7px 0 0;font-size:12px;line-height:1.4;color:#dce9f8}
.portal-grid{display:grid;grid-template-columns:minmax(0,1fr) 355px;gap:22px;align-items:start}.shop{min-width:0}
/* The package list is a glass surface over the photo: translucent fills, white text, the lime tick for the chosen one. Solid rgba, no backdrop blur. */
.package-panel{background:transparent;border:0;border-radius:0;padding:0;color:#fff}.package-panel .section-heading h2{color:#fff;font-size:16px;font-weight:600;letter-spacing:-.2px}
.section-heading{display:flex;align-items:center;justify-content:flex-start;gap:12px;margin:0}.step{border-radius:50%;width:27px;height:27px;display:grid;place-items:center;font-size:11px;font-weight:750;background:color-mix(in srgb,var(--bright) 10%,white);color:var(--blue);flex-shrink:0}.section-heading h2{font-size:19px;letter-spacing:-.5px;line-height:1.25;margin:0;font-weight:750}.section-subtitle{margin:8px 0 0 39px;font-size:12px;line-height:1.6;color:#5c6b83}
.notice{margin:20px 0 0;padding:12px 14px;border:0;border-radius:10px;background:#fff4e5;color:#7a4b00;font-size:12px;line-height:1.55}.notice a{color:var(--contact);font-weight:700}.package-panel .notice{margin-top:14px;background:rgba(7,28,57,.55);color:#fbe7c4;border:1px solid #ffffff26}
.plans{margin:14px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.plan{position:relative;display:flex;min-width:0;cursor:pointer;margin:0}.plan input{position:absolute;opacity:0;width:1px;height:1px}
.plan-face{position:relative;display:flex;flex-direction:column;width:100%;border:1px solid #ffffff26;border-radius:12px;background:rgba(7,28,57,.62);padding:18px;min-height:184px;color:#fff}.plan input:checked+.plan-face{border-color:#ffffff38;background:rgba(255,255,255,.14)}.plan input:focus-visible+.plan-face{outline:2px solid #70bdff;outline-offset:3px}.plan:hover .plan-face{border-color:#ffffff55}
.plan-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}.plan-icon{display:grid;place-items:center;color:#c0d4e8}.plan-icon svg{height:22px;width:22px}.radio-dot{width:16px;height:16px;border:1.5px solid #ffffff66;border-radius:50%;display:grid;place-items:center}.plan input:checked+.plan-face .radio-dot{background:var(--lime);border-color:var(--lime)}.plan input:checked+.plan-face .radio-dot:after{content:"";height:4px;width:7px;border-left:1.6px solid var(--on-lime);border-bottom:1.6px solid var(--on-lime);transform:rotate(-45deg) translateY(-1px)}
.plan-duration{font-size:11px;font-weight:500;color:#c9d8e8;display:block;margin-bottom:5px;text-transform:none}.plan-name{display:block;font-weight:600;font-size:17px;letter-spacing:-.4px;margin-bottom:15px;overflow-wrap:anywhere}.plan-price{font-size:27px;letter-spacing:-1px;font-weight:700;white-space:nowrap}.plan-price small{font-size:10px;letter-spacing:0;font-weight:500;color:#c9d8e8;margin-right:4px}.plan-speed{font-size:10px;color:#c9d8e8;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.included{display:flex;flex-wrap:wrap;gap:19px;font-size:10px;color:#e0ecf7;margin-top:13px;align-items:center}.included span{display:flex;align-items:center;gap:5px}.included svg{width:14px;height:14px;color:#b8e4d3}.activation-note{display:flex;align-items:center;gap:6px;margin:16px 0 0;padding-top:14px;border-top:1px solid #ffffff24;color:#d0e1f1;font-size:10px}.activation-note svg{height:13px;width:13px}
.voucher-panel{display:grid;grid-template-columns:1fr;gap:17px;position:relative;border:1px solid #ffffff33;border-radius:20px;margin-top:18px;padding:22px 25px;color:white;background:rgba(5,31,65,.78)}.voucher-intro{display:flex;align-items:center;gap:12px}.ticket-icon{height:39px;width:39px;border:1px solid #ffffff25;background:#ffffff0a;border-radius:11px;display:grid;place-items:center;color:var(--lime);flex-shrink:0}.ticket-icon svg{height:21px;width:21px}.voucher-title{font-size:15px;font-weight:650;margin:0 0 4px;letter-spacing:-.2px}.voucher-copy{font-size:11px;color:#c1d2e9;margin:0}
.voucher-form{display:flex;gap:9px}.voucher-form input{color:white;border:1px solid #ffffff38;background:#06295777;min-width:0;width:100%;height:45px;border-radius:9px;padding:0 14px;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.voucher-form input::placeholder{color:#a9c2df;text-transform:none;letter-spacing:0;font-family:inherit}.voucher-submit{height:45px;padding:0 20px;display:flex;gap:11px;align-items:center;border:0;border-radius:9px;background:var(--lime);color:var(--on-lime);font-size:12px;font-weight:750;white-space:nowrap}.voucher-submit svg{width:15px;height:15px}.voucher-submit:hover{filter:brightness(1.06)}.voucher-error{font-size:12px;color:#ffe2cb;margin:9px 0 0;line-height:1.5}
.checkout{background:white;border-radius:24px;padding:27px 25px 22px;box-shadow:0 20px 50px #0024561c;color:var(--navy)}.checkout .section-heading{gap:10px}.checkout .section-subtitle{margin-left:37px;font-size:11px}.checkout fieldset{border:0;padding:0;margin:0;min-width:0}
.checkout-label{display:block;font-size:11px;font-weight:650;letter-spacing:.1px;margin:26px 0 10px;color:var(--navy)}.optional{font-weight:500;color:#64748b}
.payment-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(54px,1fr));gap:6px}.payment-option{position:relative;cursor:pointer;min-width:0;margin:0}.payment-option input{position:absolute;opacity:0;width:1px;height:1px}.payment-option span{height:48px;display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:center;border:1px solid #e2e8f1;border-radius:9px;font-size:10px;color:#5c6b83;position:relative;padding:0 4px;text-align:center;min-width:0;overflow:hidden}.payment-option input:checked+span{border-color:var(--bright);background:color-mix(in srgb,var(--bright) 6%,white);box-shadow:0 0 0 .5px var(--bright)}.payment-option input:focus-visible+span{outline:3px solid #70bdff;outline-offset:3px}
.payment-option b{font-size:12px;font-weight:800;letter-spacing:-.6px;color:var(--navy);white-space:nowrap}.payment-option .mpesa b{color:#e32939}.payment-option .airtel b{font-size:13px;font-style:italic;color:#e32939}.payment-option .mixx b{color:#172b6c;font-size:15px;line-height:1;letter-spacing:-.8px}.payment-option .halo b{color:#e8592a}.payment-option .azam b{color:#0a7f8c}.payment-option .plain b{font-size:10px;letter-spacing:0}.payment-option small{font-size:7px;font-weight:600;color:#172b6c;white-space:nowrap}
.phone-label{margin-top:23px}.phone-field{display:flex;border:1px solid #dce3ed;border-radius:9px;background:#fff;align-items:center;height:46px}.phone-country{font-size:12px;font-weight:600;padding:0 12px;border-right:1px solid #e5e9f0;display:flex;align-items:center;gap:7px;white-space:nowrap;color:var(--navy)}.phone-country span{font-size:10px;font-weight:750;color:#4d6b52}.phone-field input{width:100%;min-width:0;padding:12px;border:0;border-radius:0 9px 9px 0;font-size:14px;color:var(--navy);background:transparent}.phone-field input::placeholder{color:#a7b1c1}
.field-help{font-size:11px;line-height:1.6;color:#64748b;margin:7px 0 0}.field-error{color:#b33433;font-size:11px;line-height:1.6;margin:12px 0 0;padding:10px 12px;background:#fff1f0;border-radius:8px}
.summary{border:0;border-top:1px dashed #dbe3ee;margin:24px 0 0;padding:18px 0 0;background:none}.summary-line{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:11px;color:#5c6b83;margin:0 0 11px}.summary-line strong{font-size:11px;font-weight:650;color:var(--navy)}.summary-line .free{color:var(--teal)}.summary-total{display:flex;justify-content:space-between;align-items:center;margin-top:17px;font-size:12px;font-weight:700;color:var(--navy)}.summary-total strong{font-size:25px;letter-spacing:-1px;font-weight:700}.summary-total strong small{font-size:11px;letter-spacing:0;font-weight:500;color:#5c6b83;margin-right:4px}
.pay-button{display:flex;width:100%;height:49px;margin:20px 0 0;align-items:center;justify-content:center;gap:13px;background:var(--blue);color:var(--on-blue);border:0;border-radius:10px;font-weight:700;font-size:12px}.pay-button svg{width:16px;height:16px;color:var(--lime)}.pay-button:hover:not(:disabled){filter:brightness(.92)}.pay-button:disabled{opacity:.6;cursor:default}
.secure{display:flex;justify-content:center;align-items:center;gap:5px;color:#64748b;font-size:11px;margin:12px 0 0;text-align:center}.secure svg{height:12px;width:12px;flex-shrink:0}
.mobile-switcher,.mobile-continue,.mobile-checkout-sheet{display:none}
.mobile-checkout-sheet{z-index:50;padding:0;border:0;border-radius:24px;width:min(420px,calc(100% - 30px));color:var(--navy);background:#fff}.mobile-checkout-sheet::backdrop{background:#031e46a6;backdrop-filter:blur(7px)}
.dialog-close{position:absolute;z-index:2;right:10px;top:10px;height:30px;width:30px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f4f9;color:#63728a;cursor:pointer}.dialog-close svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.mobile-checkout-sheet svg{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.mobile-checkout-sheet{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
@media(prefers-reduced-motion:no-preference){.plan-face,.payment-option span,.pay-button,.voucher-submit{transition:background .16s,border-color .16s,box-shadow .16s,filter .16s}}
@media(max-width:1050px){.portal-grid{grid-template-columns:minmax(0,1fr) 320px;gap:17px}.plans{gap:8px}.plan-face{padding:17px 11px;min-height:194px}.plan-name{font-size:15px}.plan-price{font-size:23px}.plan-price small{display:block;margin:0 0 2px}.plan-speed{font-size:9px}.checkout{padding:25px 22px}.included{gap:12px}.voucher-panel{padding:21px}}
@media(max-width:800px){
 .hero{padding:17px 0 16px}.hero h1{font-size:23px;line-height:1.15;letter-spacing:-.6px}.hero-description{margin-top:5px;font-size:10px}
 .mobile-switcher{display:flex;gap:4px;padding:4px;margin:0 0 15px;border:1px solid #ffffff25;border-radius:11px;background:rgba(5,31,65,.55)}.mobile-switcher button{display:flex;align-items:center;justify-content:center;gap:7px;flex:1;min-height:38px;border:0;border-radius:7px;background:transparent;color:#caddf3;font-size:11px;font-weight:650}.mobile-switcher button svg{width:14px;height:14px}.mobile-switcher button[aria-pressed=true]{background:white;color:var(--blue);box-shadow:0 2px 4px #00194111}
 .portal-grid{display:flex;flex-direction:column;align-items:stretch;gap:18px}.shop,.package-panel,.voucher-panel{width:100%}.checkout-desktop{display:none}
 .package-panel{padding:0;border-radius:0}.package-panel .section-heading h2{font-size:13px;font-weight:600}
 .plans{grid-template-columns:1fr;gap:0;margin-top:10px;border:1px solid #ffffff26;border-radius:12px;background:rgba(7,28,57,.62);overflow:hidden}
 .plan-face{display:grid;grid-template-columns:20px minmax(0,1fr) auto 16px;grid-template-rows:auto auto;column-gap:10px;row-gap:5px;min-height:65px;padding:13px 14px;border:0;border-radius:0;background:transparent;align-items:center}.plan+.plan .plan-face{border-top:1px solid #ffffff1a}.plan input:checked+.plan-face{background:#ffffff12;border-color:#ffffff1a}.plan input:focus-visible+.plan-face{outline:2px solid #247cdd;outline-offset:-3px}.plan-top{display:contents}.plan-icon{grid-column:1;grid-row:1 / 3;width:20px;height:20px;border-radius:0;background:none;color:#c0d4e8}.plan-icon svg{width:18px;height:18px;stroke-width:1.6}.radio-dot{grid-column:4;grid-row:1 / 3;justify-self:end;width:15px;height:15px;border-width:1px}
 .plan-name{grid-column:2;grid-row:1;font-size:13px;line-height:1.2;letter-spacing:-.15px;margin:0}.plan-duration{grid-column:2;grid-row:2;font-size:10px;line-height:1.3;margin:0;font-weight:400;text-transform:none}.plan-price{grid-column:3;grid-row:1;font-size:20px;line-height:1;letter-spacing:-.65px;justify-self:end;font-weight:650}.plan-price small{display:inline;font-size:8px;font-weight:400;margin:0 3px 0 0}.plan-speed{grid-column:3;grid-row:2;font-size:9px;line-height:1.2;margin:0;justify-self:end;font-weight:400}
 .included{margin-top:12px;font-size:8px;gap:4px;justify-content:space-between}.included span{gap:4px}.included svg{width:10px;height:10px}.activation-note{display:none}
 .voucher-panel{display:none;margin-top:0;padding:21px 18px;border-radius:17px;gap:15px}.voucher-mode .package-panel{display:none}.voucher-mode .voucher-panel{display:grid}.voucher-copy{font-size:11px;line-height:1.6}.voucher-form input{font-size:16px;letter-spacing:0;padding-left:11px}.voucher-form input::placeholder{font-size:11px}.voucher-form input,.voucher-submit{height:46px}.voucher-submit{padding:0 16px;font-size:11px}
 .mobile-continue{position:fixed;z-index:10;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:14px;background:rgba(6,33,72,.95);border-top:1px solid #ffffff2b;box-shadow:0 -10px 25px #002b5210;padding:13px max(18px,calc((100% - 570px)/2)) max(13px,env(safe-area-inset-bottom));color:white}.mobile-continue.hidden{display:none}.mobile-continue-info{min-width:0}.mobile-continue-info small{display:block;font-size:9px;line-height:1.3;color:#c9dcf3;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mobile-continue-info strong{font-size:21px;line-height:1;letter-spacing:-.6px;font-weight:700}.mobile-continue-info strong span{font-size:9px;font-weight:500;letter-spacing:0;margin-right:4px;color:#c9dcf3}.mobile-continue button{display:flex;align-items:center;justify-content:center;gap:12px;border:0;background:var(--lime);color:var(--on-lime);border-radius:10px;min-height:43px;padding:0 24px;font-size:12px;font-weight:750;white-space:nowrap}.mobile-continue button:disabled{opacity:.6}.mobile-continue button svg{width:16px;height:16px}
 /* The checkout is a centred popup: opens at once, one short fade, compact enough to fit a phone screen without scrolling. */
 .mobile-checkout-sheet{display:block;position:fixed;inset:0;margin:auto;width:min(calc(100% - 24px),420px);max-width:none;max-height:calc(100svh - 24px);height:fit-content;overflow-y:auto;border-radius:20px;box-shadow:0 24px 70px #00183660;animation:sheet-in .12s ease-out}.mobile-checkout-sheet:not([open]){display:none}
 @keyframes sheet-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
 .mobile-checkout-sheet .checkout{border-radius:20px;padding:20px 18px 16px;box-shadow:none}.mobile-checkout-sheet .checkout .section-heading h2{font-size:17px}.mobile-checkout-sheet .checkout .section-subtitle{display:none}.mobile-checkout-sheet .checkout-label{margin:16px 0 8px;font-size:11px}.mobile-checkout-sheet .payment-options{gap:5px}.mobile-checkout-sheet .payment-option span{height:44px}.mobile-checkout-sheet .phone-label{margin-top:14px}.mobile-checkout-sheet .phone-field{height:44px}.mobile-checkout-sheet .field-help{font-size:11px;margin-top:5px}.mobile-checkout-sheet .summary{margin-top:14px;padding-top:12px}.mobile-checkout-sheet .summary-line{margin-bottom:7px}.mobile-checkout-sheet .summary-total{margin-top:10px}.mobile-checkout-sheet .summary-total strong{font-size:22px}.mobile-checkout-sheet .pay-button{margin-top:14px;height:46px}.mobile-checkout-sheet .secure{margin-top:9px;font-size:11px}
 .payment-option span{height:46px}.payment-option b{font-size:12px}.payment-option .airtel b{font-size:13px}.phone-field{height:48px}.phone-field input{font-size:16px}.checkout-label{font-size:12px}.field-help{font-size:11px}.summary-line,.summary-line strong{font-size:12px}.secure{font-size:11px}.pay-button{height:50px;font-size:13px}
}
@media(max-width:360px){.hero h1{font-size:21px}.plan-face{grid-template-columns:minmax(0,1fr) auto 15px;column-gap:9px;padding:12px}.plan-icon{display:none}.plan-name,.plan-duration{grid-column:1}.plan-price,.plan-speed{grid-column:2}.radio-dot{grid-column:3}.plan-name{font-size:12px}.plan-price{font-size:18px}.plan-price small{font-size:7px}.voucher-submit{padding:0 12px}.checkout{padding:23px 18px}.mobile-continue button{padding:0 17px}.mobile-continue-info strong{font-size:20px}}
</style>
