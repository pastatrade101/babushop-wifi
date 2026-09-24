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
 // Names, sizes and dates only. A file's contents never leave the router:
 // backups and exports are exactly where its passwords are written down.
 m('Files','files','File list','file',['name','type','size','last-modified','creation-time']),
 m('Log','log','Log','log',['time','topics','message'],{live:true}),
 m('RADIUS','radius','RADIUS','radius',['service','address','protocol','authentication-port','accounting-port','timeout','comment']),
 m('RADIUS','radius-incoming','Incoming','radius/incoming',[],{single:true}),
 m('Tools','netwatch','Netwatch','tool/netwatch',['host','type','interval','status','since','comment'],{live:true}),
];

export const GROUPS=[...new Set(MENUS.map(item=>item.group))];
export const menuById=(id:string)=>MENUS.find(item=>item.id===id)??null;

/** What the browser needs to draw the menu tree. No paths. The terminal is last, where WinBox keeps "New Terminal". */
export const menuTree=()=>[...GROUPS.map(group=>({group,items:MENUS.filter(item=>item.group===group).map(({id,label,live,single})=>({id,label,live:!!live,single:!!single}))})),
 {group:'Terminal',items:[{id:'terminal',label:'New terminal',live:false,single:false}]}];

// ── Redaction ────────────────────────────────────────────────────────────────

const SECRET=/(^|[.-])(password|secret|private-key|preshared-key|pre-shared-key|passphrase|psk|community|token|auth-key)$/;
const SCRIPT=/(^|[.-])(source|on-event|on-up|on-down|up-script|down-script|test-script|lease-script|script|contents)$/;
export const HIDDEN='••••••';
export const SCRIPT_HIDDEN='(not shown)';

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

// ── Terminal ─────────────────────────────────────────────────────────────────
// A read-only command line. It understands exactly three things -- print,
// ping and help -- and turns each into a call this module already makes: a
// print is a read of one allowlisted path, a ping is the connector's IPv4 ping.
// Nothing typed here is ever sent to the router as text, so there is no command
// the router could be tricked into running.

export type Parsed=
 |{kind:'print';menu:Menu;detail:boolean;countOnly:boolean;where:[string,string][]}
 |{kind:'ping';address:string;count:number}
 |{kind:'help'}
 |{kind:'error';message:string};

const BY_PATH=new Map(MENUS.map(item=>[item.path,item]));
const READ_ONLY='The portal terminal is read-only: it runs print, ping and help. Use WinBox for anything that changes the router.';

export function parseCommand(line:string):Parsed{
 const text=line.trim();
 if(!text||/^(help|\?|\/\?)$/i.test(text))return {kind:'help'};
 const ping=text.match(/^\/?(?:tool[\s/]+)?ping\s+(?:address=)?(\S+)(?:\s+count=(\d+))?\s*$/i);
 if(ping){
  const address=ping[1],count=ping[2]?Number(ping[2]):4;
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)||address.split('.').some(o=>Number(o)>255))return {kind:'error',message:'ping takes an IPv4 address, for example: ping 8.8.8.8'};
  if(count<1||count>10)return {kind:'error',message:'ping count must be between 1 and 10'};
  return {kind:'ping',address,count};
 }
 const words=text.replace(/^\//,'').replace(/\//g,' ').split(/\s+/);
 const at=words.findIndex(w=>w.toLowerCase()==='print');
 if(at<0)return {kind:'error',message:READ_ONLY};
 const path=words.slice(0,at).join('/').toLowerCase();
 const menu=BY_PATH.get(path as ReadPath);
 if(!menu)return {kind:'error',message:path?`/${words.slice(0,at).join(' ')} is not available in the portal terminal. Type help for the list.`:'Name a menu to print, for example: /interface print'};
 const rest=words.slice(at+1);
 const where:[string,string][]=[];let detail=false,countOnly=false,inWhere=false;
 for(const word of rest){
  const w=word.toLowerCase();
  if(w==='detail')detail=true;
  else if(w==='count-only')countOnly=true;
  else if(w==='where')inWhere=true;
  else if(inWhere&&/^[a-z0-9.-]+=.+$/i.test(word)){const i=word.indexOf('=');where.push([word.slice(0,i),word.slice(i+1).replace(/^"|"$/g,'')]);}
  else if(w==='terse'||w==='without-paging'||w==='brief')continue;
  else return {kind:'error',message:`print does not understand "${word}" here. It takes detail, count-only and where name=value.`};
 }
 return {kind:'print',menu,detail,countOnly,where};
}

const pad=(s:string,n:number)=>s.length>=n?s:s+' '.repeat(n-s.length);
const cut=(s:string,n=48)=>s.length>n?s.slice(0,n-1)+'…':s;
const quote=(v:string)=>/^[\w.:/@*-]+$/.test(v)?v:JSON.stringify(v);
const FLAG_NAMES:Record<string,string>={X:'DISABLED',I:'INVALID',D:'DYNAMIC',R:'RUNNING',S:'SLAVE'};

/** RouterOS-shaped text for a print: a flag legend, a numbered table, or name: value lines. */
export function formatPrint(result:{columns:string[];items:Row[]},parsed:Extract<Parsed,{kind:'print'}>):string{
 const items=result.items.filter(row=>parsed.where.every(([k,v])=>(row[k]??'')===v));
 if(parsed.countOnly)return String(items.length);
 if(parsed.menu.single){
  const row=items[0]??{};const keys=Object.keys(row).filter(k=>!k.startsWith('.'));
  const width=Math.max(0,...keys.map(k=>k.length));
  return keys.map(k=>`${' '.repeat(width-k.length+2)}${k}: ${row[k]}`).join('\n');
 }
 if(!items.length)return '';
 const used=[...new Set(items.map(r=>r['.flags']??'').join(''))];
 const legend=used.length?'Flags: '+Object.keys(FLAG_NAMES).filter(f=>used.includes(f)).map(f=>`${f} - ${FLAG_NAMES[f]}`).join('; ')+'\n':'';
 if(parsed.detail){
  return legend+items.map((row,i)=>`${pad(String(i),3)}${pad(row['.flags']??'',3)}`+Object.entries(row).filter(([k])=>!k.startsWith('.')).map(([k,v])=>`${k}=${quote(v)}`).join(' ')).join('\n\n');
 }
 const columns=result.columns;
 const widths=columns.map(c=>Math.max(c.length,...items.map(r=>cut(r[c]??'').length)));
 const flagWidth=Math.max(0,...items.map(r=>(r['.flags']??'').length));
 const head=`${pad('#',3)}${flagWidth?pad('',flagWidth+1):''}`+columns.map((c,i)=>pad(c.toUpperCase(),widths[i])).join('  ');
 const lines=items.map((row,i)=>`${pad(String(i),3)}${flagWidth?pad(row['.flags']??'',flagWidth+1):''}`+columns.map((c,j)=>pad(cut(row[c]??''),widths[j])).join('  '));
 return legend+[head,...lines].map(l=>l.trimEnd()).join('\n');
}

export function formatPing(replies:Record<string,string|undefined>[]):string{
 const rows=replies.filter(r=>r.host||r.status);
 const lines=rows.map((r,i)=>`${pad(String(i),5)}${pad(r.host??'',17)}${pad(r.size??'',6)}${pad(r.ttl??'',5)}${pad(r.time??'',9)}${r.status??''}`.trimEnd());
 const last=replies[replies.length-1]??{};
 const summary=last.sent?`    sent=${last.sent} received=${last.received??0} packet-loss=${last['packet-loss']??'?'}${last['avg-rtt']?` avg-rtt=${last['avg-rtt']}`:''}`:'';
 return [`${pad('SEQ',5)}${pad('HOST',17)}${pad('SIZE',6)}${pad('TTL',5)}${pad('TIME',9)}STATUS`,...lines,summary].filter(Boolean).join('\n');
}

export function helpText():string{
 const groups=[...new Set(MENUS.map(m=>m.group))];
 return ['The portal terminal is read-only. It runs:','',
  '  <menu> print [detail] [count-only] [where name=value]',
  '  ping <IPv4 address> [count=1..10]',
  '  help','',
  'Menus you can print:',
  ...groups.map(g=>'  '+MENUS.filter(m=>m.group===g).map(m=>'/'+m.path.replace(/\//g,' ')).join(', ')),
  '','Examples:  /ip hotspot active print    /interface print detail    /log print    ping 8.8.8.8',
 ].join('\n');
}
