import {it,expect} from 'vitest';
import {parseCidr,overlaps,contains,containsAny,selectManagementCidr,normalizeMac,formatCidr} from '../packages/network/src/cidr.ts';
import {devicesFrom,findDeviceByMac,lanCidrs,assertManageable,snapshot as readSnapshot} from '../packages/network/src/discovery.ts';
import {analyzeInputPath,parseRtt,testDeviceReachability,tcpProbe} from '../packages/network/src/diagnostics.ts';
import {buildPlan} from '../packages/network/src/wireguard-plan.ts';
import {snapshot,firewallFilter} from './network-fixture.ts';

const EAP='D4:D6:DF:A5:F6:6C';

it('treats addresses as unsigned, so blocks above 127.x compare correctly',()=>{
 expect(formatCidr(parseCidr('192.168.88.1/24'))).toBe('192.168.88.1/24');
 expect(overlaps(parseCidr('192.168.88.0/24'),parseCidr('192.168.0.0/16'))).toBe(true);
 expect(overlaps(parseCidr('10.77.0.0/30'),parseCidr('10.77.1.0/24'))).toBe(false);
 expect(contains(parseCidr('10.0.0.0/8'),'10.77.0.1')).toBe(true);
 expect(containsAny(['10.78.0.1/24','192.168.88.1/24'],'10.78.0.20')).toBe(true);
 expect(containsAny(['10.78.0.1/24'],'8.8.8.8')).toBe(false);
 for(const bad of ['256.1.1.1','1.2.3','::1','10.0.0.1/33'])expect(()=>parseCidr(bad)).toThrow();
});

it('chooses a management subnet that collides with nothing the router carries',()=>{
 const taken=[...snapshot.addresses.map(a=>a.address),...snapshot.routes.filter(r=>r['dst-address']!=='0.0.0.0/0').map(r=>r['dst-address'])];
 const chosen=selectManagementCidr(taken);
 expect(taken.some(cidr=>overlaps(parseCidr(chosen),parseCidr(cidr)))).toBe(false);
 // It must not fall back to a hard-coded block when that block is in use.
 expect(selectManagementCidr(['10.77.1.0/24','10.77.2.0/24'])).toBe('10.88.1.0/24');
 expect(()=>selectManagementCidr(['0.0.0.0/0'])).toThrow('No management subnet');
});

it('normalizes every shape a vendor writes a MAC in',()=>{
 for(const value of ['d4-d6-df-a5-f6-6c','D4D6DFA5F66C','d4:d6:df:a5:f6:6c'])expect(normalizeMac(value)).toBe(EAP);
 expect(()=>normalizeMac('D4:D6:DF')).toThrow();
});

it('merges leases with ARP and finds the access point by MAC',()=>{
 const devices=devicesFrom(snapshot);
 const eap=findDeviceByMac(devices,'d4-d6-df-a5-f6-6c');
 expect(eap).toMatchObject({ipAddress:'10.78.0.20',macAddress:EAP,model:'EAP225-Outdoor',vendor:'TP-Link',type:'ACCESS_POINT',source:'BOTH',arpComplete:true,interface:'babu-guest'});
 // ARP-only devices still appear; a device in neither table does not.
 expect(devices.find(d=>d.macAddress==='36:F6:35:8A:34:26')?.source).toBe('ARP');
 expect(findDeviceByMac(devices,'00:00:00:00:00:01')).toBeNull();
 expect(lanCidrs(snapshot)).toContain('10.78.0.1/24');
});

it('refuses an address outside the networks the site serves',()=>{
 expect(assertManageable('10.78.0.20',lanCidrs(snapshot))).toBe('10.78.0.20');
 for(const bad of ['8.8.8.8','169.254.1.1',null])expect(()=>assertManageable(bad,lanCidrs(snapshot))).toThrow();
});

it('never carries a router secret past the read boundary',async()=>{
 const leaky=await readSnapshot({read:async(path:string)=>path==='interface/wireguard'
  ?[{name:'wg-babu','private-key':'SECRETKEYMATERIAL','listen-port':'51820'}]
  :path==='system/resource'?{version:'7.18.2'}:[]} as any);
 expect(JSON.stringify(leaky)).not.toContain('SECRETKEYMATERIAL');
 expect(leaky.wireguard[0]).toMatchObject({name:'wg-babu','listen-port':'51820'});
});

it('proves the reply path is blocked, from the rule order alone',()=>{
 const blocked=analyzeInputPath(firewallFilter,'babu-guest');
 expect(blocked.blocksReplies).toBe(true);
 expect(blocked.dropRuleId).toBe('*10');
 expect(blocked.acceptRuleId).toBe('*1');
 expect(blocked.explanation).toContain('sits above');
 // Move the established accept above the drop and the same table is fine.
 const reordered=[...firewallFilter];
 reordered.splice(reordered.findIndex(r=>r['.id']==='*10'),0,reordered.splice(reordered.findIndex(r=>r['.id']==='*1'),1)[0]);
 expect(analyzeInputPath(reordered,'babu-guest').blocksReplies).toBe(false);
 // An interface with no blanket drop is not blocked.
 expect(analyzeInputPath(firewallFilter,'bridge').blocksReplies).toBe(false);
});

it('reads RouterOS durations',()=>{
 expect(parseRtt('153ms371us')).toBeCloseTo(153.371,3);
 expect(parseRtt('1s200ms')).toBe(1200);
 expect(parseRtt(undefined)).toBeNull();
});

it('does not send a TCP probe while there is no management route',async()=>{
 expect(await tcpProbe('10.78.0.20',443,50,false)).toMatchObject({state:'NO_ROUTE'});
});

it('refuses to call a failed ping proof that the device is down',async()=>{
 const devices=devicesFrom(snapshot);
 const eap=findDeviceByMac(devices,EAP)!;
 const result=await testDeviceReachability({
  connection:{ping:async()=>[{host:'10.78.0.20',status:'timeout','packet-loss':'100'},{host:'10.78.0.20',status:'timeout','packet-loss':'100'}]},
  device:eap,snapshot,lanCidrs:lanCidrs(snapshot),
 });
 expect(result.verdict).toBe('ICMP_BLOCKED_BY_ROUTER_FIREWALL');
 expect(result.reasons.join(' ')).toContain('has not been judged');
 expect(result.ports.every(p=>p.state==='NO_ROUTE')).toBe(true);
});

it('separates a silent device from a blocked path once the path is clear',async()=>{
 const devices=devicesFrom(snapshot);
 const eap=findDeviceByMac(devices,EAP)!;
 const clear={...snapshot,firewallFilter:firewallFilter.filter(r=>r['.id']!=='*10')};
 const silent=await testDeviceReachability({connection:{ping:async()=>[{status:'timeout'}]},device:eap,snapshot:clear,lanCidrs:lanCidrs(snapshot)});
 expect(silent.verdict).toBe('NO_ICMP_REPLY_DEVICE_UP');

 const answering=await testDeviceReachability({connection:{ping:async()=>[{host:'10.78.0.20','avg-rtt':'2ms100us'}]},device:eap,snapshot:clear,lanCidrs:lanCidrs(snapshot)});
 expect(answering.verdict).toBe('REACHABLE');
 expect(answering.icmp.averageRttMs).toBeCloseTo(2.1,2);

 // Nothing in either table, and no lease: that is the only case worth calling offline.
 const ghost={...eap,macAddress:'02:00:00:00:00:99',dhcpStatus:null,arpComplete:false};
 const offline=await testDeviceReachability({connection:{ping:async()=>[{status:'timeout'}]},device:ghost,snapshot:clear,lanCidrs:lanCidrs(snapshot)});
 expect(offline.verdict).toBe('OFFLINE');
});

// The VPS facts as captured on the host on 2026-09-23. They cannot be read from
// inside a container: it has its own network namespace.
const vpsFacts={
 capturedAt:'2026-09-23T10:05:00.000Z',ipForward:'1',
 wgManager:'wg-quick' as const,wgUnit:'wg-quick@wg-babu.service',wgUnitEnabled:true,wgUnitActive:true,
 wgConfigPath:'/etc/wireguard/wg-babu.conf',
 runtimeAllowedIps:'10.77.0.2/32',persistentAllowedIps:'10.77.0.2/32',
 routeToTarget:'10.78.0.20 via 194.163.128.1 dev eth0 src 194.163.139.108',adminPortFree:true,
};
const PROVISION='11111111-2222-4333-8444-555555555555';
const plan=(preflight:any=vpsFacts,provisionId=PROVISION)=>buildPlan({
 siteId:'00000000-0000-4000-8000-000000000001',snapshot,provisionId,
 managementTargets:[{address:'10.78.0.20',label:'EAP225-Outdoor'}],targetInterface:'babu-guest',
 vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1',peerPublicKey:'PUBKEY',preflight},
});

it('plans only additive router changes, positioned against the real drop rules',()=>{
 const result=plan();
 expect(result.blockers).toEqual([]);
 const router=result.creates.filter(a=>a.target==='MIKROTIK');
 expect(router).toHaveLength(3);
 expect(router.every(a=>a.kind==='CREATE'&&a.affectsExisting===null)).toBe(true);
 expect(result.changes.filter(a=>a.target==='MIKROTIK')).toHaveLength(0);
 expect(result.deletes).toEqual([]);
 expect(router.map(a=>a.rest!.body!['place-before'])).toEqual(['*12','*20','*10']);
});

it('leaves the router WireGuard peer, routes and customer path alone',()=>{
 const result=plan();
 const routerPaths=result.creates.concat(result.changes).filter(a=>a.target==='MIKROTIK').map(a=>a.rest!.path);
 expect(routerPaths.every(path=>path==='ip/firewall/filter')).toBe(true);
 for(const forbidden of ['interface/wireguard','ip/route','ip/dhcp-server','ip/hotspot','ip/firewall/nat','interface/bridge'])
  expect(routerPaths.some(path=>path.startsWith(forbidden))).toBe(false);
 expect(result.guarantees[0]).toContain('No existing Hotspot, NAT, DHCP, bridge, VLAN or queue');
 expect(result.guarantees.join(' ')).toContain('Customer traffic never enters the VPS');
 expect(result.changes.map(a=>a.target)).toEqual(['VPS']);
});

it('adds an explicit Linux route, because wg set does not create one',()=>{
 const result=plan();
 const route=result.creates.find(a=>a.id==='vps-route-to-target')!;
 expect(route.command).toBe('ip route add 10.78.0.20/32 dev wg-babu');
 expect(route.rollback).toBe('ip route del 10.78.0.20/32 dev wg-babu');
 expect(route.why).toContain('adds no Linux route');
 // The captured route proves the need rather than asserting it.
 expect(route.why).toContain('dev eth0');
 expect(result.preflight.find(c=>c.id==='target-route')).toMatchObject({status:'ACTION_REQUIRED'});
});

it('leaves ip_forward alone when it is already on, and persists it when it is not',()=>{
 const on=plan();
 expect(on.preflight.find(c=>c.id==='ip-forward')).toMatchObject({status:'PASS',observed:'1'});
 expect(on.changes.some(a=>a.id==='vps-ip-forward')).toBe(false);

 const off=plan({...vpsFacts,ipForward:'0'});
 const action=off.changes.find(a=>a.id==='vps-ip-forward')!;
 expect(off.preflight.find(c=>c.id==='ip-forward')!.status).toBe('ACTION_REQUIRED');
 expect(action.command).toBe('sysctl -w net.ipv4.ip_forward=1');
 expect(action.persistent).toContain('/etc/sysctl.d/99-portal-remote-access.conf');
 // Reverting to 0 would break every container on the host.
 expect(action.rollback).toContain('do NOT set it back to 0');
});

it('refuses to plan an AllowedIPs change it cannot roll back',()=>{
 const blind=plan({...vpsFacts,runtimeAllowedIps:undefined,persistentAllowedIps:undefined});
 expect(blind.blockers.join(' ')).toContain('runtime-allowed-ips');
 expect(blind.blockers.join(' ')).toContain('persistent-allowed-ips');
 expect(blind.preflight.filter(c=>c.status==='UNVERIFIED').map(c=>c.id)).toEqual(['runtime-allowed-ips','persistent-allowed-ips']);

 const unknownManager=plan({...vpsFacts,wgManager:undefined});
 expect(unknownManager.blockers.join(' ')).toContain('wg-persistence');
});

it('shows runtime and persistent state separately for the peer change',()=>{
 const change=plan().changes.find(a=>a.id==='vps-site-peer-allowed-ips')!;
 expect(change.command).toContain('before: 10.77.0.2/32');
 expect(change.command).toContain('wg set wg-babu peer PUBKEY allowed-ips 10.77.0.2/32,10.78.0.20/32');
 expect(change.persistent).toContain('/etc/wireguard/wg-babu.conf');
 expect(change.persistent).toContain('before: AllowedIPs = 10.77.0.2/32');
 expect(change.persistent).toContain('after:  AllowedIPs = 10.77.0.2/32,10.78.0.20/32');
 expect(change.rollback).toContain('allowed-ips 10.77.0.2/32');
 expect(change.affectsExisting).toContain('runtime and on disk');
 // Bouncing the tunnel would cut RADIUS, and customers log in through it.
 expect(plan().warnings.join(' ')).toContain('interrupts voucher logins');
 expect(change.persistent).toContain('Do NOT run "wg-quick down wg-babu"');
});

it('gives every provisioning run its own marker, so rollback cannot cross runs',()=>{
 const first=plan(),second=plan(vpsFacts,'99999999-8888-4777-8666-555555555555');
 expect(first.marker).toBe(`managed-by=portal-remote-access site=00000000-0000-4000-8000-000000000001 provision=${PROVISION}`);
 expect(first.marker).not.toBe(second.marker);
 for(const action of first.creates.filter(a=>a.target==='MIKROTIK')){
  expect(action.rest!.body!.comment).toBe(first.marker);
  expect(action.rollback).toContain(`provision=${PROVISION}`);
 }
 // Rollback matches the whole marker, not a prefix, so it cannot reach the other run.
 expect(first.rollback.join('\n')).toContain(`[find comment="${first.marker}"]`);
 expect(first.rollback.join('\n')).not.toContain(second.provisionId);
 // Two runs at the same site are distinguishable.
 expect(buildPlan({siteId:'s',snapshot,managementTargets:[{address:'10.78.0.20',label:'e'}],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1',preflight:vpsFacts}}).provisionId)
  .not.toBe(buildPlan({siteId:'s',snapshot,managementTargets:[{address:'10.78.0.20',label:'e'}],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1',preflight:vpsFacts}}).provisionId);
});

it('source-NATs only admin traffic to approved targets',()=>{
 const result=plan();
 const snat=result.creates.find(a=>a.id==='vps-management-snat')!;
 expect(snat.command).toBe('iptables -t nat -A POSTROUTING -s 10.77.1.0/24 -d 10.78.0.20/32 -o wg-babu -j SNAT --to-source 10.77.0.1');
 expect(snat.rollback).toContain(' -D POSTROUTING');
 expect(snat.persistent).toContain('PostUp');
 expect(snat.persistent).toContain('PostDown');
 expect(result.managementCidr).toBe('10.77.1.0/24');
 const forwards=result.creates.find(a=>a.id==='vps-forward-accepts')!;
 expect(forwards.command.split('\n').every(line=>line.includes('10.78.0.20/32'))).toBe(true);
 expect(forwards.command).toContain('--ctstate ESTABLISHED,RELATED');
});

it('covers every part of the intended shape',()=>{
 const result=plan();
 expect(result.creates.filter(a=>a.target==='VPS').map(a=>a.id)).toEqual(['vps-admin-interface','vps-route-to-target','vps-management-snat','vps-forward-accepts']);
 expect(result.changes.map(a=>a.id)).toEqual(['vps-site-peer-allowed-ips']);
 expect(result.creates.filter(a=>a.target==='MIKROTIK').map(a=>a.id)).toEqual(['mikrotik-forward-to-10.78.0.20','mikrotik-forward-from-10.78.0.20','mikrotik-input-icmp-10.78.0.20']);
});

it('records what to compare against and how to undo every part',()=>{
 const result=plan();
 expect((result.beforeState.router as any).firewallRuleCount).toBe(firewallFilter.length);
 expect((result.expectedAfterState.router as any).firewallRuleCount).toBe(firewallFilter.length+3);
 expect((result.beforeState.router as any).defaultRoute).toBe('192.168.100.1');
 expect((result.beforeState.vps as any).runtimeAllowedIps).toBe('10.77.0.2/32');
 expect((result.expectedAfterState.vps as any).runtimeAllowedIps).toBe('10.77.0.2/32,10.78.0.20/32');
 expect(result.healthChecks.map(c=>c.id)).toContain('radius-path');
 expect(result.healthChecks.map(c=>c.id)).toContain('no-customer-leak');
 expect(result.existingObjectsAffected.map(o=>o.id).sort()).toEqual(['*10','*12','*20']);
 expect(result.existingObjectsAffected.every(o=>o.effect.startsWith('Not edited'))).toBe(true);
 // Rollback never takes down the tunnel the change was made through.
 expect(result.rollback.join(' ')).toContain('never brought down by rollback');
 expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
});

it('omits the input rule when the rule table does not blame the drop',()=>{
 const clear={...snapshot,firewallFilter:firewallFilter.filter(r=>r['.id']!=='*10')};
 const result=buildPlan({siteId:'s',snapshot:clear,managementTargets:[{address:'10.78.0.20',label:'eap'}],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1',preflight:vpsFacts}});
 expect(result.creates.filter(a=>a.target==='MIKROTIK')).toHaveLength(2);
 expect(result.creates.some(a=>a.id.startsWith('mikrotik-input-icmp'))).toBe(false);
});

it('refuses to guess when there is no approved target',()=>{
 const result=buildPlan({siteId:'s',snapshot,managementTargets:[],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1',preflight:vpsFacts}});
 expect(result.blockers.join(' ')).toContain('No approved management target');
 expect(result.creates.filter(a=>a.target==='MIKROTIK')).toHaveLength(0);
});
