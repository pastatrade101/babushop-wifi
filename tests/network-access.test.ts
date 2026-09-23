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

const plan=()=>buildPlan({
 siteId:'00000000-0000-4000-8000-000000000001',snapshot,
 managementTargets:[{address:'10.78.0.20',label:'EAP225-Outdoor'}],targetInterface:'babu-guest',
 vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1'},
});

it('plans only additive router changes, positioned against the real drop rules',()=>{
 const result=plan();
 expect(result.blockers).toEqual([]);
 const router=result.creates.filter(a=>a.target==='MIKROTIK');
 expect(router).toHaveLength(3);
 expect(router.every(a=>a.kind==='CREATE'&&a.affectsExisting===null)).toBe(true);
 expect(result.creates.concat(result.changes).filter(a=>a.target==='MIKROTIK'&&a.kind!=='CREATE')).toHaveLength(0);
 expect(result.deletes).toEqual([]);
 const positions=router.map(a=>a.rest!.body!['place-before']);
 expect(positions).toEqual(['*12','*20','*10']);
 expect(router.every(a=>a.rest!.body!.comment==='managed-by=portal-remote-access site=00000000-0000-4000-8000-000000000001')).toBe(true);
});

it('leaves the router WireGuard peer, routes and customer path alone',()=>{
 const result=plan();
 const routerPaths=result.creates.concat(result.changes).filter(a=>a.target==='MIKROTIK').map(a=>a.rest!.path);
 expect(routerPaths.every(path=>path==='ip/firewall/filter')).toBe(true);
 for(const forbidden of ['interface/wireguard','ip/route','ip/dhcp-server','ip/hotspot','ip/firewall/nat','interface/bridge'])
  expect(routerPaths.some(path=>path.startsWith(forbidden))).toBe(false);
 expect(result.guarantees[0]).toContain('No existing Hotspot, NAT, DHCP, bridge, VLAN or queue');
 // The only edit in the plan is on our own host, and it is disclosed as one.
 expect(result.changes.map(a=>a.target)).toEqual(['VPS']);
 expect(result.changes[0].affectsExisting).toContain('wg-babu peer');
});

it('source-NATs only admin traffic to approved targets',()=>{
 const result=plan();
 const admin=result.creates.find(a=>a.id==='vps-admin-interface')!;
 expect(admin.command).toContain('-s 10.77.1.0/24 -d 10.78.0.20/32 -o wg-babu -j SNAT --to-source 10.77.0.1');
 // Every SNAT line is bounded by source, destination and outbound interface, so
 // portal and customer traffic cannot match it.
 const snat=admin.command.split('\n').filter(line=>line.includes('SNAT'));
 expect(snat.length).toBeGreaterThan(0);
 expect(snat.every(line=>line.includes('-s 10.77.1.0/24')&&line.includes('-d 10.78.0.20/32'))).toBe(true);
 expect(admin.command).toContain('PostDown');
 expect(result.managementCidr).toBe('10.77.1.0/24');
});

it('records what to compare against and how to undo every part',()=>{
 const result=plan();
 expect(result.beforeState.firewallRuleCount).toBe(firewallFilter.length);
 expect(result.expectedAfterState.firewallRuleCount).toBe(firewallFilter.length+3);
 expect(result.beforeState.defaultRoute).toBe('192.168.100.1');
 expect(result.rollback.join('\n')).toContain('comment="managed-by=portal-remote-access');
 expect(result.healthChecks.map(c=>c.id)).toContain('hotspot-running');
 expect(result.existingObjectsAffected.map(o=>o.id).sort()).toEqual(['*10','*12','*20']);
 expect(result.existingObjectsAffected.every(o=>o.effect.startsWith('Not edited'))).toBe(true);
 // The digest covers the plan body, so an altered plan cannot pass as approved.
 expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
});

it('omits the input rule when the rule table does not blame the drop',()=>{
 const clear={...snapshot,firewallFilter:firewallFilter.filter(r=>r['.id']!=='*10')};
 const result=buildPlan({siteId:'s',snapshot:clear,managementTargets:[{address:'10.78.0.20',label:'eap'}],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1'}});
 expect(result.creates.filter(a=>a.target==='MIKROTIK')).toHaveLength(2);
 expect(result.creates.some(a=>a.id.startsWith('mikrotik-input-icmp'))).toBe(false);
});

it('refuses to guess when there is no approved target',()=>{
 const result=buildPlan({siteId:'s',snapshot,managementTargets:[],targetInterface:'babu-guest',vps:{siteInterface:'wg-babu',tunnelAddress:'10.77.0.1'}});
 expect(result.blockers.join(' ')).toContain('No approved management target');
 expect(result.creates.filter(a=>a.target==='MIKROTIK')).toHaveLength(0);
});
