import {type MikroTikConnection,type ReadPath} from './index.ts';
import {normalizeMac,sameMac,containsAny} from './cidr.ts';

// Device discovery from what the router already knows. Nothing is scanned and
// no probe is sent: DHCP leases and the ARP table are read, merged on MAC, and
// returned. A device the router has never spoken to will not appear, which is
// the correct answer rather than a reason to sweep the subnet.

export type Source='DHCP'|'ARP'|'BOTH';

export type DiscoveredDevice={
 /** Natural key. The database row carries its own uuid; this stays stable across rediscovery. */
 id:string;
 macAddress:string;
 ipAddress:string|null;
 hostname:string|null;
 interface:string|null;
 dhcpStatus:string|null;
 /** The router's own "last seen" for the lease, verbatim — a duration, not a timestamp. */
 lastSeenRouter:string|null;
 observedAt:string;
 source:Source;
 vendor:string|null;
 model:string|null;
 type:'ACCESS_POINT'|'ROUTER'|'CLIENT'|'UNKNOWN';
 arpComplete:boolean;
};

export type Snapshot={
 identity:string|null;
 version:string|null;
 boardName:string|null;
 uptime:string|null;
 deviceMode:Record<string,string>|null;
 interfaces:Row[];
 addresses:Row[];
 routes:Row[];
 leases:Row[];
 arp:Row[];
 bridges:Row[];
 bridgePorts:Row[];
 vlans:Row[];
 listMembers:Row[];
 firewallFilter:Row[];
 firewallNat:Row[];
 addressLists:Row[];
 hotspots:Row[];
 hotspotActive:Row[];
 wireguard:Row[];
 wireguardPeers:Row[];
 services:Row[];
 readAt:string;
};

export type Row=Record<string,string>;

/**
 * Keys RouterOS will happily hand back that must never travel further.
 * /interface/wireguard carries the interface private key, and several paths
 * carry shared secrets. They are stripped at the edge, so nothing downstream --
 * cache, response schema, audit detail or log line -- can leak one by accident.
 */
const SENSITIVE=['private-key','secret','password','preshared-key','key','shared-secret'];

/** RouterOS answers single-value paths with an object and lists with an array. */
const rows=(value:unknown):Row[]=>{
 const list=Array.isArray(value)?value as Row[]:(value?[value as Row]:[]);
 return list.map(row=>Object.fromEntries(Object.entries(row).filter(([name])=>!SENSITIVE.includes(name))) as Row);
};

// Known prefixes for the hardware on this site. An unrecognised OUI stays null
// rather than being guessed at.
const OUI:Record<string,string>={'D4:D6:DF':'TP-Link','FC:31:5D':'TP-Link','74:4D:28':'MikroTik','48:8F:5A':'MikroTik','2C:C8:1B':'MikroTik'};

/**
 * Reads the router's view of itself and its networks. Every path is a compile-time
 * constant from the connector's allowlist. A path that fails is recorded as empty
 * rather than failing the whole snapshot, so one restricted endpoint cannot blind
 * the rest of discovery.
 */
export async function snapshot(connection:Pick<MikroTikConnection,'read'>):Promise<Snapshot>{
 const read=async(path:ReadPath):Promise<Row[]>=>{try{return rows(await connection.read(path));}catch{return [];}};
 const [resource,identity,deviceMode]=await Promise.all([read('system/resource'),read('system/identity'),read('system/device-mode')]);
 // Issued together rather than in sequence: nineteen round trips at tunnel
 // latency is several seconds of an administrator waiting for a page.
 const [interfaces,addresses,routes,leases,arp]=await Promise.all([read('interface'),read('ip/address'),read('ip/route'),read('ip/dhcp-server/lease'),read('ip/arp')]);
 const [bridges,bridgePorts,vlans,listMembers]=await Promise.all([read('interface/bridge'),read('interface/bridge/port'),read('interface/vlan'),read('interface/list/member')]);
 const [firewallFilter,firewallNat,addressLists]=await Promise.all([read('ip/firewall/filter'),read('ip/firewall/nat'),read('ip/firewall/address-list')]);
 const [hotspots,hotspotActive,wireguard,wireguardPeers,services]=await Promise.all([read('ip/hotspot'),read('ip/hotspot/active'),read('interface/wireguard'),read('interface/wireguard/peers'),read('ip/service')]);
 return {
  identity:identity[0]?.name??null,
  version:resource[0]?.version??null,
  boardName:resource[0]?.['board-name']??null,
  uptime:resource[0]?.uptime??null,
  deviceMode:deviceMode[0]??null,
  interfaces,addresses,routes,leases,arp,bridges,bridgePorts,vlans,listMembers,
  firewallFilter,firewallNat,addressLists,hotspots,hotspotActive,wireguard,wireguardPeers,services,
  readAt:new Date().toISOString(),
 };
}

/** The customer-facing and management blocks this router actually serves. */
export function lanCidrs(snap:Snapshot):string[]{
 return snap.addresses.filter(a=>a.disabled!=='true'&&a.address?.includes('/')).map(a=>a.address);
}

function identify(hostname:string|null,mac:string):Pick<DiscoveredDevice,'vendor'|'model'|'type'>{
 const vendor=OUI[mac.slice(0,8)]??null;
 // TP-Link EAPs name their lease after the model: "EAP225-Outdoor-D4-D6-DF-...".
 const model=hostname?.match(/^(EAP\d{3}[A-Za-z-]*?)(?=-[0-9A-Fa-f]{2}-)/)?.[1]??null;
 return {vendor,model,type:model?.startsWith('EAP')?'ACCESS_POINT':'UNKNOWN'};
}

/**
 * Merges the two tables the router keeps. A lease is authoritative for hostname
 * and address; ARP is authoritative for whether the device answered recently at
 * layer 2, which is the difference between "offline" and "not answering IP".
 */
export function devicesFrom(snap:Snapshot):DiscoveredDevice[]{
 const observedAt=snap.readAt;
 const merged=new Map<string,DiscoveredDevice>();
 for(const lease of snap.leases){
  if(!lease['mac-address'])continue;
  const mac=normalizeMac(lease['mac-address']);
  merged.set(mac,{id:mac,macAddress:mac,ipAddress:lease.address??null,hostname:lease['host-name']||null,interface:lease.server??null,dhcpStatus:lease.status??null,lastSeenRouter:lease['last-seen']??null,observedAt,source:'DHCP',arpComplete:false,...identify(lease['host-name']||null,mac)});
 }
 for(const entry of snap.arp){
  if(!entry['mac-address'])continue;
  const mac=normalizeMac(entry['mac-address']);
  const complete=entry.complete==='true';
  const existing=merged.get(mac);
  if(existing)merged.set(mac,{...existing,source:'BOTH',interface:entry.interface??existing.interface,arpComplete:existing.arpComplete||complete});
  else merged.set(mac,{id:mac,macAddress:mac,ipAddress:entry.address??null,hostname:null,interface:entry.interface??null,dhcpStatus:null,lastSeenRouter:null,observedAt,source:'ARP',arpComplete:complete,...identify(null,mac)});
 }
 return [...merged.values()].sort((a,b)=>(a.ipAddress??'').localeCompare(b.ipAddress??'',undefined,{numeric:true}));
}

export function findDeviceByMac(devices:DiscoveredDevice[],mac:string):DiscoveredDevice|null{
 return devices.find(device=>sameMac(device.macAddress,mac))??null;
}

/**
 * Last line of defence before any address reaches the router or a socket: it has
 * to be one this site actually serves. Callers pass an id, look the address up,
 * and check it here — an address that arrived any other way is refused.
 */
export function assertManageable(address:string|null,cidrs:string[]):string{
 if(!address||!containsAny(cidrs,address))throw new Error('Address is not inside a network this site serves');
 return address;
}

export class NetworkDiscoveryService {
 constructor(private connection:Pick<MikroTikConnection,'read'>){}
 async run(){const snap=await snapshot(this.connection);return {snapshot:snap,devices:devicesFrom(snap),lanCidrs:lanCidrs(snap)};}
 async findByMac(mac:string){const {devices}=await this.run();return findDeviceByMac(devices,mac);}
}
