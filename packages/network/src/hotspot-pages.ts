// The branded MikroTik HotSpot pages, in the One Network design the customer
// pages use, so a buyer sees one design from the sign-in prompt to the receipt.
//
// The pages are self-contained: they work before internet authorization and
// use the device's own font. The router keeps its own md5.js, which login.html
// uses for CHAP; theme.js is one of the files here, so the portal can publish
// the whole set through the REST API without WinBox.

export type HotspotBrand={brand:string;support:string;sellerPhone:string;buyUrl:string;statusUrl:string};

/** Every file the pages need, in the order they are published: theme.js first, so no page goes live before the script it loads. */
export const HOTSPOT_FILES=['theme.js','login.html','flogin.html','status.html','logout.html','alogin.html'] as const;

/** The shop's own checkout, and the only default a customer's phone can open from the hotspot. */
export const DEFAULT_BUY_URL='https://jiachie-wifi.com/buy';
const PRIVATE_HOST=/^(localhost|.+\.localhost|.+\.local|.+\.test|.+\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[[0-9a-f:.]*\])$/i;
/** A public https address: what a phone on the hotspot, not yet online, can open through the walled garden. */
export function isPublicUrl(url:URL){return url.protocol==='https:'&&!!url.hostname&&!PRIVATE_HOST.test(url.hostname)&&url.hostname.includes('.');}

/**
 * Where the pages' "Nunua vocha" button goes. HOTSPOT_BUY_URL when set, and it
 * must be public; otherwise the portal's own APP_ORIGIN when that is public;
 * otherwise the shop's checkout. A developer's .env points APP_ORIGIN at
 * 127.0.0.1, and a page built from it would send every customer to their own
 * phone, so a private address is never used.
 */
export function publicBuyUrl(env:Record<string,string|undefined>=process.env):string{
 const explicit=env.HOTSPOT_BUY_URL?.trim();
 if(explicit){
  let url:URL;
  try{url=new URL(explicit);}catch{throw new Error(`HOTSPOT_BUY_URL is not a web address: ${explicit}`);}
  if(!isPublicUrl(url))throw new Error(`HOTSPOT_BUY_URL must be a public https address a customer's phone can open, not ${explicit}`);
  return url.href;
 }
 const origin=env.APP_ORIGIN?.trim();
 if(origin){try{const url=new URL(origin.replace(/\/+$/,'')+'/buy');if(isPublicUrl(url))return url.href;}catch{/* fall through to the shop's checkout */}}
 return DEFAULT_BUY_URL;
}

/** The pages' settings from the environment, shared by `pnpm hotspot:build` and the portal's Publish button so both produce the same files. */
export function hotspotBrandFromEnv(env:Record<string,string|undefined>=process.env):HotspotBrand{
 let statusUrl='http://10.78.0.1/status';
 try{const u=new URL(env.HOTSPOT_LOGIN_URL||'http://10.78.0.1/login');statusUrl=`${u.protocol}//${u.host}/status`;}catch{/* keep the default */}
 return {brand:env.WIFI_BRAND||'JIACHIE WIFI',support:env.WIFI_SUPPORT_CONTACT||'',sellerPhone:env.WIFI_SELLER_PHONE||'0758342054',buyUrl:publicBuyUrl(env),statusUrl};
}

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)).replaceAll('$','&#36;');

/** JIACHIE's palette for the design: the logo's deep blue as the page, its bright blue as the accent, navy text, a lime for the small marks. Dark mode keeps its own surfaces and lightens the accents. */
const style=`
:root{color-scheme:light;--page:#0d3fb6;--page-2:#345ec2;--page-3:#0a318e;--on-page:#ffffff;--bg:#f5f6fa;--card:#fff;--ink:#0e2250;--muted:#64748b;--line:#e5e7eb;--soft:#e9f0ff;--deco:#c9f04b;--on-deco:#0e2250;--blue:#487fff;--on-blue:#ffffff;--primary:#0d3fb6;--on-primary:#ffffff;--link:#315fce;--ok:#168753;--contact:#168753;--error:#c43c3c;--error-bg:#fff0f0}
:root[data-theme=dark]{color-scheme:dark;--page:#0b1220;--page-2:#16223a;--page-3:#070d18;--on-page:#f1f5f9;--bg:#111827;--card:#1b2435;--ink:#f1f5f9;--muted:#a8b3c7;--line:#334158;--soft:#16264d;--deco:#cef25d;--on-deco:#0e2250;--blue:#6996ff;--on-blue:#0e2250;--primary:#2a56bf;--on-primary:#ffffff;--link:#839fe2;--ok:#5cab87;--contact:#68b18f;--error:#ff9b9b;--error-bg:#422b35}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 90% 5%,var(--page-2) 0,transparent 42%),radial-gradient(ellipse at 0% 90%,var(--page-3) 0,transparent 50%),var(--page);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:52px 16px 20px}main{width:100%;max-width:420px}header{display:flex;align-items:center;justify-content:center;gap:12px;font-weight:800;font-size:19px;letter-spacing:-.04em;margin-bottom:14px;color:var(--on-page)}.mark{display:grid;place-items:center;width:40px;height:40px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.05);border-radius:50%;color:var(--deco)}svg{width:22px;height:22px;flex-shrink:0}section{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:22px 24px;box-shadow:0 20px 50px rgba(0,36,86,.18)}.state{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--link);margin-bottom:12px}.dot{width:7px;height:7px;background:var(--deco);border-radius:50%}h1{font-size:26px;font-weight:650;line-height:1.2;letter-spacing:-.035em;margin:0 0 6px}p{color:var(--muted);margin:0 0 14px;font-size:14px}label{display:block;font-size:14px;font-weight:500;margin:0 0 8px}input{width:100%;min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);padding:12px 8px;font-size:17px;text-align:center;text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:.025em}input::placeholder{color:var(--muted)}input:focus,button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--blue);outline-offset:3px}.hint{font-size:12px;color:var(--muted);margin:8px 0 0;text-align:center}main>.hint,.support{color:var(--on-page);opacity:.75}button,.button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:46px;padding:11px;margin-top:14px;background:var(--primary);border:1px solid var(--primary);border-radius:10px;color:var(--on-primary);font:500 14px Inter,sans-serif;cursor:pointer;text-decoration:none}button:hover,.button:hover{filter:brightness(.95)}button:disabled{opacity:.65;cursor:wait}.secondary{color:var(--link);background:var(--card);border-color:var(--deco)}.buy{background:var(--deco);border-color:var(--deco);color:var(--on-deco);font-weight:700;margin-top:10px}section .hint{margin-top:6px}.note{font-size:12px;line-height:1.6;padding-top:14px;border-top:1px solid var(--line);margin:16px 0 0;color:var(--muted)}.note strong{color:var(--ink);font-weight:600}.support{font-size:12px;text-align:center;color:var(--muted);margin:8px 0 0;overflow-wrap:anywhere}.support a{display:inline-flex;align-items:center;min-height:36px;font-size:15px;font-weight:600;color:var(--contact);text-decoration:underline;text-underline-offset:3px}main>.support a{color:var(--deco)}.error{padding:12px;background:var(--error-bg);color:var(--error);border:1px solid var(--error);font-size:13px;border-radius:8px;margin-bottom:16px}[hidden]{display:none!important}.remaining{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:20px;text-align:center;margin:20px 0 16px}.remaining span{font-size:11px;letter-spacing:.06em;color:var(--muted);text-transform:uppercase}.remaining strong{display:block;font-size:32px;line-height:1.2;letter-spacing:-.035em;margin-top:8px;font-variant-numeric:tabular-nums}.detail{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}.detail strong{color:var(--ink);font-weight:600}.traffic{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:18px}.traffic div{font-size:11px;color:var(--muted)}.traffic strong{display:block;font-size:18px;color:var(--ink);margin:5px 0 0;font-weight:600}.traffic div+div{border-left:1px solid var(--line);padding-left:16px}.success-icon{display:grid;place-items:center;width:50px;height:50px;background:var(--soft);border-radius:12px;color:var(--ok);margin-bottom:20px}.success-icon svg{width:26px;height:26px}.theme-control{position:absolute;right:16px;top:16px;display:flex;align-items:center;gap:8px;color:#dce9f8;font-size:12px}.theme-control select{font:14px Inter,sans-serif;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:24px;padding:8px 12px;min-height:38px}
@media(max-width:350px){section{padding:22px}h1{font-size:26px}input{font-size:16px;letter-spacing:0}}@media(max-height:700px){body{padding-top:62px;padding-bottom:16px;align-items:flex-start}section{padding:22px}header{margin-bottom:18px}.note{margin-top:16px;padding-top:12px}h1{font-size:27px}}@media print{.theme-control{display:none}:root{--bg:white;--card:white;--ink:black;--muted:#444;--link:black}}
`;
const wifi='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 8.8a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01"/></svg>';
const check='<div class="success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></div>';

/** The theme script the pages load, identical to the portal's own theme.js. Published beside the pages. */
export const THEME_JS=`/* global window, document, localStorage */
/* Shared, local-only theme preference. Runs before paint under script-src self. */
(function () {
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    var choice = 'system';
    try { choice = localStorage.getItem('wifi-theme') || 'system'; } catch { /* Storage may be unavailable in captive browsers. */ }
    if (choice !== 'light' && choice !== 'dark') choice = 'system';
    var theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#111827' : '#f5f6fa';
  }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    var picker = document.getElementById('hotspot-theme');
    if (!picker) return;
    try { picker.value = localStorage.getItem('wifi-theme') || 'system'; } catch { /* Storage may be unavailable in captive browsers. */ }
    picker.addEventListener('change', function () {
      try { localStorage.setItem('wifi-theme', picker.value); apply(); }
      catch {
        var theme = picker.value === 'system' ? (media.matches ? 'dark' : 'light') : picker.value;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      }
    });
  });
  if (media.addEventListener) media.addEventListener('change', apply);
  window.addEventListener('storage', apply);
  window.addEventListener('wifi-theme-change', apply);
})();
`;

export function renderHotspotPages(b:HotspotBrand):Record<string,string>{
 const brand=escape(b.brand),support=escape(b.support),phone=escape(b.sellerPhone),buy=escape(b.buyUrl),status=escape(b.statusUrl);
 const tel=phone?'+255'+phone.replace(/^0/,''):'';
 const buyLink=`<a class="button buy" href="${buy}">Nunua vocha <span aria-hidden="true">→</span></a><p class="hint">Pesa za simu · Huhitaji bando</p>`;
 const page=(title:string,content:string,scripts='',buyInside=false)=>`<!doctype html><html lang="sw"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#0d3fb6"><meta name="color-scheme" content="light dark"><script src="theme.js"></script><title>${title} · ${brand}</title><style>${style}</style></head><body><label class="theme-control">Mandhari<select id="hotspot-theme" aria-label="Mandhari ya rangi"><option value="system">Mfumo</option><option value="light">Mwanga</option><option value="dark">Giza</option></select></label><main><header><span class="mark">${wifi}</span>${brand}</header><section>${content}</section>${buyInside?'':buyLink}${phone?`<p class="support">Au mpigie muuzaji: <a href="tel:${tel}" aria-label="Mpigie muuzaji kwa ${phone} kununua vocha">${phone}</a>${support?`<br>${support}`:''}</p>`:support?`<p class="support">${support}</p>`:''}</main>${scripts}</body></html>`;
 // Vouchers are 16 characters from the voucher alphabet, hyphens optional.
 const login=page('Ungana',`<div class="state"><span class="dot"></span>Karibu kwenye Wi-Fi yako</div><h1>Tuunganishe sasa.</h1><p class="intro">Weka vocha yako ili kuunganisha.</p>$(if error)<p class="error" role="alert">Imeshindikana kuunganisha. Angalia vocha yako au muulize muhudumu.</p>$(endif)<p id="problem" class="error" role="alert" hidden></p><form id="voucher-form"><label for="code">Vocha yako</label><input id="code" name="voucher" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" aria-describedby="code-hint" required><p id="code-hint" class="hint">Herufi 16 · Vistari si lazima</p><button id="connect" type="submit">Unganisha kwenye Wi-Fi <span aria-hidden="true">→</span></button></form>${buyLink}<form id="router-login" action="$(link-login-only)" method="post"><input type="hidden" name="username"><input type="hidden" name="password"><input type="hidden" name="dst" value="${status}"><input type="hidden" name="popup" value="false"></form><noscript><p class="error">Washa JavaScript ili kutuma vocha yako kwa usalama.</p></noscript><p class="note"><strong>Vocha moja. Kifaa kimoja.</strong><br>Muda unaendelea hata ukiwa nje ya mtandao. Usibadilishe anwani ya Wi-Fi ya kifaa chako.</p>`,`<script src="/md5.js"></script><script>document.getElementById('voucher-form').addEventListener('submit',function(e){e.preventDefault();var code=document.getElementById('code').value.toUpperCase().replace(/[\\s-]/g,'');var error=document.getElementById('problem');if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code)){error.textContent='Weka herufi zote 16 za vocha yako.';error.hidden=false;return;}$(if chap-id)var form=document.getElementById('router-login');if(typeof hexMD5!=='function'){error.textContent='Kuingia hakupatikani kwa sasa. Tafadhali muulize muhudumu.';error.hidden=false;return;}form.elements.username.value=code;form.elements.password.value=hexMD5('$(chap-id)'+code+'$(chap-challenge)');document.getElementById('connect').disabled=true;document.getElementById('connect').textContent='Tunaunganisha…';form.submit();$(else)error.textContent='Kuingia kwa usalama hakujawekwa. Tafadhali muulize muhudumu.';error.hidden=false;$(endif)});
/* A voucher arriving in the fragment (from the buy page after payment) is filled in and submitted without a tap. */
var auto=(location.hash.match(/code=([A-Za-z0-9-]+)/)||[])[1];
if(auto){var input=document.getElementById('code'),f=document.getElementById('voucher-form');input.value=auto;
/* Clear the fragment before submitting: a reload must not replay a code that has already been spent. */
try{history.replaceState(null,'',location.pathname+location.search);}catch(err){}
if(f.requestSubmit)f.requestSubmit();else f.dispatchEvent(new Event('submit',{cancelable:true}));}
</script>`,true);
 const statusPage=page('Umeunganishwa',`<div class="state"><span class="dot"></span>Wi-Fi imeunganishwa</div><h1>Uko mtandaoni.</h1><p>Furahia muunganisho wako.</p><div class="remaining"><span>Muda uliobaki</span><strong>$(session-time-left)</strong></div><div class="detail"><span>Umeunganishwa kwa</span><strong>$(uptime)</strong></div><div class="traffic"><div>UMEPAKUA<strong>$(bytes-out-nice)</strong></div><div>UMEPAKIA<strong>$(bytes-in-nice)</strong></div></div><a class="button secondary" href="$(link-logout)">Tenganisha</a><p class="note">Kutenganisha hakusimamishi muda wako. Tumia vocha na kifaa kilekile kuunganisha tena kabla muda haujaisha.</p>`);
 const logout=page('Umetenganishwa',`<div class="state">Muunganisho umekatika</div><h1>Uko nje ya mtandao.</h1><p>Kama vocha yako bado ina muda, unganisha tena kwenye kifaa hiki kwa vocha ileile.</p><a class="button" href="$(link-login)">Unganisha tena <span aria-hidden="true">→</span></a>${buyLink}<p class="note"><strong>Unahitaji muda zaidi?</strong><br>Nunua vocha mpya hapo juu au mpigie muuzaji. Vocha zilizoisha haziwezi kuanza tena.</p>`,'',true);
 const alogin=page('Umeunganishwa',`${check}<div class="state"><span class="dot"></span>Muunganisho uko tayari</div><h1>Uko tayari.</h1><p>Unaweza kuanza kuvinjari. Angalia muda uliobaki na matumizi yako wakati wowote.</p><a class="button" href="$(link-status)">Angalia muunganisho wangu <span aria-hidden="true">→</span></a><p class="note">Vocha yako imefungwa kwenye kifaa hiki. Muda wake unaendelea hata ukitenganishwa.</p>`);
 const files:Record<(typeof HOTSPOT_FILES)[number],string>={'theme.js':THEME_JS,'login.html':login,'flogin.html':login,'status.html':statusPage,'logout.html':logout,'alogin.html':alogin};
 return files;
}
