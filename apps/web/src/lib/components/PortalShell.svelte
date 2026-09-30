<script lang="ts">
import type {Snippet} from 'svelte';
// The customer portal's frame, in the One Network design: a deep-blue page
// over a photo, the shop's mark and name in the top bar, a "need help" dialog
// with the seller's number, and a footer with the terms and privacy notes.
// JIACHIE has one brand, so its blues and the lime accent are fixed here.
import {openModal,closeModal} from '$lib/modal';
// bar: the page has a bar fixed to the bottom of a phone screen, so the footer needs room under it.
let {brand,phone='',support='',title,logo='/logo.webp',bar=false,children}:{brand:string;phone?:string;support?:string;title:string;logo?:string;bar?:boolean;children:Snippet}=$props();
// "JIACHIE WIFI" reads as a big first word and a small label under it.
const words=$derived(brand.trim().split(/\s+/));
const first=$derived(words[0]||brand);
const rest=$derived(words.slice(1).join(' '));
const tel=$derived(phone?'+255'+phone.replace(/^0/,''):'');
const year=new Date().getFullYear();
let info:HTMLDialogElement|undefined=$state();
let topic=$state<'help'|'terms'|'privacy'>('help');
function open(t:typeof topic){topic=t;openModal(info);}
function onBackdrop(e:MouseEvent){if(e.target===info)closeModal(info);}
</script>
<svelte:head><title>{title} · {brand}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#0d3fb6">{@html '<style>body{background:#0d3fb6!important}</style>'}</svelte:head>
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>
<symbol id="p-wifi" viewBox="0 0 24 24"><path d="M2 8.5a16 16 0 0 1 20 0M5.2 12a10.5 10.5 0 0 1 13.6 0M8.5 15.5a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r=".8" fill="currentColor" stroke="none"/></symbol>
<symbol id="p-arrow" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>
<symbol id="p-bolt" viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/></symbol>
<symbol id="p-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></symbol>
<symbol id="p-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3m3 0h2"/></symbol>
<symbol id="p-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
<symbol id="p-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="p-ticket" viewBox="0 0 24 24"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v2m0 3v2m0 3v4"/></symbol>
<symbol id="p-lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></symbol>
<symbol id="p-help" viewBox="0 0 24 24"><path d="M4 14v-3a8 8 0 0 1 16 0v3M20 17v1a3 3 0 0 1-3 3h-3"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/></symbol>
<symbol id="p-phone" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/></symbol>
<symbol id="p-close" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></symbol>
</defs></svg>
<div class="page" class:has-bar={bar} lang="sw">
<div class="container">
<header class="nav">
 <a href="/buy" class="brand" aria-label="Mwanzo wa {brand}"><span class="brand-logo"><img src={logo} alt="" width="42" height="42" loading="eager" decoding="async"></span><span class="brand-name">{first}{#if rest}<small>{rest}</small>{/if}</span></a>
 <div class="nav-right"><span class="network-status"><span class="status-dot"></span>Wi-Fi ya duka</span><button class="help-link" type="button" onclick={()=>open('help')}><svg aria-hidden="true"><use href="#p-help"/></svg>Unahitaji msaada?</button></div>
</header>
<main>{@render children()}</main>
<footer class="footer"><div class="footer-left"><svg aria-hidden="true"><use href="#p-wifi"/></svg><b>Intaneti rahisi. Muda wako, muunganisho wako.</b></div><div class="footer-links"><button type="button" onclick={()=>open('privacy')}>Faragha</button><button type="button" onclick={()=>open('terms')}>Masharti ya matumizi</button><span>© {year} {brand}</span></div></footer>
</div>
</div>
<dialog class="dialog" bind:this={info} onclick={onBackdrop} aria-labelledby="info-title">
 <button type="button" class="dialog-close" aria-label="Funga" onclick={()=>closeModal(info)}><svg aria-hidden="true"><use href="#p-close"/></svg></button>
 <div class="dialog-icon"><svg aria-hidden="true"><use href="#p-help"/></svg></div>
 {#if topic==='help'}
  <h2 id="info-title">Msaada kidogo?</h2>
  <p>Chagua kifurushi na ulipe kwa namba yako ya pesa za simu, au weka vocha uliyonunua kwa muhudumu. Unabaki kwenye Wi-Fi hii muda wote; huhitaji bando.</p>
  {#if phone}<p>Unapendelea kununua kwa mtu? <a class="contact" href={'tel:'+tel}>Mpigie {phone}</a></p>{/if}
  {#if support}<p>{support}</p>{/if}
 {:else if topic==='terms'}
  <h2 id="info-title">Vifurushi rahisi. Masharti wazi.</h2>
  <p>Vocha moja huunganisha kifaa kimoja. Muda wako unaanza unapounganisha mara ya kwanza, si unapolipa, na unaendelea mfululizo hadi uishe. Hakuna usajili na hakuna kinachojirudia chenyewe.</p>
  <p>Bei zinaonyeshwa kabla hujalipa. Kama malipo yamefanikiwa lakini vocha haijatokea, mwonyeshe muhudumu ujumbe wa malipo yako na itashughulikiwa.</p>
 {:else}
  <h2 id="info-title">Taarifa zako zinabaki hapa.</h2>
  <p>Namba yako ya simu inatumika tu kuomba malipo kutoka kwa mtoa huduma wako wa pesa za simu na kumsaidia muhudumu kupata ununuzi wako kama kuna tatizo. PIN yako inaingizwa kwenye simu yako, kamwe si kwenye ukurasa huu.</p>
  <p>Mtandao wa Wi-Fi hurekodi anwani ya kifaa unachounganisha, kama mitandao yote, ili vocha yako ifungwe nacho.</p>
 {/if}
 <button type="button" class="primary-action" onclick={()=>closeModal(info)}>Sawa</button>
</dialog>

<style>
/* JIACHIE's palette for the design: the logo's deep blue as the page, its bright
   blue as the accent, navy text on white cards, and a lime for the small marks.
   One small AVIF photo behind a gradient veil; no blur filters, so low-end
   phones stay smooth. */
.page,.dialog{--blue:#0d3fb6;--bright:#487fff;--navy:#0e2250;--lime:#c9f04b;--on-lime:#0e2250;--green:#168753;--teal:#315fce;--contact:#168753;--on-blue:#ffffff;--muted:#5c6b83;--line:#e2e8f1;--radius:24px}
.page{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:var(--navy);position:relative;isolation:isolate;overflow:hidden;min-height:100vh;min-height:100svh;background-color:var(--blue);background-image:linear-gradient(180deg,color-mix(in srgb,var(--blue) 72%,#000 0%) 0%,color-mix(in srgb,var(--blue) 40%,transparent) 45%,color-mix(in srgb,var(--blue) 70%,#000 0%) 100%),url('/portal/network-globe.avif');background-size:cover;background-position:center,75% center;background-repeat:no-repeat}
.page :global(svg){width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.page :global(button),.page :global(input){font:inherit}.page :global(button){cursor:pointer;-webkit-tap-highlight-color:transparent}.page :global(a){color:inherit}
.page :global(button:focus-visible),.page :global(a:focus-visible),.page :global(input:focus-visible){outline:3px solid #70bdff;outline-offset:4px}
.container{width:min(1180px,calc(100% - 80px));max-width:none;margin:auto}
.nav{height:99px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff20;color:white}.network-status,.footer{color:#dce9f8}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-size:inherit;letter-spacing:0}
.brand-logo{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;box-shadow:0 0 0 1px #ffffff55,0 8px 20px #00143a55;overflow:hidden;flex-shrink:0}.brand-logo img{display:block;width:100%;height:100%;object-fit:cover}
.brand-name{font-size:30px;font-weight:850;line-height:.9;letter-spacing:-1.6px;text-transform:lowercase}.brand-name small{display:block;font-weight:500;font-size:9px;letter-spacing:3px;line-height:1;margin:6px 0 0 2px;text-transform:uppercase}
.nav-right{display:flex;align-items:center;gap:27px;font-size:12px}.network-status{display:flex;align-items:center;gap:8px;color:#dfebfb}.status-dot{height:6px;width:6px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 4px color-mix(in srgb,var(--lime) 15%,transparent)}
.help-link{border:1px solid #ffffff38;border-radius:30px;color:white;background:rgba(7,43,87,.34);padding:10px 15px;display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;min-height:0}.help-link svg{width:16px;height:16px}.help-link:hover{background:#ffffff14}
.footer{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:36px;padding:22px 0 25px;border:0;border-top:1px solid #ffffff20;background:none;color:#b0c9e7;font-size:10px}.footer-left{display:flex;align-items:center;gap:10px}.footer-left b{color:#ecf3ff;font-size:11px;font-weight:550}.footer-left svg{color:var(--lime);height:16px;width:16px}.footer-links{display:flex;align-items:center;gap:22px}.footer-links button{border:0;background:none;color:inherit;font-size:10px;padding:5px 0;min-height:0}
.dialog{border:0;padding:30px;border-radius:24px;max-width:410px;width:calc(100% - 36px);color:var(--navy);background:#fff;box-shadow:0 30px 100px #00153455;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:auto}.dialog::backdrop{background:#031e46a6;backdrop-filter:blur(7px)}
.dialog svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.dialog-close{position:absolute;right:13px;top:13px;height:32px;width:32px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f4f9;color:#63728a;cursor:pointer;min-height:0;padding:0}.dialog-close svg{width:16px;height:16px}
.dialog-icon{height:60px;width:60px;border-radius:20px;background:#eef4ff;color:var(--blue);display:grid;place-items:center;margin:4px 0 24px}.dialog-icon svg{width:29px;height:29px}
.dialog h2{font-size:27px;letter-spacing:-1px;line-height:1.15;margin:0 0 12px;font-weight:750;color:var(--navy)}.dialog p{font-size:13px;line-height:1.7;color:#5c6b83;margin:0 0 16px}.dialog .contact{color:var(--contact);font-weight:700;text-decoration:underline;text-underline-offset:3px}
.primary-action{height:46px;display:flex;gap:8px;justify-content:center;align-items:center;width:100%;border:0;background:var(--blue);color:var(--on-blue);border-radius:10px;font-size:12px;font-weight:650;cursor:pointer}
@media(max-width:1050px){.container{width:calc(100% - 48px)}}
@media(max-width:800px){.page{background-position:center,79% center}.page.has-bar{padding-bottom:calc(72px + env(safe-area-inset-bottom))}.container{width:min(570px,calc(100% - 36px))}.nav{height:65px}.brand-logo{width:34px;height:34px;border-radius:9px}.brand-name{font-size:23px}.brand-name small{font-size:6px;margin-top:5px;letter-spacing:2.8px}.nav-right{gap:12px}.network-status{display:none}.help-link{padding:9px 12px;font-size:11px}.footer{margin-top:9px;padding:8px 0 12px;flex-direction:column;gap:0;border:0}.footer-left{display:none}.footer-links{gap:20px}.footer-links button{font-size:9px}.dialog{padding:26px}.dialog h2{font-size:26px}}
@media(max-width:360px){.container{width:calc(100% - 28px)}.help-link{font-size:10px}}
</style>
