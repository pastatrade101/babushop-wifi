import {createHash} from 'node:crypto';
import {type Row,type Snapshot} from './discovery.ts';
import {analyzeInputPath,type InputPathAnalysis} from './diagnostics.ts';
import {parseCidr,overlaps,contains,selectManagementCidr,formatAddress,networkOf} from './cidr.ts';

// The Phase 5 planner. It computes, it does not apply.
//
// The routed design was rejected on review and this is the replacement. Putting
// the admin subnet into the router's existing peer would have meant editing an
// object this module does not own — which cannot be rolled back by deleting
// marked objects — and would still have needed a return route on the router.
//
// Instead the VPS source-NATs admin traffic to its own tunnel address. The
// router then sees management traffic identical to the portal's, from an address
// its existing peer already permits and its existing routes already carry. So the
// router needs no peer change, no route and no customer-path change: only
// narrowly scoped additive accepts.

export const OWNER='portal-remote-access';

export type Target='MIKROTIK'|'VPS';
export type Kind='CREATE'|'MODIFY'|'DELETE';

export type PlanAction={
 id:string;target:Target;kind:Kind;summary:string;why:string;
 rest:{method:'PUT'|'POST'|'PATCH'|'DELETE';path:string;body?:Record<string,string>}|null;
 command:string;rollback:string;
 /** Set only when an existing object is edited or displaced. Null is the safe case. */
 affectsExisting:string|null;
};

export type ExistingObject={id:string;chain:string;action:string;comment:string;effect:string};

export type Plan={
 version:1;architecture:'VPS_SNAT';generatedAt:string;siteId:string;digest:string;
 managementCidr:string;adminInterface:string;siteInterface:string;serverTunnelAddress:string;
 approvedTargets:string[];
 creates:PlanAction[];changes:PlanAction[];deletes:PlanAction[];existingObjectsAffected:ExistingObject[];
 beforeState:Record<string,unknown>;expectedAfterState:Record<string,unknown>;
 healthChecks:{id:string;description:string;how:string}[];
 rollback:string[];guarantees:string[];warnings:string[];blockers:string[];
};

export type PlanInput={
 siteId:string;snapshot:Snapshot;
 /** The device the plan opens a path to. Nothing else becomes reachable. */
 managementTargets:{address:string;label:string}[];
 /** The interface the targets sit behind, from discovery — never assumed. */
 targetInterface:string;
 vps:{siteInterface:string;tunnelAddress:string;adminInterface?:string;adminListenPort?:number;peerPublicKey?:string;currentAllowedIps?:string};
};

const marker=(siteId:string)=>`managed-by=${OWNER} site=${siteId}`;

/** Router paths that would touch a paying customer. The plan is refused if it names one. */
const CUSTOMER_PATHS=['ip/hotspot','ip/dhcp-server','ip/dns','interface/bridge','interface/vlan','queue','ip/firewall/nat','ip/route','interface/wireguard','system/'];

const forwardDropToInterface=(rules:Row[],iface:string)=>rules.find(r=>r.chain==='forward'&&r.action==='drop'&&r['out-interface']===iface&&!r['in-interface']&&!r['connection-state'])??null;

/** The rule that stops the device replying to the tunnel: a drop for private destinations. */
function forwardDropFromInterface(rules:Row[],iface:string,replyTo:string,lists:Row[]):Row|null{
 return rules.find(r=>{
  if(r.chain!=='forward'||r.action!=='drop'||r['in-interface']!==iface)return false;
  const list=r['dst-address-list'];
  if(!list)return !r['connection-state'];
  return lists.filter(entry=>entry.list===list).some(entry=>{try{return contains(parseCidr(entry.address),replyTo);}catch{return false;}});
 })??null;
}

export function buildPlan(input:PlanInput):Plan{
 const {siteId,snapshot:snap,vps}=input;
 const rules=snap.firewallFilter,lists=snap.addressLists;
 const comment=marker(siteId);
 const adminInterface=vps.adminInterface??'wg-admin';
 const blockers:string[]=[],warnings:string[]=[];
 const creates:PlanAction[]=[],changes:PlanAction[]=[],existing:ExistingObject[]=[];

 // A management subnet is chosen against everything the router actually carries,
 // so it cannot collide with a customer LAN, the WAN or the existing tunnel.
 const taken=[...snap.addresses.filter(a=>a.disabled!=='true'&&a.address?.includes('/')).map(a=>a.address),...snap.routes.filter(r=>r.active==='true'&&r['dst-address']&&r['dst-address']!=='0.0.0.0/0').map(r=>r['dst-address'])];
 let managementCidr='';
 try{managementCidr=selectManagementCidr([...new Set(taken)]);}
 catch(error){blockers.push((error as Error).message);managementCidr='';}
 const collisions=taken.filter(cidr=>{try{return managementCidr&&overlaps(parseCidr(managementCidr),parseCidr(cidr));}catch{return false;}});
 if(collisions.length)blockers.push(`Chosen management subnet ${managementCidr} overlaps ${collisions.join(', ')}.`);
 const adminAddress=managementCidr?`${formatAddress(networkOf(parseCidr(managementCidr))+1)}/${managementCidr.split('/')[1]}`:'';

 const targets=input.managementTargets;
 const approvedTargets=targets.map(t=>t.address);
 if(!targets.length)blockers.push('No approved management target. Approve a discovered device before planning.');

 // ── VPS: the admin interface, and the SNAT that makes the router see us as the portal ──
 const snatRules=targets.map(t=>`iptables -t nat -A POSTROUTING -s ${managementCidr} -d ${t.address}/32 -o ${vps.siteInterface} -j SNAT --to-source ${vps.tunnelAddress}`);
 const forwardRules=targets.flatMap(t=>[
  `iptables -A FORWARD -i ${adminInterface} -o ${vps.siteInterface} -d ${t.address}/32 -j ACCEPT`,
  `iptables -A FORWARD -i ${vps.siteInterface} -o ${adminInterface} -s ${t.address}/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`,
 ]);
 creates.push({
  id:'vps-admin-interface',target:'VPS',kind:'CREATE',
  summary:`Create ${adminInterface} at ${adminAddress} on UDP ${vps.adminListenPort??51821}`,
  why:'Admin peers need their own subnet. The site tunnel is a /30 with no room for a third address.',
  rest:null,
  command:[`# /etc/wireguard/${adminInterface}.conf`,'[Interface]',`Address = ${adminAddress}`,`ListenPort = ${vps.adminListenPort??51821}`,'PrivateKey = <generated at apply time, never logged>',
   ...snatRules.map(rule=>`PostUp = ${rule}`),...forwardRules.map(rule=>`PostUp = ${rule}`),
   ...snatRules.map(rule=>`PostDown = ${rule.replace(' -A ',' -D ')}`),...forwardRules.map(rule=>`PostDown = ${rule.replace(' -A ',' -D ')}`),
   '','# then:',`systemctl enable --now wg-quick@${adminInterface}`].join('\n'),
  rollback:`systemctl disable --now wg-quick@${adminInterface} && rm -f /etc/wireguard/${adminInterface}.conf`,
  affectsExisting:null,
 });
 warnings.push(`The SNAT and forward rules live in ${adminInterface}'s PostUp/PostDown, so bringing the interface down removes them. They match only source ${managementCidr} to ${approvedTargets.join(', ')} leaving ${vps.siteInterface}: portal traffic from the containers and customer traffic never match them.`);

 // The one genuine edit in the whole plan, and it is on our own host.
 changes.push({
  id:'vps-site-peer-allowed-ips',target:'VPS',kind:'MODIFY',
  summary:`Add ${approvedTargets.map(a=>a+'/32').join(', ')} to the ${vps.siteInterface} peer AllowedIPs`,
  why:'WireGuard uses AllowedIPs both to choose the peer for an outbound packet and to accept an inbound source. Without the target address the reply is dropped by the tunnel itself, before any firewall sees it.',
  rest:null,
  command:[`# capture the current value first — this is the rollback value:`,
   `wg show ${vps.siteInterface} allowed-ips`,
   `wg set ${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'} allowed-ips ${[vps.currentAllowedIps??'10.77.0.2/32',...approvedTargets.map(a=>a+'/32')].join(',')}`,
   `# persist the same value in /etc/wireguard/${vps.siteInterface}.conf`].join('\n'),
  rollback:`wg set ${vps.siteInterface} peer <router public key> allowed-ips ${vps.currentAllowedIps??'<captured before-state>'} and restore /etc/wireguard/${vps.siteInterface}.conf`,
  affectsExisting:`${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'}`,
 });
 if(!vps.currentAllowedIps)warnings.push(`The current ${vps.siteInterface} AllowedIPs could not be read without root. Apply must capture it first — the rollback value depends on it.`);

 // ── MikroTik: additive accepts only ──
 const guest=input.targetInterface;
 const outDrop=forwardDropToInterface(rules,guest);
 const inDrop=targets.length?forwardDropFromInterface(rules,guest,vps.tunnelAddress,lists):null;
 const inputPath:InputPathAnalysis=analyzeInputPath(rules,guest);

 for(const target of targets){
  if(!outDrop)blockers.push(`Could not locate the forward drop for traffic leaving towards ${guest}. Refusing to guess an insertion point.`);
  else creates.push({
   id:`mikrotik-forward-to-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`forward accept ${vps.tunnelAddress} → ${target.address}, placed before ${outDrop['.id']}`,
   why:`Rule ${outDrop['.id']} ("${outDrop.comment??''}") drops everything leaving towards ${guest}. Management traffic arrives from the tunnel already source-NATed to ${vps.tunnelAddress}.`,
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'forward',action:'accept','in-interface':vps.siteInterface,'src-address':vps.tunnelAddress,'dst-address':target.address,comment,'place-before':outDrop['.id']}},
   command:`/ip firewall filter add chain=forward action=accept in-interface=${vps.siteInterface} src-address=${vps.tunnelAddress} dst-address=${target.address} comment="${comment}" place-before=${outDrop['.id']}`,
   rollback:`/ip firewall filter remove [find comment="${comment}" and chain=forward and dst-address=${target.address}]`,
   affectsExisting:null,
  });

  if(!inDrop)warnings.push(`No forward drop was found for replies from ${guest} to ${vps.tunnelAddress}. The reply accept may be unnecessary; it is planned anyway and is harmless if redundant.`);
  creates.push({
   id:`mikrotik-forward-from-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`forward accept ${target.address} → ${vps.tunnelAddress}, established/related only${inDrop?`, placed before ${inDrop['.id']}`:''}`,
   why:inDrop?`Rule ${inDrop['.id']} ("${inDrop.comment??''}") drops traffic from ${guest} to private destinations, and ${vps.tunnelAddress} falls inside its ${inDrop['dst-address-list']} list. Only replies to connections we opened are accepted.`:'Replies to connections opened from the tunnel.',
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'forward',action:'accept','in-interface':guest,'src-address':target.address,'dst-address':vps.tunnelAddress,'connection-state':'established,related',comment,...(inDrop?{'place-before':inDrop['.id']}:{})}},
   command:`/ip firewall filter add chain=forward action=accept in-interface=${guest} src-address=${target.address} dst-address=${vps.tunnelAddress} connection-state=established,related comment="${comment}"${inDrop?` place-before=${inDrop['.id']}`:''}`,
   rollback:`/ip firewall filter remove [find comment="${comment}" and chain=forward and src-address=${target.address}]`,
   affectsExisting:null,
  });

  // Only planned when the rule table proves the drop is the cause, per review.
  if(inputPath.blocksReplies&&inputPath.dropRuleId)creates.push({
   id:`mikrotik-input-icmp-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`input accept ICMP replies from ${target.address} only, placed before ${inputPath.dropRuleId}`,
   why:`${inputPath.explanation} Scoped to ICMP from ${target.address} alone, so the blanket guest drop keeps protecting router management from every other customer.`,
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'input',action:'accept','in-interface':guest,'src-address':target.address,protocol:'icmp','connection-state':'established,related',comment,'place-before':inputPath.dropRuleId}},
   command:`/ip firewall filter add chain=input action=accept in-interface=${guest} src-address=${target.address} protocol=icmp connection-state=established,related comment="${comment}" place-before=${inputPath.dropRuleId}`,
   rollback:`/ip firewall filter remove [find comment="${comment}" and chain=input]`,
   affectsExisting:null,
  });
 }

 for(const rule of [outDrop,inDrop,inputPath.blocksReplies?rules.find(r=>r['.id']===inputPath.dropRuleId)??null:null]){
  if(rule)existing.push({id:rule['.id'],chain:rule.chain,action:rule.action,comment:rule.comment??'',effect:'Not edited. Its index shifts down by one as an accept is inserted above it; its matchers, action and relative order against every other rule are unchanged.'});
 }

 const touched=creates.concat(changes).filter(a=>a.target==='MIKROTIK'&&a.rest).map(a=>a.rest!.path);
 const customerTouching=touched.filter(path=>CUSTOMER_PATHS.some(prefix=>path.startsWith(prefix)));
 const guarantees=[
  customerTouching.length?`REFUSED: the plan touches ${customerTouching.join(', ')}.`:'No existing Hotspot, NAT, DHCP, bridge, VLAN or queue configuration will be modified.',
  'Every MikroTik object in this plan is an insert. Nothing existing is edited, renamed, disabled or removed.',
  `Every MikroTik object carries comment "${comment}", and rollback removes objects by that marker alone.`,
  'The router needs no WireGuard peer change, no route and no change to the customer path.',
  `Only ${approvedTargets.join(', ')} becomes reachable. No other address on ${guest} is opened.`,
 ];
 if(customerTouching.length)blockers.push(`Plan names a customer-facing path: ${customerTouching.join(', ')}.`);

 const plan:Omit<Plan,'digest'>={
  version:1,architecture:'VPS_SNAT',generatedAt:new Date().toISOString(),siteId,
  managementCidr,adminInterface,siteInterface:vps.siteInterface,serverTunnelAddress:vps.tunnelAddress,approvedTargets,
  creates,changes,deletes:[],existingObjectsAffected:existing,
  beforeState:{
   routerOs:snap.version,identity:snap.identity,uptime:snap.uptime,
   addresses:snap.addresses.map(a=>`${a.address} on ${a.interface}`),
   defaultRoute:snap.routes.find(r=>r['dst-address']==='0.0.0.0/0')?.gateway??null,
   hotspot:snap.hotspots.map(h=>`${h.name} on ${h.interface} disabled=${h.disabled} invalid=${h.invalid}`),
   wireguardPeers:snap.wireguardPeers.map(p=>`${p.interface} allowed=${p['allowed-address']} handshake=${p['last-handshake']??'never'}`),
   firewallRuleCount:rules.length,
   firewallOrder:rules.map((r,index)=>`${index} ${r['.id']} ${r.chain} ${r.action} ${r.comment??''}`),
   vpsCapturedAtApplyTime:[`wg show ${vps.siteInterface} allowed-ips`,`ip route`,'iptables -t nat -S POSTROUTING','iptables -S FORWARD','sysctl net.ipv4.ip_forward'],
  },
  expectedAfterState:{
   firewallRuleCount:rules.length+creates.filter(a=>a.target==='MIKROTIK').length,
   newRules:creates.filter(a=>a.target==='MIKROTIK').map(a=>a.summary),
   unchanged:['default route','WAN address','hotspot server and profile','DHCP servers and networks','all NAT rules','bridges and ports','the existing WireGuard peer on the router'],
   vpsRoutes:[`${approvedTargets.map(a=>a+'/32').join(', ')} via ${vps.siteInterface}`,`${managementCidr} via ${adminInterface}`],
  },
  healthChecks:[
   {id:'router-reachable',description:'The router still answers the portal connection',how:'GET /rest/system/resource through the existing read-only account'},
   {id:'hotspot-running',description:'The customer hotspot is still enabled and valid',how:'GET /rest/ip/hotspot — babu-hotspot disabled=false invalid=false'},
   {id:'default-route',description:'The default route is unchanged',how:'GET /rest/ip/route — compare 0.0.0.0/0 gateway against beforeState'},
   {id:'wan',description:'WAN connectivity is unchanged',how:'GET /rest/ip/address — ether1 address unchanged; router pings its upstream gateway'},
   {id:'wg-running',description:'The site WireGuard interface is running',how:'GET /rest/interface/wireguard'},
   {id:'wg-handshake',description:'The site peer handshake is recent',how:'GET /rest/interface/wireguard/peers — last-handshake under two minutes'},
   {id:'vps-to-router',description:'The VPS reaches the router tunnel address',how:`ping ${'{router tunnel ip}'} from the VPS`},
   {id:'router-to-target',description:'The router reaches the target, now that replies are permitted',how:`POST /rest/tool/ping address=${approvedTargets[0]??'<target>'}`},
   {id:'tunnel-to-target',description:'The target answers through the management tunnel',how:`TCP connect to ${approvedTargets[0]??'<target>'}:80 and :443 from the VPS`},
  ],
  rollback:[
   `/ip firewall filter remove [find comment="${comment}"]   # removes only objects this module created`,
   `systemctl disable --now wg-quick@${adminInterface}        # drops the SNAT and forward rules with the interface`,
   `wg set ${vps.siteInterface} peer <router public key> allowed-ips ${vps.currentAllowedIps??'<captured before-state>'}`,
   `rm -f /etc/wireguard/${adminInterface}.conf`,
   'The portal connection used to perform the change is never touched by rollback.',
  ],
  guarantees,warnings,blockers,
 };
 return {...plan,digest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
