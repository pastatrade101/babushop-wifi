import {Type as T} from '@sinclair/typebox';
export const Id=T.String({format:'uuid'});
export const Text=(max=100)=>T.String({minLength:1,maxLength:max});
export const Reason=T.Object({reason:T.String({minLength:3,maxLength:500})},{additionalProperties:false});
export const PackageInput=T.Object({name:Text(),description:T.Optional(T.String({maxLength:1000})),price_tzs:T.Integer({minimum:1,maximum:10000000}),duration_minutes:T.Integer({minimum:1,maximum:525600}),download_mbps:T.Optional(T.Union([T.Integer({minimum:1,maximum:10000}),T.Null()])),upload_mbps:T.Optional(T.Union([T.Integer({minimum:1,maximum:10000}),T.Null()])),active:T.Optional(T.Boolean())},{additionalProperties:false});
export const BatchInput=T.Object({package_id:Id,quantity:T.Integer({minimum:1,maximum:1000}),label:T.Optional(T.String({maxLength:100}))},{additionalProperties:false});
// Bulk catalogue import. Capped so one upload cannot hold a transaction open
// over thousands of inserts; the service reports per-row problems and imports
// all-or-nothing.
export const BulkPackageInput=T.Object({items:T.Array(PackageInput,{minItems:1,maxItems:200})},{additionalProperties:false});
export const ReservationInput=T.Object({package_id:Id,quantity:T.Integer({minimum:1,maximum:100})},{additionalProperties:false});
export const SaleInput=T.Object({reservation_id:Id,cash_received:T.Boolean(),customer_name:T.Optional(T.String({maxLength:100})),customer_phone:T.Optional(T.String({maxLength:30})),notes:T.Optional(T.String({maxLength:500}))},{additionalProperties:false});
export const ContextInput=T.Object({clientMac:Text(32),apMac:Text(32),ssidName:Text(64),radioId:Text(2),site:Text(100),clientIp:T.Optional(Text(64))},{additionalProperties:false});
// Self-service purchase. The phone is optional and only forwarded to the payment
// provider so the buyer recognises the charge; it is never required to buy.
export const PurchaseInput=T.Object({package_id:Id,phone:T.Optional(T.String({maxLength:30})),
 // Required by push providers, which ask the buyer's own network to prompt the
 // handset. Hosted-page providers ignore it and let the buyer choose there.
 network:T.Optional(T.String({maxLength:20}))},{additionalProperties:false});
// The claim token is the buyer's only handle on their purchase. It is POSTed,
// never placed in a URL, so it cannot leak through history, logs or a referrer.
export const ClaimInput=T.Object({claim_token:Text(200)},{additionalProperties:false});
export const Paging=T.Object({page:T.Optional(T.Integer({minimum:1,maximum:100000})),q:T.Optional(T.String({maxLength:100})),state:T.Optional(T.String({maxLength:30})),package_id:T.Optional(Id),sort:T.Optional(T.Union([T.Literal('newest'),T.Literal('oldest')])),from:T.Optional(T.String({format:'date'})),to:T.Optional(T.String({format:'date'}))},{additionalProperties:false});
export const Params=T.Object({id:Id},{additionalProperties:false});
// Reporting time series. Row's field allowlist is for record shapes, so the
// chart endpoints carry their own explicit schemas.
export const TrendQuery=T.Object({days:T.Optional(T.Integer({minimum:7,maximum:180}))},{additionalProperties:false});
export const RevenueQuery=T.Object({from:T.Optional(T.String({format:'date'})),to:T.Optional(T.String({format:'date'}))},{additionalProperties:false});
export const RevenueSummary=T.Object({
 from:T.String({format:'date'}),to:T.String({format:'date'}),gross_tzs:T.Number(),reversals_tzs:T.Number(),net_tzs:T.Number(),sales_count:T.Integer(),vouchers_sold:T.Integer(),
 cash_gross_tzs:T.Number(),cash_reversals_tzs:T.Number(),cash_net_tzs:T.Number(),
 azampay_gross_tzs:T.Number(),azampay_reversals_tzs:T.Number(),azampay_net_tzs:T.Number(),azampay_sales_count:T.Integer(),
 other_gross_tzs:T.Number(),other_reversals_tzs:T.Number(),other_net_tzs:T.Number(),
},{additionalProperties:false});
export const Trend=T.Object({items:T.Array(T.Object({day:T.String(),gross_tzs:T.Number(),net_tzs:T.Number(),vouchers_sold:T.Integer()},{additionalProperties:false}))},{additionalProperties:false});
export const PackageBreakdown=T.Object({items:T.Array(T.Object({package_name:T.String(),vouchers:T.Integer(),revenue_tzs:T.Number()},{additionalProperties:false}))},{additionalProperties:false});
// Explicit selected columns are the response allowlist. Nested JSON is confined to sanitized evidence.
const nullableString=T.Union([T.String(),T.Null()]);
const fields:Record<string,any>={};
for(const name of ['id','site_id','package_id','batch_id','created_by','reservation_id','sale_id','voucher_id','grant_id','reviewed_by','actor_id','entity_id','name','description','label','role','display_name','code_mask','package_name','inventory_state','policy','receipt_number','cashier_name','currency','payment_method','client_mac','state','action','code','message','status','reference','session_id','session_state','upload_bytes','download_bytes'])fields[name]=T.Optional(T.String());
for(const name of ['created_at','updated_at','sold_at','expires_at','activated_at','proposed_expires_at','deadline','reversal_reason','reason','review_note','customer_name','customer_phone','notes','last_seen_at','stopped_at','terminate_cause','paid_at','cashier_id','provider','network','provider_reference','failure_reason','payment_reference','receipt_number','package_name'])fields[name]=T.Optional(nullableString);
for(const name of ['price_tzs','duration_minutes','quantity','total_tzs','available','count','stock','sold_unused','active','needs_review','gross_tzs','reversals_tzs','net_tzs','vouchers_sold','session_seconds','amount_tzs'])fields[name]=T.Optional(T.Number());
fields.download_mbps=T.Optional(T.Union([T.Number(),T.Null()]));fields.upload_mbps=T.Optional(T.Union([T.Number(),T.Null()]));
fields.active=T.Optional(T.Union([T.Boolean(),T.Number()]));fields.enabled=T.Optional(T.Boolean());fields.evidence=T.Optional(T.Object({code:T.Optional(T.String())},{additionalProperties:false}));
export const Row=T.Object(fields,{additionalProperties:false});
export const List=T.Object({items:T.Array(Row),page:T.Integer(),has_more:T.Boolean()},{additionalProperties:false});
export const OK=T.Object({ok:T.Boolean(),message:T.Optional(T.String())},{additionalProperties:false});
export const ErrorResponse=T.Object({error:T.String()},{additionalProperties:false});
export const SecretRows=T.Object({items:T.Array(Row)},{additionalProperties:false});

// ── Remote site access ────────────────────────────────────────────────────────
// These responses carry no secret by construction: the network schema stores no
// credential, and the router connector strips private keys and shared secrets at
// the read boundary. So the deeply nested diagnostic and plan documents are
// passed through whole rather than flattened into the Row allowlist, which exists
// to stop voucher and payment columns leaking.
const Nested=T.Any();
export const NetworkSiteRow=T.Object({id:Id,site_id:Id,name:T.String(),vps_preflight:T.Optional(Nested),preflight_captured_at:T.Optional(T.Union([T.String(),T.Null()])),router_identity:T.Union([T.String(),T.Null()]),router_os:T.Union([T.String(),T.Null()]),lan_cidrs:T.Array(T.String()),management_cidr:T.Union([T.String(),T.Null()]),site_interface:T.String(),server_tunnel_address:T.Union([T.String(),T.Null()]),omada_inform_url:T.Union([T.String(),T.Null()]),last_discovered_at:T.Union([T.String(),T.Null()]),created_at:T.String(),updated_at:T.String(),device_count:T.Optional(T.Integer()),approved_count:T.Optional(T.Integer()),tunnel:T.Optional(Nested)},{additionalProperties:false});
export const NetworkSiteList=T.Object({items:T.Array(NetworkSiteRow)},{additionalProperties:false});
export const NetworkDeviceRow=T.Object({id:Id,network_site_id:Id,type:T.String(),vendor:T.Union([T.String(),T.Null()]),model:T.Union([T.String(),T.Null()]),mac_address:T.String(),ip_address:T.Union([T.String(),T.Null()]),hostname:T.Union([T.String(),T.Null()]),interface:T.Union([T.String(),T.Null()]),dhcp_status:T.Union([T.String(),T.Null()]),source:T.String(),approved_for_management:T.Boolean(),status:T.String(),last_seen_at:T.Union([T.String(),T.Null()]),created_at:T.String(),updated_at:T.String()},{additionalProperties:false});
export const NetworkDeviceList=T.Object({items:T.Array(NetworkDeviceRow)},{additionalProperties:false});
export const NetworkStatus=Nested;
export const NetworkDiscovery=T.Object({discovered:T.Integer(),lan_cidrs:T.Array(T.String()),items:T.Array(NetworkDeviceRow)},{additionalProperties:false});
export const NetworkReachability=Nested;
export const NetworkPlanRow=T.Object({id:Id,network_site_id:Id,created_by:Id,digest:T.String(),provision_id:Id,plan:Nested,status:T.String(),applied_at:T.Union([T.String(),T.Null()]),created_at:T.String()},{additionalProperties:false});
export const NetworkPlanList=T.Object({items:T.Array(NetworkPlanRow)},{additionalProperties:false});
export const NetworkAuditList=T.Object({items:T.Array(T.Object({id:Id,actor:T.Union([T.String(),T.Null()]),actor_id:T.Union([Id,T.Null()]),action:T.String(),entity_id:T.Union([Id,T.Null()]),details:Nested,created_at:T.String()},{additionalProperties:false}))},{additionalProperties:false});
// Router console. Rows are RouterOS's own strings, already stripped of secrets
// and voucher codes by the console module; the schema pins every value to a string.
export const RouterMenuParams=T.Object({menu:T.String({pattern:'^[a-z0-9-]{1,40}$'})},{additionalProperties:false});
const RouterTab=T.Object({id:T.String(),label:T.String(),live:T.Boolean(),single:T.Boolean()},{additionalProperties:false});
const RouterWindow=T.Object({id:T.String(),title:T.String(),icon:T.String(),tabs:T.Array(RouterTab)},{additionalProperties:false});
export const RouterMenus=T.Object({nav:T.Array(T.Object({label:T.String(),icon:T.String(),window:T.Optional(RouterWindow),windows:T.Optional(T.Array(RouterWindow))},{additionalProperties:false}))},{additionalProperties:false});
export const RouterMenuRows=T.Object({menu:T.Object({id:T.String(),label:T.String(),group:T.String(),single:T.Boolean(),live:T.Boolean()},{additionalProperties:false}),columns:T.Array(T.String()),items:T.Array(T.Record(T.String(),T.String())),count:T.Integer(),truncated:T.Boolean(),error:T.Union([T.String(),T.Null()]),read_at:T.String()},{additionalProperties:false});
export const RouterOverview=Nested;
// Hotspot page uploads: the only router write. Names are relative to the
// hotspot folder and checked again on the server; contents are text.
export const RouterFileCapability=T.Object({enabled:T.Boolean(),directory:T.Union([T.String(),T.Null()]),types:T.Array(T.String()),max_bytes:T.Integer()},{additionalProperties:false});
export const RouterFileUpload=T.Object({name:T.String({minLength:1,maxLength:130}),contents:T.String({maxLength:70000})},{additionalProperties:false});
export const RouterFileResult=T.Object({name:T.String(),size:T.Integer(),sha256:T.String(),replaced:T.Boolean(),version_id:Id},{additionalProperties:false});
export const RouterFileVersionsQuery=T.Object({name:T.String({maxLength:200})},{additionalProperties:false});
export const RouterFileVersions=T.Object({items:T.Array(T.Object({id:Id,name:T.String(),reason:T.String(),size:T.Integer(),sha256:T.String(),created_at:T.String(),created_by:T.Union([T.String(),T.Null()])},{additionalProperties:false}))},{additionalProperties:false});
export const RouterCommandInput=T.Object({command:T.String({maxLength:200})},{additionalProperties:false});
export const RouterCommandOutput=T.Object({ok:T.Boolean(),output:T.String()},{additionalProperties:false});
export const ApprovalInput=T.Object({approved:T.Boolean()},{additionalProperties:false});
export const OmadaUrlInput=T.Object({url:T.Union([T.String({maxLength:300}),T.Null()])},{additionalProperties:false});
// Host facts an administrator captures on the VPS. No secret belongs here: the
// service accepts only the known keys and refuses anything else.
export const PreflightInput=T.Object({
 ipForward:T.Optional(T.String({maxLength:20})),
 wgManager:T.Optional(T.Union([T.Literal('wg-quick'),T.Literal('systemd-networkd'),T.Literal('manual'),T.Literal('unknown')])),
 wgUnit:T.Optional(T.String({maxLength:200})),wgUnitEnabled:T.Optional(T.Boolean()),wgUnitActive:T.Optional(T.Boolean()),
 wgConfigPath:T.Optional(T.String({maxLength:300})),
 runtimeAllowedIps:T.Optional(T.String({maxLength:500})),persistentAllowedIps:T.Optional(T.String({maxLength:500})),
 wgConfDirectives:T.Optional(T.Array(T.String({maxLength:500}),{maxItems:50})),
 routeToTarget:T.Optional(T.String({maxLength:500})),adminPortFree:T.Optional(T.Boolean()),
 hostFirewall:T.Optional(T.String({maxLength:300})),adminPortReachable:T.Optional(T.Boolean()),adminPortProbe:T.Optional(T.String({maxLength:300})),
 peerPublicKey:T.Optional(T.String({maxLength:100})),
},{additionalProperties:false});
