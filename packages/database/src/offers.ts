import {pool,audit,requireValue,Problem,SITE,type DB,type Staff} from './index.ts';
import {offerState,bestOffer,offerProblem,type OfferTerms} from '../../network/src/offer.ts';

// Free Wi-Fi offers: set in the portal, read by the RADIUS server on each free
// sign-in, and shown on the hotspot sign-in page while one is running.

export type OfferInput={name:string;starts_at:string;ends_at:string;daily_start:string|null;daily_end:string|null;download_mbps:number;upload_mbps:number;enabled:boolean};
type OfferRow=OfferTerms&{id:string;name:string;download_mbps:number;upload_mbps:number;created_at:Date;updated_at:Date};

const COLUMNS=`id,name,starts_at,ends_at,to_char(daily_start,'HH24:MI') daily_start,to_char(daily_end,'HH24:MI') daily_end,download_mbps,upload_mbps,enabled,created_at,updated_at`;
const iso=(d:Date|string|null)=>d===null?null:new Date(d).toISOString();

function shape(row:OfferRow&{logins?:number;devices?:number},now:Date){
 const s=offerState(row,now);
 return {id:row.id,name:row.name,starts_at:iso(row.starts_at)!,ends_at:iso(row.ends_at)!,daily_start:row.daily_start,daily_end:row.daily_end,
  download_mbps:row.download_mbps,upload_mbps:row.upload_mbps,enabled:row.enabled,state:s.state,until:iso(s.until),next:iso(s.next),
  logins:Number(row.logins??0),devices:Number(row.devices??0),created_at:iso(row.created_at)!,updated_at:iso(row.updated_at)!};
}

export async function listOffers(){
 const now=new Date();
 const {rows}=await pool.query(`select ${COLUMNS},
   (select count(*) from wifi.free_offer_logins l where l.offer_id=o.id)::int logins,
   (select count(distinct client_mac) from wifi.free_offer_logins l where l.offer_id=o.id)::int devices
  from wifi.free_offers o where site_id=$1 order by starts_at desc limit 100`,[SITE]);
 return {items:rows.map(r=>shape(r,now))};
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
 return shape(row,new Date());
}

export async function updateOffer(staff:Staff,id:string,input:OfferInput){
 check(input);
 const row=(await pool.query(`update wifi.free_offers set name=$3,starts_at=$4,ends_at=$5,daily_start=$6,daily_end=$7,download_mbps=$8,upload_mbps=$9,enabled=$10,updated_at=now()
  where id=$1 and site_id=$2 returning ${COLUMNS}`,
  [id,SITE,input.name.trim(),input.starts_at,input.ends_at,input.daily_start,input.daily_end,input.download_mbps,input.upload_mbps,input.enabled])).rows[0];
 requireValue(row,404,'Offer not found');
 await audit(pool,staff.id,'FREE_OFFER_UPDATED',row.id,{name:row.name,starts_at:iso(row.starts_at),ends_at:iso(row.ends_at),daily_start:row.daily_start,daily_end:row.daily_end,enabled:row.enabled});
 return shape(row,new Date());
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
 * time ends, recorded once per sign-in so the portal can count devices.
 */
export async function authorizeOffer(db:DB,clientMac:string,now:Date){
 const best=bestOffer(await runningOffers(db),now);
 if(!best)return null;
 await db.query('insert into wifi.free_offer_logins(offer_id,client_mac) values($1,$2)',[best.offer.id,clientMac]);
 return {expiresAt:best.endsAt,download:best.offer.download_mbps,upload:best.offer.upload_mbps};
}
