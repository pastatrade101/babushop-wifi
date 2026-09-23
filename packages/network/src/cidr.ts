// IPv4 address arithmetic for tunnel planning and target validation.
//
// Every address this module handles is compared as an unsigned 32-bit number.
// JavaScript's bitwise operators return signed integers, so each shift is
// closed with >>>0 — without it, any address from 128.0.0.0 up goes negative
// and comparisons silently invert.
//
// IPv6 is refused rather than approximated: the site is v4-only, and a v6
// literal reaching the planner would mean something upstream is wrong.

export type Cidr={address:number;bits:number};

export function parseAddress(value:string):number{
 const parts=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value.trim());
 if(!parts)throw new Error(`Not an IPv4 address: ${value}`);
 const octets=parts.slice(1).map(Number);
 if(octets.some(o=>o>255))throw new Error(`Not an IPv4 address: ${value}`);
 return ((octets[0]<<24)|(octets[1]<<16)|(octets[2]<<8)|octets[3])>>>0;
}

export function formatAddress(value:number):string{
 return [24,16,8,0].map(shift=>(value>>>shift)&255).join('.');
}

export function parseCidr(value:string):Cidr{
 const [address,prefix='32']=value.trim().split('/');
 const bits=Number(prefix);
 if(!Number.isInteger(bits)||bits<0||bits>32)throw new Error(`Not an IPv4 CIDR: ${value}`);
 return {address:parseAddress(address),bits};
}

export function formatCidr(cidr:Cidr):string{return `${formatAddress(cidr.address)}/${cidr.bits}`;}

/** The first address in the block, with the host bits cleared. */
export function networkOf(cidr:Cidr):number{
 return cidr.bits===0?0:((cidr.address>>>(32-cidr.bits))<<(32-cidr.bits))>>>0;
}

/** The last address in the block. */
export function broadcastOf(cidr:Cidr):number{
 return cidr.bits===32?cidr.address:(networkOf(cidr)+2**(32-cidr.bits)-1)>>>0;
}

/** True when the two blocks share any address at all, in either direction. */
export function overlaps(a:Cidr,b:Cidr):boolean{
 return networkOf(a)<=broadcastOf(b)&&networkOf(b)<=broadcastOf(a);
}

export function contains(cidr:Cidr,address:string):boolean{
 const value=parseAddress(address);
 return value>=networkOf(cidr)&&value<=broadcastOf(cidr);
}

/** Target validation: an address is acceptable only inside a declared block. */
export function containsAny(cidrs:string[],address:string):boolean{
 return cidrs.some(cidr=>{try{return contains(parseCidr(cidr),address);}catch{return false;}});
}

/**
 * The management subnet is chosen, never hard-coded: a block that collides with
 * a customer LAN would break the site it is meant to manage. Candidates are
 * tried in order and the first one clear of everything in `taken` wins.
 */
export function selectManagementCidr(taken:string[],candidates:string[]=DEFAULT_CANDIDATES):string{
 const used=taken.map(parseCidr);
 const free=candidates.find(candidate=>{const block=parseCidr(candidate);return !used.some(existing=>overlaps(block,existing));});
 if(!free)throw new Error('No management subnet is free of the existing networks. Widen the candidate pool.');
 return free;
}

// Deliberately not 10.0.0.0/24 or 192.168.88.0/24: those are the two blocks a
// MikroTik site is most likely to already be using.
export const DEFAULT_CANDIDATES=['10.77.1.0/24','10.77.2.0/24','10.88.1.0/24','172.30.1.0/24','172.31.1.0/24'];

/** Upper-case, colon-separated. Vendors quote MACs in every other shape. */
export function normalizeMac(value:string):string{
 const hex=value.trim().toUpperCase().replace(/[^0-9A-F]/g,'');
 if(hex.length!==12)throw new Error(`Not a MAC address: ${value}`);
 return hex.match(/.{2}/g)!.join(':');
}

export function sameMac(a:string,b:string):boolean{
 try{return normalizeMac(a)===normalizeMac(b);}catch{return false;}
}
