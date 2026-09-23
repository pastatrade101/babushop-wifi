// A faithful reduction of this site's real router, captured read-only on
// 2026-09-23. Rule ids and order are the live ones, so a test that passes here
// is a statement about the router the portal actually manages.
import type {Snapshot,Row} from '../packages/network/src/discovery.ts';

export const firewallFilter:Row[]=[
 {'.id':'*24',chain:'forward',action:'passthrough',comment:'special dummy rule to show fasttrack counters'},
 {'.id':'*27',chain:'input',action:'jump',hotspot:'from-client','jump-target':'hs-input'},
 {'.id':'*28',chain:'input',action:'drop','dst-port':'64872-64875',hotspot:'!from-client',protocol:'tcp'},
 {'.id':'*E',chain:'input',action:'accept','dst-port':'53,67','in-interface':'babu-guest',protocol:'udp',comment:'BABU guest DNS and DHCP'},
 {'.id':'*F',chain:'input',action:'accept','dst-port':'53','in-interface':'babu-guest',protocol:'tcp',comment:'BABU guest DNS TCP'},
 {'.id':'*10',chain:'input',action:'drop','in-interface':'babu-guest',comment:'BABU block guest router management'},
 {'.id':'*1',chain:'input',action:'accept','connection-state':'established,related,untracked',comment:'defconf: accept established,related,untracked'},
 {'.id':'*3',chain:'input',action:'accept',protocol:'icmp',comment:'defconf: accept ICMP'},
 {'.id':'*D',chain:'input',action:'accept','dst-address':'10.77.0.2','dst-port':'443','in-interface':'wg-babu',protocol:'tcp','src-address':'10.77.0.1',comment:'BABU HTTPS from VPS only'},
 {'.id':'*5',chain:'input',action:'drop','in-interface-list':'!LAN',comment:'defconf: drop all not coming from LAN'},
 {'.id':'*20',chain:'forward',action:'drop','dst-address-list':'babu-private','in-interface':'babu-guest',comment:'BABU block customer access to private networks'},
 {'.id':'*21',chain:'forward',action:'accept','connection-state':'established,related,new',hotspot:'auth','in-interface':'babu-guest','out-interface-list':'WAN','src-address':'10.78.0.0/24',comment:'BABU authenticated customer internet'},
 {'.id':'*11',chain:'forward',action:'drop','in-interface':'babu-guest',comment:'BABU commissioning block outbound'},
 {'.id':'*22',chain:'forward',action:'accept','connection-state':'established,related','dst-address':'10.78.0.0/24','in-interface-list':'WAN','out-interface':'babu-guest',comment:'BABU customer internet replies'},
 {'.id':'*12',chain:'forward',action:'drop','out-interface':'babu-guest',comment:'BABU commissioning block inbound'},
 {'.id':'*9',chain:'forward',action:'accept','connection-state':'established,related,untracked',comment:'defconf: accept established,related, untracked'},
];

export const snapshot:Snapshot={
 identity:'MikroTik',version:'7.18.2 (stable)',boardName:'L009UiGS-2HaxD',uptime:'1d14h19m30s',
 deviceMode:{mode:'home',fetch:'false',container:'false',scheduler:'false',hotspot:'true'},
 interfaces:[{name:'ether1',type:'ether',running:'true'},{name:'babu-guest',type:'bridge',running:'true'},{name:'bridge',type:'bridge',running:'true'},{name:'wg-babu',type:'wg',running:'true'}],
 addresses:[
  {address:'192.168.88.1/24',interface:'bridge',disabled:'false'},
  {address:'10.77.0.2/30',interface:'wg-babu',disabled:'false'},
  {address:'10.78.0.1/24',interface:'babu-guest',disabled:'false'},
  {address:'192.168.100.8/24',interface:'ether1',disabled:'false'},
 ],
 routes:[
  {'dst-address':'0.0.0.0/0',gateway:'192.168.100.1',active:'true'},
  {'dst-address':'10.78.0.0/24',gateway:'babu-guest',active:'true'},
  {'dst-address':'192.168.88.0/24',gateway:'bridge',active:'true'},
  {'dst-address':'192.168.100.0/24',gateway:'ether1',active:'true'},
  {'dst-address':'10.77.0.0/30',gateway:'wg-babu',active:'true'},
 ],
 leases:[
  {address:'10.78.0.20','mac-address':'D4:D6:DF:A5:F6:6C','host-name':'EAP225-Outdoor-D4-D6-DF-A5-F6-6C',status:'bound',server:'babu-guest-dhcp',dynamic:'false'},
  {address:'10.78.0.45','mac-address':'46:4C:BA:96:F0:8E',status:'bound',server:'babu-guest-dhcp',dynamic:'true'},
 ],
 arp:[
  {address:'10.78.0.20','mac-address':'D4:D6:DF:A5:F6:6C',interface:'babu-guest',complete:'true'},
  {address:'10.78.0.41','mac-address':'36:F6:35:8A:34:26',interface:'babu-guest',complete:'true'},
  {address:'10.78.0.21','mac-address':'FC:31:5D:CD:95:93',interface:'babu-guest',complete:'false'},
 ],
 bridges:[{name:'babu-guest','vlan-filtering':'false'}],
 bridgePorts:[{interface:'ether2',bridge:'babu-guest'}],
 vlans:[],
 listMembers:[{list:'LAN',interface:'bridge'},{list:'WAN',interface:'ether1'}],
 firewallFilter,
 firewallNat:[{'.id':'*1',chain:'srcnat',action:'masquerade',comment:'defconf: masquerade'}],
 addressLists:[
  {list:'babu-private',address:'10.0.0.0/8',dynamic:'false'},
  {list:'babu-private',address:'172.16.0.0/12',dynamic:'false'},
  {list:'babu-private',address:'192.168.0.0/16',dynamic:'false'},
 ],
 hotspots:[{name:'babu-hotspot',interface:'babu-guest',profile:'babu-hotspot-profile',disabled:'false',invalid:'false'}],
 hotspotActive:[],
 wireguard:[{name:'wg-babu','listen-port':'51820',running:'true'}],
 wireguardPeers:[{interface:'wg-babu','allowed-address':'10.77.0.1/32','endpoint-address':'194.163.139.108','endpoint-port':'51820','persistent-keepalive':'25s','last-handshake':'1m19s',rx:'120048',tx:'434788',comment:'BABU VPS'}],
 services:[{name:'www-ssl',port:'443',disabled:'false',address:'10.77.0.1/32',certificate:'babu-https'}],
 readAt:'2026-09-23T09:00:00.000Z',
};
