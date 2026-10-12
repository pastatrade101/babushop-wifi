import {createHash,timingSafeEqual} from 'node:crypto';

// The rules of a free Wi-Fi offer, kept free of the database so the RADIUS
// server, the API and the tests all apply exactly the same ones.
//
// An offer runs from starts_at to ends_at. With daily hours it is on only
// between those hours each day (Tanzanian time), and the hours may cross
// midnight (22:00 to 02:00). A free session ends when the window it began in
// closes, never later.

/**
 * Free sessions sign in as OFFER_USERNAME plus a random tail the page picks,
 * e.g. OFA-BURE-k3x9q2m7wd, with that same name as the CHAP password. The name
 * is public by design: the offer is for everyone on the Wi-Fi while it runs.
 * Each phone needs a name of its own because the router allows one session per
 * name (the voucher profile's shared-users=1 and Port-Limit 1); with one shared
 * name, only one phone at a time could be on the offer. It can never be a
 * voucher, whose codes are 16 characters without O, I, 0 or 1.
 */
export const OFFER_USERNAME='OFA-BURE';
const OFFER_NAME=/^OFA-BURE-[a-z0-9]{8,16}$/;
export const isOfferUsername=(name:string)=>OFFER_NAME.test(name);

/** Tanzania keeps UTC+3 all year, so local time is a fixed shift. */
const TZ_OFFSET_MS=3*3600_000;

export type OfferTerms={
 enabled:boolean;starts_at:Date|string;ends_at:Date|string;
 daily_start:string|null;daily_end:string|null;
};

const minutes=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+(m||0);};
/** Midnight of the local (Dar es Salaam) day containing `at`, as a UTC timestamp. */
const localMidnight=(at:number)=>{const local=new Date(at+TZ_OFFSET_MS);return Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-TZ_OFFSET_MS;};

/** When the free time that `now` falls in ends, or null when the offer is not on at `now`. */
export function offerWindowEnd(o:OfferTerms,now:Date):Date|null{
 if(!o.enabled)return null;
 const start=new Date(o.starts_at).getTime(),end=new Date(o.ends_at).getTime(),t=now.getTime();
 if(!(t>=start&&t<end))return null;
 if(!o.daily_start||!o.daily_end)return new Date(end);
 const midnight=localMidnight(t),at=(t-midnight)/60000,a=minutes(o.daily_start),b=minutes(o.daily_end);
 let close:number|null=null;
 if(a<b){if(at>=a&&at<b)close=midnight+b*60000;}
 else if(at>=a)close=midnight+(1440+b)*60000;      // evening part of an overnight window
 else if(at<b)close=midnight+b*60000;              // early-morning part of yesterday's window
 return close===null?null:new Date(Math.min(close,end));
}

/** The next moment after `now` that the offer switches on, or null when it never will again. */
export function offerNextStart(o:OfferTerms,now:Date):Date|null{
 if(!o.enabled)return null;
 const start=new Date(o.starts_at).getTime(),end=new Date(o.ends_at).getTime(),t=now.getTime();
 if(t>=end)return null;
 if(!o.daily_start||!o.daily_end)return t<start?new Date(start):null;
 // The offer's own start counts when its daily hours are already running then.
 if(start>t&&offerWindowEnd(o,new Date(start)))return new Date(start);
 const a=minutes(o.daily_start);
 for(let day=localMidnight(Math.max(t,start));day<end;day+=86400_000){
  const opens=day+a*60000;
  if(opens>t&&opens>=start&&opens<end)return new Date(opens);
 }
 return null;
}

export type OfferState='ON'|'WAITING'|'ENDED'|'OFF';
export function offerState(o:OfferTerms,now:Date):{state:OfferState;until:Date|null;next:Date|null}{
 if(!o.enabled)return {state:'OFF',until:null,next:null};
 const until=offerWindowEnd(o,now);
 if(until)return {state:'ON',until,next:null};
 const next=offerNextStart(o,now);
 return next?{state:'WAITING',until:null,next}:{state:'ENDED',until:null,next:null};
}

/** Of the offers on at `now`, the one whose free time lasts longest. */
export function bestOffer<T extends OfferTerms>(offers:T[],now:Date):{offer:T;endsAt:Date}|null{
 let best:{offer:T;endsAt:Date}|null=null;
 for(const offer of offers){
  const endsAt=offerWindowEnd(offer,now);
  if(endsAt&&(!best||endsAt>best.endsAt))best={offer,endsAt};
 }
 return best;
}

/** The hotspot page proves it ran CHAP with the free name as the password; anything else is not a free sign-in. */
export function offerChapValid(username:string,chapPassword:Buffer,challenge:Buffer):boolean{
 if(!isOfferUsername(username)||chapPassword.length!==17)return false;
 const proof=createHash('md5').update(chapPassword.subarray(0,1)).update(username).update(challenge).digest();
 return timingSafeEqual(proof,chapPassword.subarray(1));
}

/** Validate an offer an administrator typed in. Returns the problem in plain words, or null. */
export function offerProblem(o:{name:string;starts_at:string;ends_at:string;daily_start:string|null;daily_end:string|null;download_mbps:number;upload_mbps:number}):string|null{
 if(!o.name.trim())return 'Give the offer a name customers will see.';
 const s=Date.parse(o.starts_at),e=Date.parse(o.ends_at);
 if(!Number.isFinite(s)||!Number.isFinite(e))return 'Set when the offer starts and ends.';
 if(e<=s)return 'The offer must end after it starts.';
 if(e-s>366*86400_000)return 'An offer can run for at most a year.';
 const hhmm=/^([01]\d|2[0-3]):[0-5]\d$/;
 if((o.daily_start===null)!==(o.daily_end===null))return 'Set both daily hours, or neither.';
 if(o.daily_start!==null&&(!hhmm.test(o.daily_start)||!hhmm.test(o.daily_end!)))return 'Daily hours must look like 14:00.';
 if(o.daily_start!==null&&o.daily_start===o.daily_end)return 'The daily hours must not start and end at the same time.';
 for(const v of [o.download_mbps,o.upload_mbps])if(!Number.isInteger(v)||v<1||v>10000)return 'Speeds must be whole Mbps between 1 and 10000.';
 return null;
}
