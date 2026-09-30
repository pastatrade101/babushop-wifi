import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderHotspotPages,hotspotBrandFromEnv,publicBuyUrl,HOTSPOT_FILES,THEME_JS,DEFAULT_BUY_URL} from '../packages/network/src/hotspot-pages.ts';
import {checkContents,hotspotPath} from '../packages/network/src/files.ts';

const shop={brand:'JIACHIE WIFI',support:'',sellerPhone:'0758342054',buyUrl:'https://jiachie-wifi.com/buy',statusUrl:'http://10.78.0.1/status'};

it('renders the five router pages and their theme script from the shop\'s own settings, each small enough for the router',()=>{
 const pages=renderHotspotPages(shop);
 // theme.js comes first, so a publish never puts a page live before the script it loads.
 expect(Object.keys(pages)).toEqual([...HOTSPOT_FILES]);
 expect(HOTSPOT_FILES[0]).toBe('theme.js');
 for(const name of HOTSPOT_FILES)expect(()=>hotspotPath('hotspot',name)).not.toThrow();
 expect(checkContents(pages['theme.js'])).toBeLessThan(60000);
 for(const html of Object.entries(pages).filter(([name])=>name.endsWith('.html')).map(([,html])=>html)){
  expect(html).toContain('<html lang="sw">');
  expect(html).toContain('JIACHIE WIFI');
  expect(html).toContain('href="https://jiachie-wifi.com/buy"');
  expect(html).toContain('tel:+255758342054');expect(html).toContain('0758342054');
  expect(html).toContain('<script src="theme.js">');
  // Everything the page needs is in the set: no font file that the portal cannot publish.
  expect(html).not.toContain('woff2');
  expect(checkContents(html)).toBeLessThan(60000);
 }
 expect(pages['login.html']).toContain('value="http://10.78.0.1/status"');
 expect(pages['login.html']).toContain('$(link-login-only)');expect(pages['login.html']).toContain('hexMD5');
 expect(pages['flogin.html']).toBe(pages['login.html']);
 // The buy link appears once per page, inside the sign-in card where it is in view.
 expect(pages['login.html'].split('class="button buy"').length-1).toBe(1);
});

it('escapes shop text so a brand cannot inject markup or RouterOS variables',()=>{
 const pages=renderHotspotPages({...shop,brand:'<b>Evil</b> $(chap-id)',support:'"quoted" & <i>',sellerPhone:''});
 expect(pages['login.html']).not.toContain('<b>Evil</b>');expect(pages['login.html']).toContain('&lt;b&gt;Evil&lt;/b&gt;');
 expect(pages['login.html']).toContain('&#36;(chap-id)');
 expect(pages['login.html']).not.toContain('tel:');
});

it('keeps the automatic connect: a voucher in the fragment is filled in, the fragment cleared, and the form submitted',()=>{
 const login=renderHotspotPages(shop)['login.html'];
 expect(login).toContain("location.hash.match(/code=([A-Za-z0-9-]+)/)");
 expect(login).toContain('history.replaceState(null');
 expect(login).toContain('f.requestSubmit()');
 // No hand-over away from the sign-in form: a customer with a voucher types it here.
 expect(login.split('</head>')[0]).not.toContain('location.replace');
});

it('takes the 16-character vouchers this shop sells, with hyphens optional, and nothing else',()=>{
 const login=renderHotspotPages(shop)['login.html'];
 expect(login).toContain('placeholder="XXXX-XXXX-XXXX-XXXX"');
 // The page's own check, taken out of the page and run.
 const start=login.indexOf('if(!/^')+4,end=login.indexOf('.test(code)',start);
 expect(start).toBeGreaterThan(3);
 const pattern=new Function('return '+login.slice(start,end))() as RegExp;
 for(const good of ['ABCDEFGHJKLMNPQR','LPX9R5Y3Z2JQ224U'])expect(pattern.test(good),good).toBe(true);
 for(const bad of ['48291736','ABCD1234','O000AAAAAAAAAAAA','ABCDEFGHJKLMNPQ','ABCDEFGHJKLMNPQRS'])expect(pattern.test(bad),bad).toBe(false);
 expect(login).toContain('Weka herufi zote 16 za vocha yako.');
});

it('wears the One Network frame in JIACHIE\'s blues',()=>{
 const login=renderHotspotPages(shop)['login.html'];
 expect(login).toContain('--page:#0d3fb6');
 expect(login).toContain('--deco:#c9f04b');
 expect(login).toContain('<meta name="theme-color" content="#0d3fb6">');
 expect(login).toContain('radial-gradient');
});

it('ships the portal\'s own theme script, so the router pages and the portal switch themes the same way',()=>{
 expect(THEME_JS.trim()).toBe(readFileSync(new URL('../apps/web/static/theme.js',import.meta.url),'utf8').trim());
});

it('never points "Nunua vocha" at a developer machine or a private address',()=>{
 // The checkout's own .env: APP_ORIGIN is the local dev server.
 expect(publicBuyUrl({APP_ORIGIN:'http://127.0.0.1:5188'})).toBe(DEFAULT_BUY_URL);
 expect(publicBuyUrl({APP_ORIGIN:'http://localhost:5173'})).toBe(DEFAULT_BUY_URL);
 expect(publicBuyUrl({APP_ORIGIN:'https://10.78.0.1'})).toBe(DEFAULT_BUY_URL);
 expect(publicBuyUrl({})).toBe(DEFAULT_BUY_URL);
 // The server's: the live portal.
 expect(publicBuyUrl({APP_ORIGIN:'https://jiachie-wifi.com/'})).toBe('https://jiachie-wifi.com/buy');
 expect(publicBuyUrl({APP_ORIGIN:'https://shop.example.co.tz'})).toBe('https://shop.example.co.tz/buy');
 // An explicit setting wins, and a bad one is refused outright rather than published.
 expect(publicBuyUrl({HOTSPOT_BUY_URL:'https://pay.example.com/buy',APP_ORIGIN:'https://jiachie-wifi.com'})).toBe('https://pay.example.com/buy');
 for(const bad of ['http://127.0.0.1:5188/buy','https://localhost/buy','https://192.168.88.1/buy','https://172.20.0.5/buy','https://10.78.0.1/buy','http://jiachie-wifi.com/buy','https://[::1]/buy','https://router.local/buy','not a url'])
  expect(()=>publicBuyUrl({HOTSPOT_BUY_URL:bad}),bad).toThrow(/HOTSPOT_BUY_URL/);
});

it('builds the same pages from the environment for the build script and the Publish button',()=>{
 const brand=hotspotBrandFromEnv({APP_ORIGIN:'http://127.0.0.1:5188',HOTSPOT_LOGIN_URL:'http://10.78.0.1/login'});
 expect(brand).toEqual({brand:'JIACHIE WIFI',support:'',sellerPhone:'0758342054',buyUrl:DEFAULT_BUY_URL,statusUrl:'http://10.78.0.1/status'});
 const login=renderHotspotPages(brand)['login.html'];
 expect(login).toContain('href="https://jiachie-wifi.com/buy"');
 expect(login).not.toContain('127.0.0.1');
 expect(hotspotBrandFromEnv({HOTSPOT_LOGIN_URL:'http://192.168.10.1/login',WIFI_BRAND:'Duka',WIFI_SELLER_PHONE:'0712000000'})).toMatchObject({brand:'Duka',sellerPhone:'0712000000',statusUrl:'http://192.168.10.1/status'});
});
