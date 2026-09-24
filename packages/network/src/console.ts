import {type MikroTikConnection,type ReadPath} from './index.ts';

// The router console: WinBox's menus, in the portal, read-only.
//
// A menu is an id the browser may name and a ReadPath it may not. The id is
// looked up here, so the browser can only ever choose from this list -- there
// is no way to send the router a path, a command or a value through it.
//
// Two things are removed before a row leaves this module:
//  - secrets: any password, key or shared secret the account can see, plus the
//    bodies of scripts, which is where RouterOS configs tend to hide credentials;
//  - voucher codes: a hotspot login name IS the customer's voucher, so it is
//    shown the way the Vouchers page shows it, with only the last four visible.

export type Row=Record<string,string>;
export type Menu={id:string;label:string;group:string;path:ReadPath;columns:string[];single?:boolean;live?:boolean};

const m=(group:string,id:string,label:string,path:ReadPath,columns:string[],extra:Partial<Menu>={}):Menu=>({group,id,label,path,columns,...extra});

// WinBox's order and names, so the page is where an operator expects it to be.
export const MENUS:Menu[]=[
 m('Interfaces','interfaces','Interface list','interface',['name','type','actual-mtu','mac-address','rx-byte','tx-byte','link-downs','comment'],{live:true}),
 m('Interfaces','ethernet','Ethernet','interface/ethernet',['name','default-name','mac-address','speed','auto-negotiation','comment']),
 m('Interfaces','interface-lists','Interface lists','interface/list',['name','include','exclude','comment']),
 m('Interfaces','interface-list-members','List members','interface/list/member',['list','interface','comment']),
 m('Interfaces','vlans','VLAN','interface/vlan',['name','vlan-id','interface','mtu','comment']),
 m('Interfaces','wireguard','WireGuard','interface/wireguard',['name','listen-port','mtu','public-key','comment']),
 m('Interfaces','wireguard-peers','WireGuard peers','interface/wireguard/peers',['interface','allowed-address','endpoint-address','endpoint-port','last-handshake','rx','tx','comment'],{live:true}),
 m('Interfaces','wifi','Wi-Fi','interface/wifi',['name','configuration.ssid','mac-address','channel','comment']),
 m('Interfaces','wireless','Wireless','interface/wireless',['name','ssid','mode','band','frequency','mac-address','comment']),
 m('Bridge','bridges','Bridge','interface/bridge',['name','mtu','mac-address','protocol-mode','vlan-filtering','comment']),
 m('Bridge','bridge-ports','Ports','interface/bridge/port',['interface','bridge','pvid','horizon','hw','comment']),
 m('IP','addresses','Addresses','ip/address',['address','network','interface','comment']),
 m('IP','arp','ARP','ip/arp',['address','mac-address','interface','status','comment'],{live:true}),
 m('IP','dhcp-client','DHCP client','ip/dhcp-client',['interface','status','address','gateway','primary-dns','comment'],{live:true}),
 m('IP','dhcp-server','DHCP server','ip/dhcp-server',['name','interface','address-pool','lease-time','comment']),
 m('IP','dhcp-leases','DHCP leases','ip/dhcp-server/lease',['address','mac-address','host-name','server','status','last-seen','expires-after','comment'],{live:true}),
 m('IP','dhcp-networks','DHCP networks','ip/dhcp-server/network',['address','gateway','dns-server','comment']),
 m('IP','dns','DNS','ip/dns',[],{single:true}),
 m('IP','dns-static','DNS static','ip/dns/static',['name','address','type','ttl','comment']),
 m('IP','pools','Pool','ip/pool',['name','ranges','next-pool','comment']),
 m('IP','routes','Routes','ip/route',['dst-address','gateway','immediate-gw','distance','routing-table','comment']),
 m('IP','services','Services','ip/service',['name','port','address','certificate']),
 m('IP','neighbors','Neighbors','ip/neighbor',['interface','address','mac-address','identity','platform','version','board'],{live:true}),
 m('IP','cloud','Cloud','ip/cloud',[],{single:true}),
 m('Firewall','firewall-filter','Filter rules','ip/firewall/filter',['chain','action','protocol','src-address','dst-address','in-interface','out-interface','dst-port','connection-state','bytes','packets','comment']),
 m('Firewall','firewall-nat','NAT','ip/firewall/nat',['chain','action','protocol','src-address','dst-address','out-interface','dst-port','to-addresses','to-ports','bytes','comment']),
 m('Firewall','firewall-mangle','Mangle','ip/firewall/mangle',['chain','action','protocol','new-connection-mark','new-packet-mark','passthrough','bytes','comment']),
 m('Firewall','address-lists','Address lists','ip/firewall/address-list',['list','address','creation-time','timeout','comment']),
 m('Hotspot','hotspot-active','Active','ip/hotspot/active',['user','address','mac-address','uptime','session-time-left','idle-time','bytes-in','bytes-out','login-by'],{live:true}),
 m('Hotspot','hotspot-hosts','Hosts','ip/hotspot/host',['mac-address','address','to-address','server','authorized','bypassed','idle-time','uptime','bytes-in','bytes-out'],{live:true}),
 m('Hotspot','hotspot-servers','Servers','ip/hotspot',['name','interface','address-pool','profile','idle-timeout','addresses-per-mac']),
 m('Hotspot','hotspot-profiles','Server profiles','ip/hotspot/profile',['name','hotspot-address','dns-name','html-directory','login-by','use-radius','rate-limit']),
 m('Hotspot','hotspot-users','Users','ip/hotspot/user',['name','profile','server','limit-uptime','uptime','bytes-in','bytes-out','comment']),
 m('Hotspot','hotspot-user-profiles','User profiles','ip/hotspot/user/profile',['name','shared-users','rate-limit','session-timeout','idle-timeout','keepalive-timeout']),
 m('Hotspot','hotspot-bindings','IP bindings','ip/hotspot/ip-binding',['mac-address','address','to-address','server','type','comment']),
 m('Hotspot','walled-garden','Walled garden','ip/hotspot/walled-garden',['action','dst-host','dst-port','server','comment']),
 m('Hotspot','walled-garden-ip','Walled garden IP','ip/hotspot/walled-garden/ip',['action','dst-address','dst-host','protocol','dst-port','comment']),
 m('Hotspot','hotspot-cookies','Cookies','ip/hotspot/cookie',['user','mac-address','domain','expires-in']),
 m('Queues','simple-queues','Simple queues','queue/simple',['name','target','max-limit','limit-at','rate','bytes','comment'],{live:true}),
 m('Queues','queue-tree','Queue tree','queue/tree',['name','parent','packet-mark','max-limit','limit-at','rate','comment'],{live:true}),
 m('Queues','queue-types','Queue types','queue/type',['name','kind']),
 m('System','resources','Resources','system/resource',[],{single:true,live:true}),
 m('System','identity','Identity','system/identity',[],{single:true}),
 m('System','clock','Clock','system/clock',[],{single:true,live:true}),
 m('System','routerboard','RouterBOARD','system/routerboard',[],{single:true}),
 m('System','device-mode','Device mode','system/device-mode',[],{single:true}),
 m('System','health','Health','system/health',['name','value','type'],{live:true}),
 m('System','packages','Packages','system/package',['name','version','build-time','scheduled']),
 m('System','license','License','system/license',[],{single:true}),
 m('System','ntp-client','NTP client','system/ntp/client',[],{single:true}),
 m('System','scheduler','Scheduler','system/scheduler',['name','start-date','start-time','interval','next-run','run-count','comment']),
 m('System','users','Users','user',['name','group','address','last-logged-in','comment']),
 m('System','active-users','Active users','user/active',['name','when','address','via','group'],{live:true}),
 m('System','user-groups','User groups','user/group',['name','policy']),
 m('RADIUS','radius','RADIUS','radius',['service','address','protocol','authentication-port','accounting-port','timeout','comment']),
 m('RADIUS','radius-incoming','Incoming','radius/incoming',[],{single:true}),
 m('Tools','netwatch','Netwatch','tool/netwatch',['host','type','interval','status','since','comment'],{live:true}),
 m('Log','log','Log','log',['time','topics','message'],{live:true}),
];

export const GROUPS=[...new Set(MENUS.map(item=>item.group))];
export const menuById=(id:string)=>MENUS.find(item=>item.id===id)??null;

/** What the browser needs to draw the menu tree. No paths. */
export const menuTree=()=>GROUPS.map(group=>({group,items:MENUS.filter(item=>item.group===group).map(({id,label,live,single})=>({id,label,live:!!live,single:!!single}))}));

// ── Redaction ────────────────────────────────────────────────────────────────

const SECRET=/(^|[.-])(password|secret|private-key|preshared-key|pre-shared-key|passphrase|psk|community|token|auth-key)$/;
const SCRIPT=/(^|[.-])(source|on-event|on-up|on-down|up-script|down-script|test-script|lease-script|script)$/;
export const HIDDEN='••••••';
export const SCRIPT_HIDDEN='(script not shown)';

// A voucher is 16 characters from the voucher alphabet, sometimes hyphenated.
// Uppercase only: the login page upper-cases what the customer types.
const VOUCHER=/\b[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}-?([A-HJ-NP-Z2-9]{4})\b/g;
export const maskVouchers=(value:string)=>value.replace(VOUCHER,'••••-••••-••••-$1');

/** RouterOS answers single-value paths with an object and lists with an array. */
export function clean(value:unknown):Row[]{
 const list=Array.isArray(value)?value:(value&&typeof value==='object'?[value]:[]);
 return list.map(raw=>{
  const row:Row={};
  for(const [key,v] of Object.entries(raw as Record<string,unknown>)){
   const text=v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
   row[key]=key==='key'||SECRET.test(key)?(text?HIDDEN:''):SCRIPT.test(key)?(text?SCRIPT_HIDDEN:''):maskVouchers(text);
  }
  return row;
 });
}

/** WinBox's flag letters: X disabled, I invalid, D dynamic, R running, S slave. */
export function flags(row:Row):string{
 const on=(k:string)=>row[k]==='true';
 return [on('disabled')&&'X',on('invalid')&&'I',on('dynamic')&&'D',on('running')&&'R',on('slave')&&'S'].filter(Boolean).join('');
}

const LOG_LIMIT=500;

/**
 * Reads one menu. Columns are the WinBox defaults that this router actually
 * returned; a column no row has is dropped rather than shown empty, so the same
 * list works across RouterOS versions and models.
 */
export async function readMenu(connection:Pick<MikroTikConnection,'read'>,menu:Menu){
 let items=clean(await connection.read(menu.path,2*1024*1024));
 let truncated=false;
 if(menu.id==='log'){
  // Newest first, the way an operator reads a log when something just broke.
  items=items.reverse();
  if(items.length>LOG_LIMIT){items=items.slice(0,LOG_LIMIT);truncated=true;}
 }
 for(const row of items){const f=flags(row);if(f)row['.flags']=f;}
 const present=new Set(items.flatMap(row=>Object.keys(row)));
 const columns=menu.single?[]:menu.columns.filter(c=>present.has(c));
 return {columns:columns.length||menu.single?columns:[...present].filter(k=>!k.startsWith('.')).slice(0,8),items,count:items.length,truncated};
}

/** The strip across the top of the console: what WinBox shows in its title bar and Resources window. */
export async function overview(connection:Pick<MikroTikConnection,'read'>){
 const one=async(path:ReadPath)=>{try{return clean(await connection.read(path))[0]??{};}catch{return {} as Row;}};
 const [resource,identity,routerboard,clock]=await Promise.all([one('system/resource'),one('system/identity'),one('system/routerboard'),one('system/clock')]);
 if(!resource.version)throw new Error('Router did not answer');
 return {
  identity:identity.name||null,board:resource['board-name']||null,model:routerboard.model||null,
  version:resource.version||null,architecture:resource['architecture-name']||null,
  uptime:resource.uptime||null,cpu:resource.cpu||null,cpu_count:resource['cpu-count']||null,
  cpu_load:resource['cpu-load']??null,free_memory:resource['free-memory']??null,total_memory:resource['total-memory']??null,
  free_hdd:resource['free-hdd-space']??null,total_hdd:resource['total-hdd-space']??null,
  date:clock.date||null,time:clock.time||null,time_zone:clock['time-zone-name']||null,
 };
}
