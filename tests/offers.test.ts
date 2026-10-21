import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {OFFER_USERNAME,isOfferUsername,offerWindowEnd,offerNextStart,offerState,bestOffer,offerChapValid,offerProblem,type OfferTerms} from '../packages/network/src/offer.ts';
import {renderHotspotPages,hotspotBrandFromEnv} from '../packages/network/src/hotspot-pages.ts';
import {normalize} from '../packages/database/src/crypto.ts';

// Dar es Salaam is UTC+3 all year: 15:00 there is 12:00Z.
const dar=(local:string)=>new Date(local+'+03:00');
const offer=(o:Partial<OfferTerms>={}):OfferTerms=>({enabled:true,starts_at:dar('2026-10-15T08:00:00'),ends_at:dar('2026-10-22T08:00:00'),daily_start:null,daily_end:null,...o});

it('without daily hours, is on from start to end and the free time lasts until the end',()=>{
 const o=offer();
 expect(offerWindowEnd(o,dar('2026-10-15T07:59:59'))).toBeNull();
 expect(offerWindowEnd(o,dar('2026-10-15T08:00:00'))).toEqual(dar('2026-10-22T08:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-20T23:00:00'))).toEqual(dar('2026-10-22T08:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-22T08:00:00'))).toBeNull();
 expect(offerWindowEnd({...o,enabled:false},dar('2026-10-16T12:00:00'))).toBeNull();
});

it('with daily hours, is on only between them, in Tanzanian time, and never past the offer end',()=>{
 const o=offer({daily_start:'14:00',daily_end:'17:00'});
 expect(offerWindowEnd(o,dar('2026-10-16T13:59:00'))).toBeNull();
 expect(offerWindowEnd(o,dar('2026-10-16T14:00:00'))).toEqual(dar('2026-10-16T17:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-16T16:59:00'))).toEqual(dar('2026-10-16T17:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-16T17:00:00'))).toBeNull();
 // The last day ends at the offer's own end, mid-window.
 const short=offer({daily_start:'14:00',daily_end:'17:00',ends_at:dar('2026-10-16T15:30:00')});
 expect(offerWindowEnd(short,dar('2026-10-16T15:00:00'))).toEqual(dar('2026-10-16T15:30:00'));
});

it('daily hours that cross midnight work on both sides of it',()=>{
 const o=offer({daily_start:'22:00',daily_end:'02:00'});
 expect(offerWindowEnd(o,dar('2026-10-16T23:30:00'))).toEqual(dar('2026-10-17T02:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-17T01:00:00'))).toEqual(dar('2026-10-17T02:00:00'));
 expect(offerWindowEnd(o,dar('2026-10-17T03:00:00'))).toBeNull();
 expect(offerWindowEnd(o,dar('2026-10-17T21:59:00'))).toBeNull();
});

it('says whether an offer is on, scheduled, over or switched off, and when it next starts',()=>{
 const o=offer({daily_start:'14:00',daily_end:'17:00'});
 expect(offerState(o,dar('2026-10-14T12:00:00'))).toEqual({state:'WAITING',until:null,next:dar('2026-10-15T14:00:00')});
 expect(offerState(o,dar('2026-10-16T18:00:00'))).toEqual({state:'WAITING',until:null,next:dar('2026-10-17T14:00:00')});
 expect(offerState(o,dar('2026-10-16T15:00:00'))).toEqual({state:'ON',until:dar('2026-10-16T17:00:00'),next:null});
 expect(offerState(o,dar('2026-10-21T18:00:00')).state).toBe('ENDED'); // the 22nd's window opens after the offer ends
 expect(offerState({...o,enabled:false},dar('2026-10-16T15:00:00')).state).toBe('OFF');
 expect(offerState(offer(),dar('2026-10-14T12:00:00'))).toEqual({state:'WAITING',until:null,next:dar('2026-10-15T08:00:00')});
 expect(offerNextStart(offer(),dar('2026-10-23T12:00:00'))).toBeNull();
 // An overnight offer that starts inside its own hours is on from its start.
 expect(offerNextStart(offer({starts_at:dar('2026-10-15T23:00:00'),daily_start:'22:00',daily_end:'02:00'}),dar('2026-10-15T12:00:00'))).toEqual(dar('2026-10-15T23:00:00'));
});

it('when several offers are on, uses the one whose free time lasts longest',()=>{
 const a={...offer({daily_start:'14:00',daily_end:'17:00'}),id:'a'},b={...offer(),id:'b'},off={...offer({enabled:false}),id:'off'};
 expect(bestOffer([a,b,off],dar('2026-10-16T15:00:00'))?.offer.id).toBe('b');
 expect(bestOffer([a,off],dar('2026-10-16T18:00:00'))).toBeNull();
});

it('accepts only a real CHAP sign-in under a free name of its own, which can never be a voucher',()=>{
 const challenge=Buffer.alloc(16,7),id=Buffer.from([42]),name='OFA-BURE-k3x9q2m7wd1a';
 const chap=(password:string)=>Buffer.concat([id,createHash('md5').update(id).update(password).update(challenge).digest()]);
 expect(offerChapValid(name,chap(name),challenge)).toBe(true);
 // The password must be the name itself, and the name must have the free shape.
 expect(offerChapValid(name,chap('OFA-BURE-otherphone1'),challenge)).toBe(false);
 expect(offerChapValid(name,chap(name),Buffer.alloc(16,8))).toBe(false);
 expect(offerChapValid(name,Buffer.alloc(16),challenge)).toBe(false);
 for(const bad of [OFFER_USERNAME,'OFA-BURE-','OFA-BURE-short','OFA-BURE-UPPERCASE12','OFA-BURE-has space12','ABCDEFGHJKLMNPQR','ofa-bure-k3x9q2m7wd'])
  expect(offerChapValid(bad,chap(bad),challenge),bad).toBe(false);
 expect(isOfferUsername(name)).toBe(true);
 expect(()=>normalize(name)).toThrow();
});

it('explains a bad offer in plain words',()=>{
 const ok={name:'Wi-Fi bure',starts_at:'2026-10-15T08:00:00+03:00',ends_at:'2026-10-16T08:00:00+03:00',daily_start:null,daily_end:null,download_mbps:2,upload_mbps:1};
 expect(offerProblem(ok)).toBeNull();
 expect(offerProblem({...ok,name:'  '})).toMatch(/name/);
 expect(offerProblem({...ok,ends_at:ok.starts_at})).toMatch(/end after/);
 expect(offerProblem({...ok,ends_at:'2028-01-01T00:00:00+03:00'})).toMatch(/year/);
 expect(offerProblem({...ok,daily_start:'14:00',daily_end:null})).toMatch(/both/);
 expect(offerProblem({...ok,daily_start:'14:00',daily_end:'14:00'})).toMatch(/same time/);
 expect(offerProblem({...ok,daily_start:'25:00',daily_end:'26:00'})).toMatch(/14:00/);
 expect(offerProblem({...ok,download_mbps:0})).toMatch(/Speeds/);
});

it('puts a hidden offer card on the sign-in page that asks the shop server, and signs in with the offer name',()=>{
 const brand=hotspotBrandFromEnv({APP_ORIGIN:'https://jiachie-wifi.com'});
 expect(brand.offerUrl).toBe('https://jiachie-wifi.com/api/v1/portal/offer');
 const login=renderHotspotPages(brand)['login.html'];
 expect(login).toContain('<div id="offer" class="offer" hidden>');
 expect(login).toContain("fetch('https://jiachie-wifi.com/api/v1/portal/offer'");
 expect(login).toContain("hexMD5('$(chap-id)'+name+'$(chap-challenge)')");
 // The page's own name generator, run: every name it makes is one the server accepts, and no two phones share one.
 const start=login.indexOf('function freeName()'),end=login.indexOf('go.addEventListener',start);
 const freeName=new Function('window',login.slice(start,end)+'return freeName;')({crypto:globalThis.crypto}) as ()=>string;
 const names=new Set(Array.from({length:200},()=>freeName()));
 expect(names.size).toBe(200);
 for(const n of names)expect(isOfferUsername(n),n).toBe(true);
 // Nothing but RouterOS's own variables uses $( in the page.
 expect(login.match(/\$\((?!if |else\)|endif\)|chap-id\)|chap-challenge\)|link-login-only\))/g)).toBeNull();
 // No offer address, or one that is not plain https to the API: no card, no request.
 for(const offerUrl of [undefined,'http://jiachie-wifi.com/api/v1/portal/offer',"https://x.com/api/v1/portal/offer');alert(1);//"]){
  const page=renderHotspotPages({...brand,offerUrl})['login.html'];
  expect(page).not.toContain('id="offer"');expect(page).not.toContain('fetch(');
 }
});

import {recordOfferAccounting,summarize,USAGE_DEVICES} from '../packages/database/src/offers.ts';

// A database stand-in: answers the sign-in lookup, records every statement.
function fakeDb(login:{offer_id:string}|null){
 const calls:{sql:string;params:any[]}[]=[];
 return {calls,query:async(sql:string,params:any[]=[])=>{calls.push({sql,params});return {rows:/from wifi\.free_offer_logins/.test(sql)?(login?[login]:[]):[]} as any;}};
}
const event={username:'OFA-BURE-k3x9q2m7wd',clientMac:'aa-bb-cc-dd-ee-ff',sessionId:'81a00001',status:'Interim-Update',seconds:600,upload:'1500000',download:'48000000',terminateCause:null};

it('keeps a free session\'s data against the offer the phone signed in to, by its sign-in name first',async()=>{
 const db=fakeDb({offer_id:'11111111-1111-4111-8111-111111111111'});
 expect(await recordOfferAccounting(db as any,event,'AA:BB:CC:DD:EE:FF','10.77.0.2')).toBe(true);
 const [lookup,upsert]=db.calls;
 // The name it signed in with wins; a sign-in from before names were kept stands in for it.
 expect(lookup.sql).toMatch(/username=\$1 or username is null/);
 expect(lookup.sql).toMatch(/order by \(username is not null\) desc, created_at desc/);
 expect(lookup.params).toEqual(['OFA-BURE-k3x9q2m7wd','AA:BB:CC:DD:EE:FF']);
 expect(upsert.sql).toMatch(/insert into wifi\.free_offer_sessions/);
 // Absolute counters: a repeat or late report can only raise them, never add twice or reopen.
 expect(upsert.sql).toMatch(/greatest\(wifi\.free_offer_sessions\.download_bytes,excluded\.download_bytes\)/);
 expect(upsert.sql).toMatch(/stopped_at=coalesce\(wifi\.free_offer_sessions\.stopped_at,excluded\.stopped_at\)/);
 // A reused router id from another phone or name is a different session, not an update to the old one.
 expect(upsert.sql).toMatch(/on conflict\(nas,session_id,username,client_mac\)/);
 expect(upsert.params).toEqual(['11111111-1111-4111-8111-111111111111','AA:BB:CC:DD:EE:FF','OFA-BURE-k3x9q2m7wd','10.77.0.2','81a00001',600,'1500000','48000000',false,null]);
 const stop=fakeDb({offer_id:'11111111-1111-4111-8111-111111111111'});
 await recordOfferAccounting(stop as any,{...event,status:'Stop',terminateCause:'Session-Timeout'},'AA:BB:CC:DD:EE:FF','10.77.0.2');
 expect(stop.calls[1].params.slice(8)).toEqual([true,'Session-Timeout']);
});

it('drops a free-session report no sign-in explains, writing nothing',async()=>{
 const db=fakeDb(null);
 expect(await recordOfferAccounting(db as any,event,'AA:BB:CC:DD:EE:FF','10.77.0.2')).toBe(false);
 expect(db.calls).toHaveLength(1);
});

it('totals every device, lists the busiest first with those online on top, and caps the list',()=>{
 const d=(device:string,down:number,up:number,online=false,measured=true)=>({device,sign_ins:1,down_bytes:down,up_bytes:up,seconds:60,online,measured,last_at:'2026-10-21T07:00:00.000Z'});
 const s=summarize([d('A',5e6,1e6),d('B',90e6,4e6),d('C',1e6,0,true),d('D',0,0,false,false)]);
 expect(s.online).toBe(1);
 expect(s.down_bytes).toBe(96e6);
 expect(s.up_bytes).toBe(5e6);
 expect(s.measured).toBe(true);
 expect(s.usage.map(u=>u.device)).toEqual(['C','B','A','D']);
 expect(summarize([d('X',0,0,false,false)]).measured).toBe(false);
 const many=summarize(Array.from({length:USAGE_DEVICES+5},(_,i)=>d('M'+i,i*1e6,0)));
 expect(many.usage).toHaveLength(USAGE_DEVICES);
 expect(many.down_bytes).toBe(Array.from({length:USAGE_DEVICES+5},(_,i)=>i*1e6).reduce((a,b)=>a+b,0));
});
