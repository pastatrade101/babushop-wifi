import * as network from '../../../packages/database/src/network.ts';
import * as routerFiles from '../../../packages/database/src/router-files.ts';
import * as S from '../../../packages/contracts/src/index.ts';

// Remote site access, Phases 1-4.
//
// Every route is administrator-only. All but one are reads on the router: the
// exception is hotspot page uploads, which write text files into the hotspot's
// own folder on a separate account, keeping each file they replace. There is
// intentionally no apply endpoint for the tunnel plan: the planner produces a
// document for review.
//
// No route makes the server connect anywhere a browser chose. Targets are named
// by database id and resolved server-side, which is what keeps the management
// backend from becoming a request-forgery proxy. The one address a browser can
// supply is the terminal's ping target: an IPv4 address the router pings, ICMP
// only, at most ten packets -- the server itself never connects to it.

type Route=(method:string,url:string,body:unknown,response:unknown,handler:(request:any)=>unknown,isAdmin?:boolean,extra?:any)=>void;

export function registerNetwork(route:Route){
 const params={schema:{params:S.Params}};
 const slow=(max:number)=>({...params,config:{rateLimit:{max,timeWindow:'1 minute'}}});

 route('GET','/network/sites',undefined,S.NetworkSiteList,async()=>({items:await network.sites()}),true);
 route('GET','/network/sites/:id',undefined,S.NetworkSiteRow,async(r:any)=>network.site(r.params.id),true,params);
 // Reads the router. Safe while customers are online: GETs only, plus the
 // diagnostics ping, neither of which changes configuration.
 route('GET','/network/sites/:id/status',undefined,S.NetworkStatus,async(r:any)=>network.status(r.params.id),true,slow(30));
 route('POST','/network/sites/:id/discover',undefined,S.NetworkDiscovery,async(r:any)=>network.discover(r.staff,r.params.id),true,slow(10));
 route('GET','/network/sites/:id/devices',undefined,S.NetworkDeviceList,async(r:any)=>network.devices(r.params.id),true,params);
 route('GET','/network/sites/:id/audit',undefined,S.NetworkAuditList,async(r:any)=>network.auditTrail(r.params.id),true,params);

 route('GET','/network/devices/:id/status',undefined,S.NetworkReachability,async(r:any)=>network.diagnose(r.params.id),true,slow(30));
 route('POST','/network/devices/:id/ping',undefined,S.NetworkReachability,async(r:any)=>network.diagnose(r.params.id,r.staff),true,slow(20));
 route('POST','/network/devices/:id/approve',S.ApprovalInput,S.NetworkDeviceRow,async(r:any)=>network.approve(r.staff,r.params.id,r.body.approved),true,params);

 // Dry run only. Applying it is a separate phase and a separate decision.
 route('POST','/network/sites/:id/wireguard/plan',undefined,S.NetworkPlanRow,async(r:any)=>network.plan(r.staff,r.params.id),true,slow(10));
 route('GET','/network/sites/:id/wireguard/plans',undefined,S.NetworkPlanList,async(r:any)=>network.plans(r.params.id),true,params);

 route('PATCH','/network/sites/:id/preflight',S.PreflightInput,S.NetworkSiteRow,async(r:any)=>network.setPreflight(r.staff,r.params.id,r.body),true,params);
 route('PATCH','/network/sites/:id/omada',S.OmadaUrlInput,S.NetworkSiteRow,async(r:any)=>network.setOmadaUrl(r.staff,r.params.id,r.body.url),true,params);

 // Router console: WinBox's menus, read-only. Refreshing a live menu every few
 // seconds is the point of it, so the limit is generous; each call is one GET.
 route('GET','/network/router/menus',undefined,S.RouterMenus,async()=>network.routerMenus(),true);
 route('GET','/network/router/overview',undefined,S.RouterOverview,async()=>network.routerOverview(),true,{config:{rateLimit:{max:120,timeWindow:'1 minute'}}});
 route('GET','/network/router/menus/:menu',undefined,S.RouterMenuRows,async(r:any)=>network.routerMenu(r.params.menu),true,{schema:{params:S.RouterMenuParams},config:{rateLimit:{max:120,timeWindow:'1 minute'}}});
 // The read-only terminal: print, ping and help, parsed server-side. Slower
 // limit than the menus, because a ping holds the router for seconds.
 route('POST','/network/router/terminal',S.RouterCommandInput,S.RouterCommandOutput,async(r:any)=>network.routerCommand(r.staff,r.body.command),true,{config:{rateLimit:{max:30,timeWindow:'1 minute'}}});

 // Hotspot pages: the portal's one write to the router, on its own account.
 // Each upload keeps the file it replaces and is checked by reading it back.
 // A 60 KB page grows when JSON-escaped, so this one route takes a larger body.
 route('GET','/network/router/files/capability',undefined,S.RouterFileCapability,async()=>routerFiles.fileCapability(),true);
 route('POST','/network/router/files',S.RouterFileUpload,S.RouterFileResult,async(r:any)=>routerFiles.uploadHotspotFile(r.staff,r.body.name,r.body.contents),true,{bodyLimit:262144,config:{rateLimit:{max:12,timeWindow:'1 minute'}}});
 route('GET','/network/router/files/versions',undefined,S.RouterFileVersions,async(r:any)=>routerFiles.fileVersions(r.query.name),true,{schema:{querystring:S.RouterFileVersionsQuery}});
 route('POST','/network/router/files/versions/:id/restore',undefined,S.RouterFileResult,async(r:any)=>routerFiles.restoreFileVersion(r.staff,r.params.id),true,{schema:{params:S.Params},config:{rateLimit:{max:12,timeWindow:'1 minute'}}});
}
