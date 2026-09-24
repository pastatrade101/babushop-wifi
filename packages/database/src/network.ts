import {pool,tx,audit,requireValue,Problem,type DB,type Staff} from './index.ts';
import {connectionFromEnv,type MikroTikConnection} from '../../network/src/index.ts';
import {NetworkDiscoveryService,findDeviceByMac,assertManageable,type DiscoveredDevice,type Snapshot} from '../../network/src/discovery.ts';
import {testDeviceReachability,analyzeInputPath} from '../../network/src/diagnostics.ts';
import {buildPlan} from '../../network/src/wireguard-plan.ts';
import {normalizeMac} from '../../network/src/cidr.ts';
import {menuById,menuTree,readMenu,overview,parseCommand,formatPrint,formatPing,helpText,maskVouchers} from '../../network/src/console.ts';

// Everything an administrator can do to the network, and nothing more.
//
// Phases 1-4 only: discovery, diagnostics and planning. There is deliberately no
// code path in this module that writes to a router. The planner produces a
// document; applying it is a later phase and a separate decision.

/** The access point this site was built around. Overridable, because the next site will differ. */
export const MANAGED_AP_MAC=process.env.SITE_EAP_MAC??'D4:D6:DF:A5:F6:6C';

export async function sites(){
 return (await pool.query(`select s.*, (select count(*)::int from wifi.network_devices d where d.network_site_id=s.id) device_count,
  (select count(*)::int from wifi.network_devices d where d.network_site_id=s.id and d.approved_for_management) approved_count,
  (select row_to_json(t) from wifi.remote_access_tunnels t where t.network_site_id=s.id and t.type='SITE' limit 1) tunnel
  from wifi.network_sites s order by s.created_at`)).rows;
}

export async function site(id:string){
 const row=(await pool.query('select * from wifi.network_sites where id=$1',[id])).rows[0];
 requireValue(row,404,'Network site not found');
 return row;
}

/** One connection, used and closed. Callers never share or cache it. */
async function withRouter<T>(fn:(connection:MikroTikConnection)=>Promise<T>):Promise<T>{
 let connection:MikroTikConnection;
 try{connection=connectionFromEnv();}
 catch(error){throw new Problem(503,(error as Error).message);}
 try{return await fn(connection);}finally{connection.close();}
}

function summarize(snap:Snapshot,devices:DiscoveredDevice[]){
 const peer=snap.wireguardPeers[0];
 const ap=findDeviceByMac(devices,MANAGED_AP_MAC);
 const hotspot=snap.hotspots[0];
 return {
  router:{
   identity:snap.identity,version:snap.version,board:snap.boardName,uptime:snap.uptime,
   online:!!snap.version,wireguard_capable:/^7\./.test(snap.version??''),
   device_mode:snap.deviceMode?.mode??null,
   // Worth surfacing: it is why /tool fetch fails and why probes run from the VPS.
   device_mode_restrictions:Object.entries(snap.deviceMode??{}).filter(([key,value])=>value==='false'&&['fetch','container','scheduler','proxy','romon','bandwidth-test'].includes(key)).map(([key])=>key),
  },
  hotspot:hotspot?{name:hotspot.name,interface:hotspot.interface,enabled:hotspot.disabled!=='true',valid:hotspot.invalid!=='true',active_sessions:snap.hotspotActive.length}:null,
  tunnel:peer?{interface:peer.interface,allowed_address:peer['allowed-address'],endpoint:peer['endpoint-address']?`${peer['endpoint-address']}:${peer['endpoint-port']??''}`:null,last_handshake:peer['last-handshake']??null,online:!!peer['last-handshake'],rx:peer.rx??null,tx:peer.tx??null,
   // The routed reach of the tunnel today, which is what decides whether a probe can even be sent.
   carries_lan:(peer['allowed-address']??'').split(',').some(cidr=>!cidr.trim().startsWith('10.77.'))}:null,
  access_point:ap,
  lan_cidrs:snap.addresses.filter(a=>a.disabled!=='true'&&a.address?.includes('/')).map(a=>a.address),
 };
}

export async function status(siteId:string){
 const record=await site(siteId);
 return withRouter(async connection=>{
  const {snapshot:snap,devices}=await new NetworkDiscoveryService(connection).run();
  const summary=summarize(snap,devices);
  return {site:record,...summary,
   reply_path:analyzeInputPath(snap.firewallFilter,summary.access_point?.interface??''),
   read_at:snap.readAt};
 });
}

/**
 * Re-reads the router and stores what it found. Discovery is a read on the
 * router and a write only in our own database, so it is safe to run at any time
 * — including while customers are online.
 */
export async function discover(staff:Staff,siteId:string){
 const record=await site(siteId);
 return withRouter(async connection=>{
  const {snapshot:snap,devices,lanCidrs}=await new NetworkDiscoveryService(connection).run();
  return tx(async db=>{
   await db.query('update wifi.network_sites set lan_cidrs=$2,router_identity=$3,router_os=$4,last_discovered_at=now() where id=$1',[siteId,lanCidrs,snap.identity,snap.version]);
   for(const device of devices)await upsertDevice(db,siteId,device);
   await recordTunnel(db,siteId,record.site_interface,snap);
   await audit(db,staff.id,'NETWORK_DISCOVERED',siteId,{devices:devices.length,router_os:snap.version,lan_cidrs:lanCidrs});
   return {discovered:devices.length,lan_cidrs:lanCidrs,items:(await db.query('select * from wifi.network_devices where network_site_id=$1 order by ip_address nulls last',[siteId])).rows};
  });
 });
}

async function upsertDevice(db:DB,siteId:string,device:DiscoveredDevice){
 await db.query(`insert into wifi.network_devices(network_site_id,type,vendor,model,mac_address,ip_address,hostname,interface,dhcp_status,source,status,last_seen_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
  on conflict (network_site_id,mac_address) do update set
   type=excluded.type,vendor=excluded.vendor,model=coalesce(excluded.model,wifi.network_devices.model),
   ip_address=excluded.ip_address,hostname=coalesce(excluded.hostname,wifi.network_devices.hostname),
   interface=excluded.interface,dhcp_status=excluded.dhcp_status,source=excluded.source,status=excluded.status,last_seen_at=now()`,
  [siteId,device.type,device.vendor,device.model,device.macAddress,device.ipAddress,device.hostname,device.interface,device.dhcpStatus,device.source,device.arpComplete?'SEEN':'STALE']);
}

async function recordTunnel(db:DB,siteId:string,iface:string,snap:Snapshot){
 const peer=snap.wireguardPeers.find(p=>p.interface===iface);
 if(!peer)return;
 const address=snap.addresses.find(a=>a.interface===iface)?.address?.split('/')[0]??null;
 await db.query(`insert into wifi.remote_access_tunnels(network_site_id,type,interface_name,router_tunnel_ip,status,last_handshake_at)
  values($1,'SITE',$2,$3,$4,case when $5::text is null then null else now() end)
  on conflict (network_site_id,type,interface_name) do update set router_tunnel_ip=excluded.router_tunnel_ip,status=excluded.status,last_handshake_at=coalesce(excluded.last_handshake_at,wifi.remote_access_tunnels.last_handshake_at)`,
  [siteId,iface,address,peer['last-handshake']?'ACTIVE':'DEGRADED',peer['last-handshake']??null]);
}

export async function devices(siteId:string){
 await site(siteId);
 return {items:(await pool.query('select * from wifi.network_devices where network_site_id=$1 order by ip_address nulls last',[siteId])).rows};
}

async function deviceRecord(deviceId:string){
 const row=(await pool.query('select d.*, s.lan_cidrs, s.id site_id from wifi.network_devices d join wifi.network_sites s on s.id=d.network_site_id where d.id=$1',[deviceId])).rows[0];
 requireValue(row,404,'Device not found');
 return row;
}

/**
 * Diagnostics for one device.
 *
 * The address is never supplied by the caller: it is read from the stored device
 * row and re-checked against the site's own LAN blocks. A caller can name an id
 * and nothing else, which is what keeps this endpoint from becoming a proxy.
 */
export async function diagnose(deviceId:string,staff?:Staff){
 const row=await deviceRecord(deviceId);
 const address=String(row.ip_address??'');
 assertManageable(address,row.lan_cidrs);
 return withRouter(async connection=>{
  const {snapshot:snap,devices:found}=await new NetworkDiscoveryService(connection).run();
  const device=findDeviceByMac(found,row.mac_address);
  requireValue(device,409,'The router no longer knows this device. Run discovery again.');
  const result=await testDeviceReachability({connection,device,snapshot:snap,lanCidrs:row.lan_cidrs});
  await pool.query('update wifi.network_devices set status=$2,last_seen_at=case when $3 then now() else last_seen_at end where id=$1',[deviceId,result.verdict,result.verdict==='REACHABLE']);
  if(staff)await audit(pool,staff.id,'NETWORK_DEVICE_PROBED',deviceId,{address:result.address,verdict:result.verdict,loss:result.icmp.lossPercent});
  return {device:row,...result};
 });
}

/** Approval is what makes a device contactable. Discovery alone never does. */
export async function approve(staff:Staff,deviceId:string,approved:boolean){
 const row=await deviceRecord(deviceId);
 return tx(async db=>{
  const updated=(await db.query('update wifi.network_devices set approved_for_management=$2 where id=$1 returning *',[deviceId,approved])).rows[0];
  await audit(db,staff.id,approved?'NETWORK_DEVICE_APPROVED':'NETWORK_DEVICE_UNAPPROVED',deviceId,{mac:row.mac_address,address:String(row.ip_address??'')});
  return updated;
 });
}

/**
 * Phase 5, as a document. Nothing here contacts the router to change it: the
 * plan is computed from a fresh read, recorded, and shown for approval.
 */
export async function plan(staff:Staff,siteId:string){
 const record=await site(siteId);
 const approved=(await pool.query('select * from wifi.network_devices where network_site_id=$1 and approved_for_management order by ip_address',[siteId])).rows;
 requireValue(approved.length>0,400,'Approve the device you intend to reach before planning a tunnel.');
 return withRouter(async connection=>{
  const {snapshot:snap}=await new NetworkDiscoveryService(connection).run();
  const built=buildPlan({
   siteId,snapshot:snap,
   managementTargets:approved.map(d=>({address:String(d.ip_address),label:d.hostname??d.mac_address})),
   targetInterface:approved[0].interface??'',
   // Host facts come from what an administrator captured, never from this
   // process: it runs in its own network namespace, so its routes and
   // /proc/sys values are not the server's. Anything never captured stays
   // UNVERIFIED and blocks the plan.
   vps:{siteInterface:record.site_interface,tunnelAddress:record.server_tunnel_address??'10.77.0.1',
    peerPublicKey:record.vps_preflight?.peerPublicKey,
    preflight:{...record.vps_preflight,capturedAt:record.preflight_captured_at?.toISOString()}},
  });
  return tx(async db=>{
   await db.query("update wifi.network_plans set status='SUPERSEDED' where network_site_id=$1 and status='DRAFT'",[siteId]);
   const row=(await db.query('insert into wifi.network_plans(network_site_id,created_by,digest,provision_id,plan) values($1,$2,$3,$4,$5) returning *',[siteId,staff.id,built.digest,built.provisionId,built])).rows[0];
   await audit(db,staff.id,'NETWORK_PLAN_DRAFTED',row.id,{digest:built.digest,provision:built.provisionId,creates:built.creates.length,changes:built.changes.length,blockers:built.blockers});
   return row;
  });
 });
}

export async function plans(siteId:string){
 await site(siteId);
 return {items:(await pool.query('select * from wifi.network_plans where network_site_id=$1 order by created_at desc limit 10',[siteId])).rows};
}

export async function auditTrail(siteId:string){
 await site(siteId);
 return {items:(await pool.query(`select a.*, p.display_name actor from wifi.audit_logs a left join wifi.staff_profiles p on p.id=a.actor_id
  where a.action like 'NETWORK%' order by a.created_at desc limit 50`)).rows};
}

/**
 * Records the host facts the planner cannot observe for itself.
 *
 * Only known keys are kept, so a caller cannot use this as general storage, and
 * the values are capped in length. A recapture replaces the set wholesale rather
 * than merging: a half-updated preflight is worse than an obviously old one.
 */
const PREFLIGHT_KEYS=['ipForward','wgManager','wgUnit','wgUnitEnabled','wgUnitActive','wgConfigPath','runtimeAllowedIps','persistentAllowedIps','wgConfDirectives','routeToTarget','adminPortFree','hostFirewall','adminPortReachable','adminPortProbe','peerPublicKey'];
export async function setPreflight(staff:Staff,siteId:string,facts:Record<string,unknown>){
 await site(siteId);
 const clean:Record<string,unknown>={};
 for(const key of PREFLIGHT_KEYS){
  const value=facts[key];
  if(value===undefined||value===null)continue;
  if(typeof value==='string')requireValue(value.length<=500,400,`${key} is too long.`);
  if(Array.isArray(value))requireValue(value.length<=50&&value.every(v=>typeof v==='string'&&v.length<=500),400,`${key} must be up to 50 short strings.`);
  clean[key]=value;
 }
 const unknown=Object.keys(facts).filter(key=>!PREFLIGHT_KEYS.includes(key));
 requireValue(unknown.length===0,400,'Unrecognised preflight keys: '+unknown.join(', '));
 return tx(async db=>{
  const row=(await db.query('update wifi.network_sites set vps_preflight=$2,preflight_captured_at=now() where id=$1 returning *',[siteId,clean])).rows[0];
  await audit(db,staff.id,'NETWORK_PREFLIGHT_CAPTURED',siteId,{keys:Object.keys(clean)});
  return row;
 });
}

/** The Omada site URL the operator pastes into the EAP. Stored, never fetched. */
export async function setOmadaUrl(staff:Staff,siteId:string,url:string|null){
 await site(siteId);
 if(url){
  let parsed:URL;
  try{parsed=new URL(url);}catch{throw new Problem(400,'Enter the Omada site URL exactly as the controller shows it.');}
  requireValue(parsed.protocol==='https:',400,'The Omada inform URL must be https.');
 }
 return tx(async db=>{
  const row=(await db.query('update wifi.network_sites set omada_inform_url=$2 where id=$1 returning *',[siteId,url])).rows[0];
  await audit(db,staff.id,'NETWORK_OMADA_URL_SET',siteId,{url});
  return row;
 });
}

export {normalizeMac};

// ── Router console ───────────────────────────────────────────────────────────
// WinBox's menus, read-only. The browser names a menu from a fixed list; the
// path, the connection and the credentials never leave the server.

const NOT_ANSWERING='The router is not answering. Check its connection to the server.';

export const routerMenus=()=>({groups:menuTree()});

export async function routerOverview(){
 return withRouter(async connection=>{
  try{return {...await overview(connection),read_at:new Date().toISOString()};}
  catch{throw new Problem(503,NOT_ANSWERING);}
 });
}

export async function routerMenu(id:string){
 const menu=menuById(id);
 requireValue(menu,404,'Unknown router menu');
 const described={id:menu.id,label:menu.label,group:menu.group,single:!!menu.single,live:!!menu.live};
 return withRouter(async connection=>{
  try{return {menu:described,...await readMenu(connection,menu),error:null,read_at:new Date().toISOString()};}
  catch(error){
   // A menu this model or account does not have is an answer, not an outage.
   const message=(error as Error).message;
   const unavailable=message==='Router rejected request'?'This router does not have this menu, or the portal\'s read-only account is not allowed to read it.'
    :message==='Response too large'?'Too much data to show here. Use WinBox for this menu.':null;
   if(!unavailable)throw new Problem(503,NOT_ANSWERING);
   return {menu:described,columns:[],items:[],count:0,truncated:false,error:unavailable,read_at:new Date().toISOString()};
  }
 });
}

/**
 * One line from the read-only terminal. The line is parsed here into a print of
 * an allowlisted menu or an IPv4 ping; the router never sees the text itself.
 * Every command is audited, with any voucher code in it masked.
 */
export async function routerCommand(staff:Staff,command:string){
 const parsed=parseCommand(command);
 await audit(pool,staff.id,'ROUTER_TERMINAL_COMMAND',null,{command:maskVouchers(command.trim()).slice(0,200),kind:parsed.kind});
 if(parsed.kind==='help')return {ok:true,output:helpText()};
 if(parsed.kind==='error')return {ok:false,output:parsed.message};
 return withRouter(async connection=>{
  try{
   if(parsed.kind==='ping')return {ok:true,output:formatPing(await connection.ping(parsed.address,parsed.count) as Record<string,string|undefined>[])};
   return {ok:true,output:formatPrint(await readMenu(connection,parsed.menu),parsed)};
  }catch(error){
   const message=(error as Error).message;
   if(message==='Router rejected request')return {ok:false,output:'failure: this router does not have that menu, or the read-only account may not read it'};
   if(message==='Response too large')return {ok:false,output:'failure: too much output to show here; use WinBox'};
   throw new Problem(503,NOT_ANSWERING);
  }
 });
}
