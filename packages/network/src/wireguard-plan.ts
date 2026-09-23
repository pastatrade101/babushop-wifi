import {createHash,randomUUID} from 'node:crypto';
import {type Row,type Snapshot} from './discovery.ts';
import {analyzeInputPath,type InputPathAnalysis} from './diagnostics.ts';
import {parseCidr,overlaps,contains,selectManagementCidr,formatAddress,networkOf} from './cidr.ts';

// The Phase 5 planner. It computes, it does not apply.
//
// The routed design was rejected on review and this is the replacement. Putting
// the admin subnet into the router's existing peer would have meant editing an
// object this module does not own -- which cannot be rolled back by deleting
// marked objects -- and would still have needed a return route on the router.
//
// Instead the VPS source-NATs admin traffic to its own tunnel address. The
// router then sees management traffic identical to the portal's, from an address
// its existing peer already permits and its existing routes already carry. So the
// router needs no peer change, no route and no customer-path change: only
// narrowly scoped additive accepts.
//
// Two things this planner will not do. It will not claim a host fact it has not
// been given: the API runs in its own network namespace and cannot see the host's
// routing table, forwarding flag or WireGuard state, so those arrive as input and
// are marked UNVERIFIED when absent. And it will not emit a rollback that could
// reach another provisioning run: every object carries a provision id, and
// rollback matches the whole marker, not the site.

export const OWNER='portal-remote-access';

export type Target='MIKROTIK'|'VPS';
export type Kind='CREATE'|'MODIFY'|'DELETE';
export type PreflightStatus='PASS'|'ACTION_REQUIRED'|'UNVERIFIED';

export type PreflightCheck={
 id:string;description:string;command:string;
 expected:string;observed:string|null;status:PreflightStatus;note:string;
};

export type PlanAction={
 id:string;target:Target;kind:Kind;summary:string;why:string;
 rest:{method:'PUT'|'POST'|'PATCH'|'DELETE';path:string;body?:Record<string,string>}|null;
 /** Applied to the running system. Lost on restart unless `persistent` is also applied. */
 command:string;
 /** Written to disk so the change survives an interface or server restart. */
 persistent:string|null;
 rollback:string;
 affectsExisting:string|null;
};

export type ExistingObject={id:string;chain:string;action:string;comment:string;effect:string};

export type VpsFacts={
 siteInterface:string;tunnelAddress:string;
 adminInterface?:string;adminListenPort?:number;peerPublicKey?:string;
 /**
  * Host facts, gathered on the VPS itself. The API container has its own network
  * namespace: its /proc/sys/net values, routes and interfaces are not the host's,
  * so reading them there would be wrong rather than merely incomplete.
  */
 preflight?:{
  capturedAt?:string;ipForward?:string;
  wgManager?:'wg-quick'|'systemd-networkd'|'manual'|'unknown';
  wgUnit?:string;wgUnitEnabled?:boolean;wgUnitActive?:boolean;wgConfigPath?:string;
  runtimeAllowedIps?:string;persistentAllowedIps?:string;
  /** The Table / PostUp / PostDown / AllowedIPs lines of the site conf, verbatim. */
  wgConfDirectives?:string[];
  routeToTarget?:string;adminPortFree?:boolean;
  hostFirewall?:string;adminPortReachable?:boolean;adminPortProbe?:string;
 };
};

export type Plan={
 version:2;architecture:'VPS_SNAT';generatedAt:string;siteId:string;provisionId:string;digest:string;marker:string;
 managementCidr:string;adminInterface:string;siteInterface:string;serverTunnelAddress:string;approvedTargets:string[];
 preflight:PreflightCheck[];
 creates:PlanAction[];changes:PlanAction[];deletes:PlanAction[];existingObjectsAffected:ExistingObject[];
 beforeState:Record<string,unknown>;expectedAfterState:Record<string,unknown>;
 healthChecks:{id:string;description:string;how:string}[];
 rollback:string[];guarantees:string[];warnings:string[];blockers:string[];
};

export type PlanInput={
 siteId:string;snapshot:Snapshot;
 managementTargets:{address:string;label:string}[];
 targetInterface:string;
 vps:VpsFacts;
 /** Supplied only by tests, so a plan's digest can be compared. */
 provisionId?:string;
};

/** Router paths that would touch a paying customer. The plan is refused if it names one. */
const CUSTOMER_PATHS=['ip/hotspot','ip/dhcp-server','ip/dns','interface/bridge','interface/vlan','queue','ip/firewall/nat','ip/route','interface/wireguard','system/'];

export type RoutingMode='default'|'off'|'custom-table'|'custom-commands'|'unknown';

/**
 * Whether wg-quick manages this interface's routes.
 *
 * It matters because the persistent AllowedIPs edit only recreates the target
 * route when wg-quick is the thing installing routes. "Table = off" or hand-rolled
 * PostUp commands mean it is not, and the management path would quietly disappear
 * at the next restart. Absence of evidence is reported as `unknown`, never as
 * `default`: the two look identical from outside the config file.
 */
export function classifyRouting(directives?:string[]):RoutingMode{
 if(!directives)return 'unknown';
 const table=directives.map(line=>/^\s*(?:\d+:)?\s*Table\s*=\s*(\S+)/i.exec(line)?.[1]).find(Boolean);
 if(table)return table.toLowerCase()==='off'?'off':'custom-table';
 if(directives.some(line=>/^\s*(?:\d+:)?\s*Post(Up|Down)\s*=.*\bip\s+route\b/i.test(line)))return 'custom-commands';
 return 'default';
}

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
 const facts=vps.preflight??{};
 const rules=snap.firewallFilter,lists=snap.addressLists;
 const provisionId=input.provisionId??randomUUID();
 // Unique per provisioning run, not per site: rolling back one failed apply must
 // never be able to reach a rule a different, successful apply created here.
 const marker=`managed-by=${OWNER} site=${siteId} provision=${provisionId}`;
 const adminInterface=vps.adminInterface??'wg-admin';
 const adminPort=vps.adminListenPort??51821;
 const confPath=facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`;
 const routing=classifyRouting(facts.wgConfDirectives);
 const blockers:string[]=[],warnings:string[]=[];
 const creates:PlanAction[]=[],changes:PlanAction[]=[],existing:ExistingObject[]=[];

 const taken=[...snap.addresses.filter(a=>a.disabled!=='true'&&a.address?.includes('/')).map(a=>a.address),...snap.routes.filter(r=>r.active==='true'&&r['dst-address']&&r['dst-address']!=='0.0.0.0/0').map(r=>r['dst-address'])];
 let managementCidr='';
 try{managementCidr=selectManagementCidr([...new Set(taken)]);}
 catch(error){blockers.push((error as Error).message);}
 const collisions=taken.filter(cidr=>{try{return managementCidr&&overlaps(parseCidr(managementCidr),parseCidr(cidr));}catch{return false;}});
 if(collisions.length)blockers.push(`Chosen management subnet ${managementCidr} overlaps ${collisions.join(', ')}.`);
 const adminAddress=managementCidr?`${formatAddress(networkOf(parseCidr(managementCidr))+1)}/${managementCidr.split('/')[1]}`:'';

 const targets=input.managementTargets;
 const approvedTargets=targets.map(t=>t.address);
 if(!targets.length)blockers.push('No approved management target. Approve a discovered device before planning.');
 const primary=approvedTargets[0]??'<target>';

 // ── preflight ─────────────────────────────────────────────────────────────
 const check=(id:string,description:string,command:string,expected:string,observed:string|null|undefined,pass:(value:string)=>boolean,note:string,unverified:string):PreflightCheck=>{
  if(observed===undefined||observed===null)return {id,description,command,expected,observed:null,status:'UNVERIFIED',note:unverified};
  return {id,description,command,expected,observed,status:pass(observed)?'PASS':'ACTION_REQUIRED',note};
 };
 const preflight:PreflightCheck[]=[
  check('ip-forward','IPv4 forwarding is enabled on the host','cat /proc/sys/net/ipv4/ip_forward','1',facts.ipForward,v=>v.trim()==='1',
   facts.ipForward?.trim()==='1'?'Already enabled — Docker requires it. This plan leaves it alone.':'Disabled. The plan below enables it, runtime and persistently.',
   'Not captured. Run this on the VPS host, not in a container: a container has its own network namespace and its value is not the host’s.'),
  check('wg-persistence',`How ${vps.siteInterface} is persistently managed`,`systemctl is-enabled wg-quick@${vps.siteInterface}; systemctl is-active wg-quick@${vps.siteInterface}`,'enabled/active under wg-quick',
   facts.wgManager?`${facts.wgManager}${facts.wgUnit?` (${facts.wgUnit}, enabled=${facts.wgUnitEnabled}, active=${facts.wgUnitActive})`:''}`:undefined,
   ()=>facts.wgManager==='wg-quick',
   facts.wgManager==='wg-quick'?`Persistent state lives in ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}. A runtime-only change would vanish on restart.`:'Not wg-quick. Find where the peer is defined before changing it, or the change will not survive a restart.',
   'Not captured. Until this is known, no AllowedIPs change should be applied: a runtime-only edit disappears silently on the next restart.'),
  check('runtime-allowed-ips',`Current runtime AllowedIPs for the ${vps.siteInterface} peer`,`wg show ${vps.siteInterface} allowed-ips`,'the value to restore on rollback',facts.runtimeAllowedIps,()=>true,
   'Captured. This is the rollback value for the runtime change.',
   'Not captured, and this is required: it is the only rollback value for the runtime AllowedIPs change. Needs root.'),
  check('persistent-allowed-ips',`Current AllowedIPs in ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}`,`grep -n AllowedIPs ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}`,'the value to restore on rollback',facts.persistentAllowedIps,()=>true,
   'Captured. This is the rollback value for the persistent change.',
   'Not captured, and this is required: it is the rollback value for the on-disk change. Needs root (/etc/wireguard is mode 700).'),
  check('target-route',`Where the host currently sends traffic for ${primary}`,`ip route get ${primary}`,`via ${vps.siteInterface}`,facts.routeToTarget,v=>v.includes(vps.siteInterface),
   facts.routeToTarget?.includes(vps.siteInterface)?'Already routed over the tunnel.':`Currently leaves over the default route. This is why TCP probes are refused rather than sent, and why the explicit route below is needed: "wg set" changes AllowedIPs but adds no Linux route.`,
   'Not captured. Run "ip route get" on the host.'),
  check('admin-port',`UDP ${adminPort} is free for ${adminInterface}`,`ss -lun sport = :${adminPort}`,'no listener',facts.adminPortFree===undefined?undefined:String(facts.adminPortFree),v=>v==='true',
   facts.adminPortFree?'Free.':`Something is already listening on UDP ${adminPort}. Choose another port.`,
   'Not captured.'),
  check('wg-routing',`Whether wg-quick manages routes on ${vps.siteInterface}`,`grep -nE '^[[:space:]]*(Table|PostUp|PostDown|AllowedIPs)[[:space:]]*=' ${confPath}`,'no Table directive and no PostUp route commands',
   facts.wgConfDirectives?(routing==='default'?'default wg-quick routing':routing):undefined,()=>routing==='default',
   routing==='default'
    ?`No Table directive and no PostUp/PostDown route commands, so wg-quick installs a route per AllowedIP at "up". The persistent AllowedIPs edit therefore does recreate the target route.`
    :`Routing is ${routing}. wg-quick will not recreate the target route, so the route is persisted separately below.`,
   'Not captured. Until it is, do not assume the persistent AllowedIPs change recreates the target route: "Table = off" and default routing are indistinguishable from outside the config file.'),
  check('admin-port-reachable',`UDP ${adminPort} reaches the host from the internet`,`# listener on ${adminPort}, datagram sent from outside`,'datagram delivered',
   facts.adminPortReachable===undefined?undefined:String(facts.adminPortReachable),v=>v==='true',
   facts.adminPortReachable
    ?`UDP ${adminPort} already reachable — no change. ${facts.adminPortProbe??''} Host firewall: ${facts.hostFirewall??'unknown'}.`
    :`UDP ${adminPort} did not arrive. The rule below opens it, and nothing else.`,
   'Not captured. Probe end to end rather than reading rules: the provider firewall is not visible on the host.'),
 ];
 // Captured facts describe the host as it was. A plan built on month-old
 // observations is a plan about a server that may no longer exist.
 const age=facts.capturedAt?(Date.now()-Date.parse(facts.capturedAt))/86400000:null;
 if(age!==null&&Number.isFinite(age)&&age>7)warnings.push(`The host facts were captured ${Math.floor(age)} days ago. Recapture them before applying: AllowedIPs, routes and firewall state can all have moved since.`);
 for(const item of preflight){
  if(item.status==='UNVERIFIED'&&['wg-persistence','runtime-allowed-ips','persistent-allowed-ips','wg-routing'].includes(item.id))
   blockers.push(`Preflight "${item.id}" is unverified. ${item.note}`);
 }

 // ── VPS ───────────────────────────────────────────────────────────────────
 const snatRules=targets.map(t=>`iptables -t nat -A POSTROUTING -s ${managementCidr} -d ${t.address}/32 -o ${vps.siteInterface} -j SNAT --to-source ${vps.tunnelAddress}`);
 const forwardRules=targets.flatMap(t=>[
  `iptables -A FORWARD -i ${adminInterface} -o ${vps.siteInterface} -d ${t.address}/32 -j ACCEPT`,
  `iptables -A FORWARD -i ${vps.siteInterface} -o ${adminInterface} -s ${t.address}/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`,
 ]);
 const undo=(rule:string)=>rule.replace(' -A ',' -D ');

 creates.push({
  id:'vps-admin-interface',target:'VPS',kind:'CREATE',
  summary:`Create ${adminInterface} at ${adminAddress} on UDP ${adminPort}`,
  why:`Admin peers need their own subnet. ${vps.siteInterface} is a /30 with no room for a third address.`,
  rest:null,
  command:`wg-quick up ${adminInterface}`,
  persistent:[`# /etc/wireguard/${adminInterface}.conf`,'[Interface]',`Address = ${adminAddress}`,`ListenPort = ${adminPort}`,'PrivateKey = <generated at apply time, never logged>','','# peers are added per administrator in Phase 6','',`systemctl enable --now wg-quick@${adminInterface}`].join('\n'),
  rollback:`systemctl disable --now wg-quick@${adminInterface} && rm -f /etc/wireguard/${adminInterface}.conf`,
  affectsExisting:null,
 });

 // The correction that matters most: AllowedIPs is WireGuard's crypto-routing
 // table, not the kernel's. wg-quick derives routes from it at "up" time; "wg
 // set" on a live interface does not, so without this the packet follows the
 // default route and leaves over the WAN.
 creates.push({
  id:'vps-route-to-target',target:'VPS',kind:'CREATE',
  summary:`Route ${approvedTargets.map(a=>a+'/32').join(', ')} via ${vps.siteInterface}`,
  why:`"wg set ... allowed-ips" changes which peer WireGuard will accept and encrypt for, but adds no Linux route. Observed today: ${facts.routeToTarget??'not captured'} — so the packet would go out the WAN instead of the tunnel.`,
  rest:null,
  command:targets.map(t=>`ip route add ${t.address}/32 dev ${vps.siteInterface}`).join('\n'),
  persistent:routing==='default'
   ?`Confirmed from ${confPath}: no Table directive and no PostUp/PostDown route commands, so wg-quick installs a route for each AllowedIP when it brings the interface up. The AllowedIPs edit below therefore recreates this route after a restart. The explicit "ip route add" is needed only because the interface is already running and must not be restarted.`
   :routing==='unknown'
    ?`UNKNOWN — and therefore not assumed. Capture the Table/PostUp/PostDown directives in ${confPath} first. If wg-quick does not install routes on this interface, the AllowedIPs edit will not recreate this route and the management path disappears at the next restart.`
    :`${confPath} uses ${routing==='off'?'"Table = off"':routing==='custom-table'?'a custom routing table':'its own PostUp/PostDown route commands'}, so wg-quick will NOT recreate this route from AllowedIPs. It is persisted independently, in /etc/wireguard/${adminInterface}.conf:\n`+targets.map(t=>`PostUp = ip route add ${t.address}/32 dev ${vps.siteInterface}`).join('\n')+'\n'+targets.map(t=>`PostDown = ip route del ${t.address}/32 dev ${vps.siteInterface}`).join('\n'),
  rollback:targets.map(t=>`ip route del ${t.address}/32 dev ${vps.siteInterface}`).join('\n'),
  affectsExisting:null,
 });

 creates.push({
  id:'vps-management-snat',target:'VPS',kind:'CREATE',
  summary:`SNAT ${managementCidr} → ${vps.tunnelAddress}, only towards ${approvedTargets.join(', ')}`,
  why:'Makes management traffic reach the router as the portal address its existing peer already permits, so the router needs no peer or route change of its own.',
  rest:null,command:snatRules.join('\n'),
  persistent:`Written as PostUp/PostDown in /etc/wireguard/${adminInterface}.conf so the rules live and die with the interface:\n`+snatRules.map(r=>`PostUp = ${r}`).join('\n')+'\n'+snatRules.map(r=>`PostDown = ${undo(r)}`).join('\n'),
  rollback:snatRules.map(undo).join('\n'),
  affectsExisting:null,
 });

 creates.push({
  id:'vps-forward-accepts',target:'VPS',kind:'CREATE',
  summary:`Forward accepts between ${adminInterface} and ${vps.siteInterface}, scoped to ${approvedTargets.join(', ')}`,
  why:'Permits only the management flow across the two tunnels, in both directions, with the return direction limited to established and related.',
  rest:null,command:forwardRules.join('\n'),
  persistent:`Written as PostUp/PostDown in /etc/wireguard/${adminInterface}.conf:\n`+forwardRules.map(r=>`PostUp = ${r}`).join('\n')+'\n'+forwardRules.map(r=>`PostDown = ${undo(r)}`).join('\n'),
  rollback:forwardRules.map(undo).join('\n'),
  affectsExisting:null,
 });

 // The only edit to something that already exists, and it is on our own host.
 const runtimeBefore=facts.runtimeAllowedIps??'<capture with: wg show '+vps.siteInterface+' allowed-ips>';
 const persistentBefore=facts.persistentAllowedIps??'<capture with: grep AllowedIPs '+(facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`)+'>';
 const nextAllowed=(before:string)=>before.startsWith('<')?`${before} plus ${approvedTargets.map(a=>a+'/32').join(',')}`:[...new Set([...before.split(/[\s,]+/).filter(Boolean),...approvedTargets.map(a=>a+'/32')])].join(',');
 changes.push({
  id:'vps-site-peer-allowed-ips',target:'VPS',kind:'MODIFY',
  summary:`Add ${approvedTargets.map(a=>a+'/32').join(', ')} to the ${vps.siteInterface} peer AllowedIPs`,
  why:'WireGuard uses AllowedIPs both to choose the peer for an outbound packet and to accept an inbound source. Without the target address the reply from the device is discarded by the tunnel itself, before any firewall sees it.',
  rest:null,
  command:`# runtime (takes effect immediately, lost on restart)\n#   before: ${runtimeBefore}\nwg set ${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'} allowed-ips ${nextAllowed(runtimeBefore)}\n#   after:  ${nextAllowed(runtimeBefore)}`,
  persistent:`# ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}, [Peer] section\n#   before: AllowedIPs = ${persistentBefore}\n#   after:  AllowedIPs = ${nextAllowed(persistentBefore)}\n# Edit the file in place. Do NOT run "wg-quick down ${vps.siteInterface}" to apply it.`,
  rollback:`wg set ${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'} allowed-ips ${runtimeBefore}   # runtime\n# then restore AllowedIPs = ${persistentBefore} in ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}`,
  affectsExisting:`${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'} (runtime and on disk)`,
 });
 warnings.push(`Do not restart ${vps.siteInterface} to apply the persistent change. Hotspot RADIUS runs over that tunnel, so bouncing it interrupts voucher logins for customers at the shop. Apply the runtime change with "wg set" and edit the file for the next restart; the two must be done together or the management path silently disappears at the next reboot.`);

 // Only planned when an end-to-end probe failed. A reachable port needs no rule,
 // and adding one anyway would be a change made for the sake of the document.
 if(facts.adminPortReachable===false){
  const ufw=(facts.hostFirewall??'').toLowerCase().includes('ufw enabled=yes');
  creates.push({
   id:'vps-admin-port',target:'VPS',kind:'CREATE',
   summary:`Permit inbound UDP ${adminPort} for ${adminInterface}`,
   why:`The probe to UDP ${adminPort} did not arrive, so something on the path drops it. This opens that one port and nothing else. No existing rule is removed and no firewall is disabled or flushed.`,
   rest:null,
   command:ufw?`ufw allow ${adminPort}/udp comment 'portal-remote-access ${adminInterface}'`:`iptables -I INPUT -p udp --dport ${adminPort} -j ACCEPT`,
   persistent:ufw?'ufw persists its own rules.':`Written as PostUp/PostDown in /etc/wireguard/${adminInterface}.conf so the rule lives and dies with the interface:\nPostUp = iptables -I INPUT -p udp --dport ${adminPort} -j ACCEPT\nPostDown = iptables -D INPUT -p udp --dport ${adminPort} -j ACCEPT`,
   rollback:ufw?`ufw delete allow ${adminPort}/udp`:`iptables -D INPUT -p udp --dport ${adminPort} -j ACCEPT`,
   affectsExisting:null,
  });
  warnings.push(`If the probe failed at the provider firewall rather than on the host, the rule above will not be enough: open UDP ${adminPort} in the Contabo panel as well.`);
 }

 if(facts.ipForward!==undefined&&facts.ipForward.trim()!=='1')changes.push({
  id:'vps-ip-forward',target:'VPS',kind:'MODIFY',
  summary:'Enable net.ipv4.ip_forward',
  why:'The VPS has to forward between the admin tunnel and the site tunnel. It is currently disabled.',
  rest:null,
  command:'sysctl -w net.ipv4.ip_forward=1',
  persistent:"printf 'net.ipv4.ip_forward=1\\n' > /etc/sysctl.d/99-portal-remote-access.conf && sysctl --system",
  rollback:'rm -f /etc/sysctl.d/99-portal-remote-access.conf   # do NOT set it back to 0: Docker needs forwarding and containers would lose networking',
  affectsExisting:'net.ipv4.ip_forward',
 });

 // ── MikroTik ──────────────────────────────────────────────────────────────
 const guest=input.targetInterface;
 const outDrop=forwardDropToInterface(rules,guest);
 const inDrop=targets.length?forwardDropFromInterface(rules,guest,vps.tunnelAddress,lists):null;
 const inputPath:InputPathAnalysis=analyzeInputPath(rules,guest);
 const removeByMarker=(extra:string)=>`/ip firewall filter remove [find comment="${marker}"${extra}]`;

 for(const target of targets){
  if(!outDrop)blockers.push(`Could not locate the forward drop for traffic leaving towards ${guest}. Refusing to guess an insertion point.`);
  else creates.push({
   id:`mikrotik-forward-to-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`forward accept ${vps.tunnelAddress} → ${target.address}, placed before ${outDrop['.id']}`,
   why:`Rule ${outDrop['.id']} ("${outDrop.comment??''}") drops everything leaving towards ${guest}. Management traffic arrives from the tunnel already source-NATed to ${vps.tunnelAddress}.`,
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'forward',action:'accept','in-interface':vps.siteInterface,'src-address':vps.tunnelAddress,'dst-address':target.address,comment:marker,'place-before':outDrop['.id']}},
   command:`/ip firewall filter add chain=forward action=accept in-interface=${vps.siteInterface} src-address=${vps.tunnelAddress} dst-address=${target.address} comment="${marker}" place-before=${outDrop['.id']}`,
   persistent:'RouterOS configuration is persistent as written. No separate step.',
   rollback:removeByMarker(` and chain=forward and dst-address=${target.address}`),
   affectsExisting:null,
  });

  if(!inDrop)warnings.push(`No forward drop was found for replies from ${guest} to ${vps.tunnelAddress}. The reply accept may be unnecessary; it is planned anyway and is harmless if redundant.`);
  creates.push({
   id:`mikrotik-forward-from-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`forward accept ${target.address} → ${vps.tunnelAddress}, established/related only${inDrop?`, placed before ${inDrop['.id']}`:''}`,
   why:inDrop?`Rule ${inDrop['.id']} ("${inDrop.comment??''}") drops traffic from ${guest} to private destinations, and ${vps.tunnelAddress} falls inside its ${inDrop['dst-address-list']} list. Only replies to connections we opened are accepted.`:'Replies to connections opened from the tunnel.',
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'forward',action:'accept','in-interface':guest,'src-address':target.address,'dst-address':vps.tunnelAddress,'connection-state':'established,related',comment:marker,...(inDrop?{'place-before':inDrop['.id']}:{})}},
   command:`/ip firewall filter add chain=forward action=accept in-interface=${guest} src-address=${target.address} dst-address=${vps.tunnelAddress} connection-state=established,related comment="${marker}"${inDrop?` place-before=${inDrop['.id']}`:''}`,
   persistent:'RouterOS configuration is persistent as written. No separate step.',
   rollback:removeByMarker(` and chain=forward and src-address=${target.address}`),
   affectsExisting:null,
  });

  // Only planned when the rule table proves the drop is the cause, per review.
  if(inputPath.blocksReplies&&inputPath.dropRuleId)creates.push({
   id:`mikrotik-input-icmp-${target.address}`,target:'MIKROTIK',kind:'CREATE',
   summary:`input accept ICMP replies from ${target.address} only, placed before ${inputPath.dropRuleId}`,
   why:`${inputPath.explanation} Scoped to ICMP from ${target.address} alone, so the blanket guest drop keeps protecting router management from every other customer.`,
   rest:{method:'PUT',path:'ip/firewall/filter',body:{chain:'input',action:'accept','in-interface':guest,'src-address':target.address,protocol:'icmp','connection-state':'established,related',comment:marker,'place-before':inputPath.dropRuleId}},
   command:`/ip firewall filter add chain=input action=accept in-interface=${guest} src-address=${target.address} protocol=icmp connection-state=established,related comment="${marker}" place-before=${inputPath.dropRuleId}`,
   persistent:'RouterOS configuration is persistent as written. No separate step.',
   rollback:removeByMarker(' and chain=input'),
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
  `Every MikroTik object carries comment "${marker}". Rollback matches that whole marker, including the provision id, so it cannot reach an object created by a different provisioning run at this site.`,
  'The router needs no WireGuard peer change, no route and no change to the customer path.',
  `Only ${approvedTargets.join(', ')} becomes reachable. No other address on ${guest} is opened.`,
  'Customer traffic never enters the VPS: the SNAT matches only the admin subnet towards an approved target, and the customer internet path stays customer → EAP → MikroTik → ISP.',
  facts.adminPortReachable===true?`UDP ${adminPort} already reachable — no change.`
   :facts.adminPortReachable===false?`UDP ${adminPort} is not reachable: one reversible accept rule is planned, and no existing firewall rule is removed, disabled or flushed.`
   :`UDP ${adminPort} reachability is unverified.`,
  routing==='default'?`The persistent AllowedIPs edit does recreate the target route: ${confPath} has no Table directive and no PostUp/PostDown route commands, so wg-quick installs a route per AllowedIP.`
   :routing==='unknown'?'Route persistence is UNVERIFIED and has not been assumed.'
   :`wg-quick does not manage routes here (${routing}), so the target route carries its own persistence.`,
 ];
 if(customerTouching.length)blockers.push(`Plan names a customer-facing path: ${customerTouching.join(', ')}.`);

 const plan:Omit<Plan,'digest'>={
  version:2,architecture:'VPS_SNAT',generatedAt:new Date().toISOString(),siteId,provisionId,marker,
  managementCidr,adminInterface,siteInterface:vps.siteInterface,serverTunnelAddress:vps.tunnelAddress,approvedTargets,
  preflight,creates,changes,deletes:[],existingObjectsAffected:existing,
  beforeState:{
   capturedAt:facts.capturedAt??null,
   router:{os:snap.version,identity:snap.identity,uptime:snap.uptime,
    addresses:snap.addresses.map(a=>`${a.address} on ${a.interface}`),
    defaultRoute:snap.routes.find(r=>r['dst-address']==='0.0.0.0/0')?.gateway??null,
    hotspot:snap.hotspots.map(h=>`${h.name} on ${h.interface} disabled=${h.disabled} invalid=${h.invalid}`),
    wireguardPeers:snap.wireguardPeers.map(p=>`${p.interface} allowed=${p['allowed-address']} handshake=${p['last-handshake']??'never'}`),
    firewallRuleCount:rules.length,
    firewallOrder:rules.map((r,index)=>`${index} ${r['.id']} ${r.chain} ${r.action} ${r.comment??''}`)},
   vps:{
    ipForward:facts.ipForward??'<unverified>',
    persistenceManager:facts.wgManager??'<unverified>',
    persistenceUnit:facts.wgUnit??null,
    configPath:facts.wgConfigPath??null,
    runtimeAllowedIps:facts.runtimeAllowedIps??'<unverified>',
    persistentAllowedIps:facts.persistentAllowedIps??'<unverified>',
    routeToTarget:facts.routeToTarget??'<unverified>',
    routingMode:routing,
    confDirectives:facts.wgConfDirectives??['<unverified>'],
    hostFirewall:facts.hostFirewall??'<unverified>',
    adminPortReachable:facts.adminPortReachable??'<unverified>'},
  },
  expectedAfterState:{
   router:{firewallRuleCount:rules.length+creates.filter(a=>a.target==='MIKROTIK').length,
    newRules:creates.filter(a=>a.target==='MIKROTIK').map(a=>a.summary),
    unchanged:['default route','WAN address','hotspot server and profile','DHCP servers and networks','all NAT rules','bridges and ports','the existing WireGuard peer on the router']},
   vps:{
    runtimeAllowedIps:nextAllowed(runtimeBefore),
    persistentAllowedIps:nextAllowed(persistentBefore),
    routes:[`${approvedTargets.map(a=>a+'/32').join(', ')} dev ${vps.siteInterface}`,`${managementCidr} dev ${adminInterface}`],
    ipForward:'1',
    unchanged:['the default route','eth0 addressing','every Docker network and published port','the RADIUS binding on the tunnel address']},
  },
  healthChecks:[
   {id:'router-reachable',description:'The router still answers the portal connection',how:'GET /rest/system/resource through the existing read-only account'},
   {id:'hotspot-running',description:'The customer hotspot is still enabled and valid',how:'GET /rest/ip/hotspot — babu-hotspot disabled=false invalid=false'},
   {id:'radius-path',description:'Voucher logins still work over the tunnel',how:`Confirm the RADIUS listener is still bound on ${vps.tunnelAddress}:1812/1813 and log in one test voucher`},
   {id:'default-route',description:'The default route is unchanged',how:'GET /rest/ip/route — compare 0.0.0.0/0 gateway against beforeState'},
   {id:'wan',description:'WAN connectivity is unchanged',how:'GET /rest/ip/address — ether1 address unchanged; router pings its upstream gateway'},
   {id:'wg-running',description:'The site WireGuard interface is running',how:'GET /rest/interface/wireguard'},
   {id:'wg-handshake',description:'The site peer handshake is recent',how:'GET /rest/interface/wireguard/peers — last-handshake under two minutes'},
   {id:'vps-route',description:'The host now routes the target over the tunnel',how:`ip route get ${primary} — expect "dev ${vps.siteInterface}"`},
   {id:'router-to-target',description:'The router reaches the target, now that replies are permitted',how:`POST /rest/tool/ping address=${primary}`},
   {id:'tunnel-to-target',description:'The target answers through the management tunnel',how:`Set MANAGEMENT_ROUTE_READY=true, then TCP connect to ${primary}:80 and :443 from the VPS`},
   {id:'no-customer-leak',description:'Customer traffic still never enters the VPS',how:`iptables -t nat -L POSTROUTING -v -n — the SNAT counter moves only when an admin is connected, and only for ${primary}`},
  ],
  rollback:[
   `# MikroTik — removes only this provisioning run's objects`,
   removeByMarker(''),
   '',
   `# VPS`,
   `systemctl disable --now wg-quick@${adminInterface}        # drops the SNAT and forward rules with the interface`,
   ...targets.map(t=>`ip route del ${t.address}/32 dev ${vps.siteInterface}`),
   `wg set ${vps.siteInterface} peer ${vps.peerPublicKey??'<router public key>'} allowed-ips ${runtimeBefore}`,
   `# restore AllowedIPs = ${persistentBefore} in ${facts.wgConfigPath??`/etc/wireguard/${vps.siteInterface}.conf`}`,
   `rm -f /etc/wireguard/${adminInterface}.conf`,
   '',
   `# ${vps.siteInterface} is never brought down by rollback: RADIUS and the portal's router connection both run over it.`,
  ],
  guarantees,warnings,blockers,
 };
 return {...plan,digest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
