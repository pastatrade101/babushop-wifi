import {pool,audit,requireValue,Problem,SITE,type DB,type Staff} from './index.ts';
import {offerState,bestOffer,offerProblem,type OfferTerms} from '../../network/src/offer.ts';

// Free Wi-Fi offers: set in the portal, read by the RADIUS server on each free
// sign-in, and shown on the hotspot sign-in page while one is running.

export type OfferInput={name:string;starts_at:string;ends_at:string;daily_start:string|null;daily_end:string|null;download_mbps:number;upload_mbps:number;enabled:boolean};
type OfferRow=OfferTerms&{id:string;name:string;download_mbps:number;upload_mbps:number;created_at:Date;updated_at:Date};

const COLUMNS=`id,name,starts_at,ends_at,to_char(daily_start,'HH24:MI') daily_start,to_char(daily_end,'HH24:MI') daily_end,download_mbps,upload_mbps,enabled,created_at,updated_at`;
const iso=(d:Date|string|null)=>d===null?null:new Date(d).toISOString();

function shape(row:OfferRow&{logins?:number;devices?:number;sales?:number;revenue_tzs?:number},now:Date){
 const s=offerState(row,now);
 return {id:row.id,name:row.name,starts_at:iso(row.starts_at)!,ends_at:iso(row.ends_at)!,daily_start:row.daily_start,daily_end:row.daily_end,
  download_mbps:row.download_mbps,upload_mbps:row.upload_mbps,enabled:row.enabled,state:s.state,until:iso(s.until),next:iso(s.next),
  logins:Number(row.logins??0),devices:Number(row.devices??0),sales:Number(row.sales??0),revenue_tzs:Number(row.revenue_tzs??0),created_at:iso(row.created_at)!,updated_at:iso(row.updated_at)!};
}

export async function listOffers(){
 const now=new Date();
 const {rows}=await pool.query(`select ${COLUMNS},
   (select count(*) from wifi.free_offer_logins l where l.offer_id=o.id)::int logins,
   (select count(distinct client_mac) from wifi.free_offer_logins l where l.offer_id=o.id)::int devices,
   -- Every sale, at the counter or by phone, from the offer's start until its end (or now), less reversals:
   -- what the shop took while the offer was bringing people in.
   s.sales,s.revenue_tzs
  from wifi.free_offers o
  cross join lateral (select count(*)::int sales,coalesce(sum(m.total_tzs),0)::float8 revenue_tzs from wifi.manual_sales m
   where m.site_id=o.site_id and m.created_at>=o.starts_at and m.created_at<least(o.ends_at,now())
    and not exists(select 1 from wifi.sale_reversals r where r.sale_id=m.id)) s
  where o.site_id=$1 order by o.starts_at desc limit 100`,[SITE]);
 const usage=await offerUsage(rows.map(r=>r.id));
 return {items:rows.map(r=>({...shape(r,now),...summarize(usage.get(r.id)??[])}))};
}

/** One offer as the portal shows it, with its data so far. */
async function withUsage(row:OfferRow){
 return {...shape(row,new Date()),...summarize((await offerUsage([row.id])).get(row.id)??[])};
}

/** A session counts as on now while the router keeps reporting it, as for vouchers. */
const ONLINE_WINDOW="interval '3 minutes'";
/** Devices listed per offer, most data first. The totals always count every device. */
export const USAGE_DEVICES=30;

type DeviceUsage={device:string;sign_ins:number;down_bytes:number;up_bytes:number;seconds:number;online:boolean;measured:boolean;last_at:string|null};

/** Per offer, every device that signed in or was reported: sign-ins, data, time online. */
async function offerUsage(ids:string[]){
 const byOffer=new Map<string,DeviceUsage[]>();
 if(!ids.length)return byOffer;
 const {rows}=await pool.query(`with logins as (
    select offer_id,client_mac,count(*)::int sign_ins,max(created_at) last_at from wifi.free_offer_logins where offer_id=any($1::uuid[]) group by 1,2),
   sessions as (
    select offer_id,client_mac,sum(download_bytes)::text down,sum(upload_bytes)::text up,sum(session_seconds)::bigint seconds,
     bool_or(stopped_at is null and last_seen_at>now()-${ONLINE_WINDOW}) online,max(last_seen_at) last_at
    from wifi.free_offer_sessions where offer_id=any($1::uuid[]) group by 1,2)
  select offer_id,client_mac,coalesce(l.sign_ins,0) sign_ins,s.down,s.up,coalesce(s.seconds,0)::text seconds,coalesce(s.online,false) online,
   (s.offer_id is not null) measured,greatest(l.last_at,s.last_at) last_at
  from logins l full join sessions s using(offer_id,client_mac)`,[ids]);
 for(const r of rows){
  const list=byOffer.get(r.offer_id)??[];
  list.push({device:r.client_mac,sign_ins:Number(r.sign_ins),down_bytes:Number(r.down??0),up_bytes:Number(r.up??0),seconds:Number(r.seconds),
   online:r.online===true,measured:r.measured===true,last_at:iso(r.last_at)});
  byOffer.set(r.offer_id,list);
 }
 return byOffer;
}

/** An offer's data totals and its busiest devices. */
export function summarize(devices:DeviceUsage[]){
 const sorted=[...devices].sort((a,b)=>Number(b.online)-Number(a.online)||(b.down_bytes+b.up_bytes)-(a.down_bytes+a.up_bytes)||String(b.last_at).localeCompare(String(a.last_at)));
 return {
  online:devices.filter(d=>d.online).length,
  down_bytes:devices.reduce((n,d)=>n+d.down_bytes,0),
  up_bytes:devices.reduce((n,d)=>n+d.up_bytes,0),
  measured:devices.some(d=>d.measured),
  usage:sorted.slice(0,USAGE_DEVICES),
 };
}

function check(input:OfferInput){
 const problem=offerProblem(input);
 if(problem)throw new Problem(400,problem);
}

export async function createOffer(staff:Staff,input:OfferInput){
 check(input);
 const row=(await pool.query(`insert into wifi.free_offers(site_id,name,starts_at,ends_at,daily_start,daily_end,download_mbps,upload_mbps,enabled,created_by)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${COLUMNS}`,
  [SITE,input.name.trim(),input.starts_at,input.ends_at,input.daily_start,input.daily_end,input.download_mbps,input.upload_mbps,input.enabled,staff.id])).rows[0];
 await audit(pool,staff.id,'FREE_OFFER_CREATED',row.id,{name:row.name,starts_at:iso(row.starts_at),ends_at:iso(row.ends_at),daily_start:row.daily_start,daily_end:row.daily_end,enabled:row.enabled});
 return withUsage(row);
}

export async function updateOffer(staff:Staff,id:string,input:OfferInput){
 check(input);
 const row=(await pool.query(`update wifi.free_offers set name=$3,starts_at=$4,ends_at=$5,daily_start=$6,daily_end=$7,download_mbps=$8,upload_mbps=$9,enabled=$10,updated_at=now()
  where id=$1 and site_id=$2 returning ${COLUMNS}`,
  [id,SITE,input.name.trim(),input.starts_at,input.ends_at,input.daily_start,input.daily_end,input.download_mbps,input.upload_mbps,input.enabled])).rows[0];
 requireValue(row,404,'Offer not found');
 await audit(pool,staff.id,'FREE_OFFER_UPDATED',row.id,{name:row.name,starts_at:iso(row.starts_at),ends_at:iso(row.ends_at),daily_start:row.daily_start,daily_end:row.daily_end,enabled:row.enabled});
 return withUsage(row);
}

/** Offers that could be on now: enabled, started, not yet over. Small by construction. */
async function runningOffers(db:DB=pool):Promise<OfferRow[]>{
 return (await db.query(`select ${COLUMNS} from wifi.free_offers where site_id=$1 and enabled and starts_at<=now() and ends_at>now()`,[SITE])).rows;
}

/** What the hotspot sign-in page shows: only whether an offer is on, its name and when it ends. */
export async function publicOffer(now=new Date()){
 const best=bestOffer(await runningOffers(),now);
 return best?{active:true,name:best.offer.name,ends_at:best.endsAt.toISOString()}:{active:false,name:null,ends_at:null};
}

/**
 * The RADIUS decision for a free sign-in: the offer on now and when its free
 * time ends, recorded once per sign-in (with the name the phone signed in as) so
 * the portal can count devices and accounting can find the offer again.
 */
export async function authorizeOffer(db:DB,clientMac:string,now:Date,username:string|null=null){
 const best=bestOffer(await runningOffers(db),now);
 if(!best)return null;
 await db.query('insert into wifi.free_offer_logins(offer_id,client_mac,username) values($1,$2,$3)',[best.offer.id,clientMac,username]);
 return {expiresAt:best.endsAt,download:best.offer.download_mbps,upload:best.offer.upload_mbps};
}

export type OfferAccounting={username:string;clientMac:string;sessionId:string;status:string;seconds:number;upload:string;download:string;terminateCause:string|null};

/**
 * Accounting for a free session: its bytes, against the offer that let it on.
 *
 * The offer is the one this phone last signed in to under this name. Sign-ins
 * from before names were recorded have none, so the phone's latest sign-in
 * stands in for them; a name it signed in with always wins. Counters are
 * absolute, so duplicate and reordered reports neither add up twice nor reopen
 * a session that has stopped. A session is the router's id together with the
 * phone and its sign-in name, because RouterOS reuses ids across reboots. A
 * report no sign-in explains is dropped.
 */
export async function recordOfferAccounting(db:Pick<DB,'query'>,event:OfferAccounting,clientMac:string,nas:string){
 const login=(await db.query(`select offer_id from wifi.free_offer_logins
   where client_mac=$2 and (username=$1 or username is null)
   order by (username is not null) desc, created_at desc limit 1`,[event.username,clientMac])).rows[0];
 if(!login)return false;
 await db.query(`insert into wifi.free_offer_sessions(offer_id,client_mac,username,nas,session_id,session_seconds,upload_bytes,download_bytes,stopped_at,terminate_cause)
   values($1,$2,$3,$4,$5,$6,$7,$8,case when $9 then now() else null end,$10)
   on conflict(nas,session_id,username,client_mac) do update set
     last_seen_at=case when excluded.session_seconds>=wifi.free_offer_sessions.session_seconds then now() else wifi.free_offer_sessions.last_seen_at end,
     session_seconds=greatest(wifi.free_offer_sessions.session_seconds,excluded.session_seconds),
     upload_bytes=greatest(wifi.free_offer_sessions.upload_bytes,excluded.upload_bytes),
     download_bytes=greatest(wifi.free_offer_sessions.download_bytes,excluded.download_bytes),
     stopped_at=coalesce(wifi.free_offer_sessions.stopped_at,excluded.stopped_at),
     terminate_cause=coalesce(wifi.free_offer_sessions.terminate_cause,excluded.terminate_cause)`,
  [login.offer_id,clientMac,event.username,nas,event.sessionId,event.seconds,event.upload,event.download,event.status==='Stop',event.terminateCause]);
 return true;
}
