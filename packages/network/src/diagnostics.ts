import net from 'node:net';
import {type MikroTikConnection,type PingReply} from './index.ts';
import {type Row,type Snapshot,type DiscoveredDevice,assertManageable} from './discovery.ts';

// Reachability, stated honestly.
//
// A failed ping is not evidence that a device is down. On this router it is not
// even evidence about the device: an input rule can drop the reply before the
// router ever sees it. So the verdict is derived from four independent signals —
// the ARP table, the DHCP lease, the ICMP result and the firewall's own rule
// order — and when they cannot separate two explanations, it says so instead of
// picking one.

export type Verdict=
 |'REACHABLE'                        // something answered at layer 3
 |'ICMP_BLOCKED_BY_ROUTER_FIREWALL'  // the reply cannot reach the router; the device is unjudged
 |'NO_ICMP_REPLY_DEVICE_UP'          // reply path is clear, device answers ARP but not ICMP
 |'OFFLINE'                          // no ARP, no lease activity, no reply
 |'INDETERMINATE';

export type PortState='OPEN'|'REFUSED'|'TIMEOUT'|'NO_ROUTE'|'NOT_ATTEMPTED'|'ERROR';
export type PortProbe={port:number;state:PortState;detail:string};

export type Reachability={
 deviceId:string;address:string;verdict:Verdict;
 icmp:{sent:number;received:number;lossPercent:number;averageRttMs:number|null;ran:boolean;detail:string};
 arp:{present:boolean;complete:boolean};
 dhcp:{status:string|null};
 firewall:InputPathAnalysis;
 ports:PortProbe[];
 managementProtocol:'https'|'http'|null;
 reasons:string[];
 checkedAt:string;
};

export type InputPathAnalysis={
 /** True when a blanket drop for this interface sits above the established/related accept. */
 blocksReplies:boolean;
 dropRuleId:string|null;dropIndex:number|null;
 acceptRuleId:string|null;acceptIndex:number|null;
 explanation:string;
};

const num=(value:string|undefined,fallback=0)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;};

/** "153ms371us" and "1s200ms" both mean a duration; only the milliseconds matter here. */
export function parseRtt(value:string|undefined):number|null{
 if(!value)return null;
 const parts=/^(?:(\d+)s)?(?:(\d+)ms)?(?:(\d+)us)?$/.exec(value.trim());
 if(!parts)return null;
 const ms=num(parts[1])*1000+num(parts[2])+num(parts[3])/1000;
 return Number.isFinite(ms)?Math.round(ms*1000)/1000:null;
}

/** A rule that drops everything arriving on one interface, with no narrowing matcher. */
function isBlanketDrop(rule:Row,iface:string):boolean{
 if(rule.chain!=='input'||rule.action!=='drop'||rule['in-interface']!==iface)return false;
 return !['dst-port','src-port','protocol','connection-state','src-address','dst-address','src-address-list','dst-address-list','hotspot'].some(key=>rule[key]);
}

const acceptsEstablished=(rule:Row)=>rule.chain==='input'&&rule.action==='accept'&&(rule['connection-state']??'').includes('established');

/**
 * Decides whether the router can receive replies to traffic it originates towards
 * `iface`. This is a pure function of the rule table so it can be tested against
 * a captured snapshot without touching the router.
 */
export function analyzeInputPath(rules:Row[],iface:string):InputPathAnalysis{
 const dropIndex=rules.findIndex(rule=>isBlanketDrop(rule,iface));
 const acceptIndex=rules.findIndex(acceptsEstablished);
 const drop=dropIndex>=0?rules[dropIndex]:null,accept=acceptIndex>=0?rules[acceptIndex]:null;
 const ids={dropRuleId:drop?.['.id']??null,dropIndex:dropIndex>=0?dropIndex:null,acceptRuleId:accept?.['.id']??null,acceptIndex:acceptIndex>=0?acceptIndex:null};
 if(dropIndex<0)return {...ids,blocksReplies:false,explanation:`No blanket input drop for ${iface}. Replies to router-originated traffic are not filtered by interface.`};
 if(acceptIndex<0)return {...ids,blocksReplies:true,explanation:`Input rule ${drop!['.id']} drops everything arriving on ${iface} and the chain has no established/related accept at all.`};
 if(dropIndex<acceptIndex)return {...ids,blocksReplies:true,explanation:`Input rule ${drop!['.id']} (index ${dropIndex}, "${drop!.comment??''}") drops everything arriving on ${iface} and sits above the established/related accept ${accept!['.id']} at index ${acceptIndex}. Replies to the router's own probes are discarded before that accept is reached.`};
 return {...ids,blocksReplies:false,explanation:`The established/related accept ${accept!['.id']} at index ${acceptIndex} precedes the ${iface} drop at index ${dropIndex}, so replies survive.`};
}

/**
 * A TCP connect from this host.
 *
 * It is deliberately refused unless a management route is known to exist. Without
 * one the packet follows the default route and leaves the VPS towards the ISP —
 * a private address on the public path, and a long timeout instead of an answer.
 * The flag is set once the Phase 5 plan has been applied and verified, never by
 * guesswork here.
 */
export function tcpProbe(host:string,port:number,timeoutMs=2500,routeReady=process.env.MANAGEMENT_ROUTE_READY==='true'):Promise<PortProbe>{
 if(!routeReady)return Promise.resolve({port,state:'NO_ROUTE',detail:'No management route to this network yet. The probe was not sent, so this says nothing about the device.'});
 return new Promise(resolve=>{
  const socket=new net.Socket();let settled=false;
  const finish=(state:PortState,detail:string)=>{if(settled)return;settled=true;socket.destroy();resolve({port,state,detail});};
  socket.setTimeout(timeoutMs,()=>finish('TIMEOUT','No answer before the timeout. Filtered or silent.'));
  socket.once('connect',()=>finish('OPEN','Accepted the connection.'));
  socket.once('error',(error:NodeJS.ErrnoException)=>{
   if(error.code==='ECONNREFUSED')return finish('REFUSED','Refused the connection — the host is up and nothing is listening on this port.');
   if(error.code==='EHOSTUNREACH'||error.code==='ENETUNREACH')return finish('NO_ROUTE','No route to the host from this server.');
   finish('ERROR',`Probe failed (${error.code??'unknown'}).`);
  });
  socket.connect(port,host);
 });
}

const summarize=(replies:PingReply[])=>{
 const sent=replies.length;
 const received=replies.filter(reply=>reply.status!=='timeout'&&reply['avg-rtt']).length;
 const rtts=replies.map(reply=>parseRtt(reply['avg-rtt']??reply.time)).filter((value):value is number=>value!==null);
 return {sent,received,lossPercent:sent?Math.round(((sent-received)/sent)*100):100,averageRttMs:rtts.length?Math.round((rtts.reduce((a,b)=>a+b,0)/rtts.length)*1000)/1000:null};
};

/**
 * Runs the diagnostic for one already-discovered device. The address is never
 * taken from the caller: it comes from the device record and is re-checked
 * against the networks this site serves before anything is sent.
 */
export async function testDeviceReachability(input:{
 connection:Pick<MikroTikConnection,'ping'>;device:DiscoveredDevice;snapshot:Snapshot;lanCidrs:string[];ports?:number[];count?:number;
}):Promise<Reachability>{
 const {connection,device,snapshot:snap,lanCidrs}=input;
 const address=assertManageable(device.ipAddress,lanCidrs);
 const firewall=analyzeInputPath(snap.firewallFilter,device.interface??'');
 const arp=snap.arp.filter(entry=>entry['mac-address']&&entry['mac-address'].toUpperCase()===device.macAddress);
 const arpState={present:arp.length>0,complete:arp.some(entry=>entry.complete==='true')};

 let icmp={sent:0,received:0,lossPercent:100,averageRttMs:null as number|null,ran:false,detail:''};
 try{
  const replies=await connection.ping(address,input.count??4);
  icmp={...summarize(replies),ran:true,detail:replies.length?'':'The router returned no ping result.'};
 }catch(error){icmp={...icmp,ran:false,detail:`The router refused or could not run the ping (${(error as Error).message}).`};}

 const ports=await Promise.all((input.ports??[80,443]).map(port=>tcpProbe(address,port)));
 const answeredTcp=ports.find(probe=>probe.state==='OPEN'||probe.state==='REFUSED');
 const open=ports.filter(probe=>probe.state==='OPEN').map(probe=>probe.port);
 const reasons:string[]=[];

 let verdict:Verdict='INDETERMINATE';
 if(icmp.received>0||answeredTcp){
  verdict='REACHABLE';
  reasons.push(icmp.received>0?`Answered ${icmp.received} of ${icmp.sent} pings.`:`Answered a TCP connection on port ${answeredTcp!.port}.`);
 }else if(firewall.blocksReplies){
  // The decisive case: we know the reply could not arrive, so the device itself
  // has not been tested at all. Saying "offline" here would be a guess.
  verdict='ICMP_BLOCKED_BY_ROUTER_FIREWALL';
  reasons.push(firewall.explanation);
  reasons.push('The device has not been judged. Clear the reply path, or reach it over the management tunnel, before drawing a conclusion.');
 }else if(arpState.complete){
  verdict='NO_ICMP_REPLY_DEVICE_UP';
  reasons.push('The ARP entry is complete, so the device answered at layer 2, but it did not answer ICMP.');
 }else if(!arpState.present&&device.dhcpStatus!=='bound'){
  verdict='OFFLINE';
  reasons.push('No ARP entry and no bound DHCP lease. Nothing has answered for this device.');
 }else{
  reasons.push('The evidence does not separate a silent device from a filtered path.');
 }
 if(ports.every(probe=>probe.state==='NO_ROUTE'))reasons.push('TCP probes were not sent: this server has no route into that network yet.');

 return {
  deviceId:device.id,address,verdict,icmp,arp:arpState,dhcp:{status:device.dhcpStatus},firewall,ports,
  managementProtocol:open.includes(443)?'https':open.includes(80)?'http':null,
  reasons,checkedAt:new Date().toISOString(),
 };
}
