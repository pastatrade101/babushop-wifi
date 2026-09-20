import {Type as T} from '@sinclair/typebox';
export const Id=T.String({format:'uuid'});
export const Text=(max=100)=>T.String({minLength:1,maxLength:max});
export const Reason=T.Object({reason:T.String({minLength:3,maxLength:500})},{additionalProperties:false});
export const PackageInput=T.Object({name:Text(),description:T.Optional(T.String({maxLength:1000})),price_tzs:T.Integer({minimum:1,maximum:10000000}),duration_minutes:T.Integer({minimum:1,maximum:525600}),download_mbps:T.Optional(T.Union([T.Integer({minimum:1,maximum:10000}),T.Null()])),upload_mbps:T.Optional(T.Union([T.Integer({minimum:1,maximum:10000}),T.Null()])),active:T.Optional(T.Boolean())},{additionalProperties:false});
export const BatchInput=T.Object({package_id:Id,quantity:T.Integer({minimum:1,maximum:1000}),label:T.Optional(T.String({maxLength:100}))},{additionalProperties:false});
export const ReservationInput=T.Object({package_id:Id,quantity:T.Integer({minimum:1,maximum:100})},{additionalProperties:false});
export const SaleInput=T.Object({reservation_id:Id,cash_received:T.Boolean(),customer_name:T.Optional(T.String({maxLength:100})),customer_phone:T.Optional(T.String({maxLength:30})),notes:T.Optional(T.String({maxLength:500}))},{additionalProperties:false});
export const ContextInput=T.Object({clientMac:Text(32),apMac:Text(32),ssidName:Text(64),radioId:Text(2),site:Text(100),clientIp:T.Optional(Text(64))},{additionalProperties:false});
// Self-service purchase. The phone is optional and only forwarded to the payment
// provider so the buyer recognises the charge; it is never required to buy.
export const PurchaseInput=T.Object({package_id:Id,phone:T.Optional(T.String({maxLength:30}))},{additionalProperties:false});
// The claim token is the buyer's only handle on their purchase. It is POSTed,
// never placed in a URL, so it cannot leak through history, logs or a referrer.
export const ClaimInput=T.Object({claim_token:Text(200)},{additionalProperties:false});
export const Paging=T.Object({page:T.Optional(T.Integer({minimum:1,maximum:100000})),q:T.Optional(T.String({maxLength:100})),state:T.Optional(T.String({maxLength:30})),sort:T.Optional(T.Union([T.Literal('newest'),T.Literal('oldest')])),from:T.Optional(T.String({format:'date'})),to:T.Optional(T.String({format:'date'}))},{additionalProperties:false});
export const Params=T.Object({id:Id},{additionalProperties:false});
// Explicit selected columns are the response allowlist. Nested JSON is confined to sanitized evidence.
const nullableString=T.Union([T.String(),T.Null()]);
const fields:Record<string,any>={};
for(const name of ['id','site_id','package_id','batch_id','created_by','cashier_id','reservation_id','sale_id','voucher_id','grant_id','reviewed_by','actor_id','entity_id','name','description','label','role','display_name','code_mask','package_name','inventory_state','policy','receipt_number','cashier_name','currency','payment_method','client_mac','state','action','code','message','provider','session_id','session_state','upload_bytes','download_bytes'])fields[name]=T.Optional(T.String());
for(const name of ['created_at','updated_at','sold_at','expires_at','activated_at','proposed_expires_at','deadline','reversal_reason','reason','review_note','customer_name','customer_phone','notes','last_seen_at','stopped_at','terminate_cause'])fields[name]=T.Optional(nullableString);
for(const name of ['price_tzs','duration_minutes','quantity','total_tzs','available','count','stock','sold_unused','active','needs_review','gross_tzs','reversals_tzs','net_tzs','vouchers_sold','session_seconds'])fields[name]=T.Optional(T.Number());
fields.download_mbps=T.Optional(T.Union([T.Number(),T.Null()]));fields.upload_mbps=T.Optional(T.Union([T.Number(),T.Null()]));
fields.active=T.Optional(T.Union([T.Boolean(),T.Number()]));fields.enabled=T.Optional(T.Boolean());fields.evidence=T.Optional(T.Object({code:T.Optional(T.String())},{additionalProperties:false}));
export const Row=T.Object(fields,{additionalProperties:false});
export const List=T.Object({items:T.Array(Row),page:T.Integer(),has_more:T.Boolean()},{additionalProperties:false});
export const OK=T.Object({ok:T.Boolean(),message:T.Optional(T.String())},{additionalProperties:false});
export const ErrorResponse=T.Object({error:T.String()},{additionalProperties:false});
export const SecretRows=T.Object({items:T.Array(Row)},{additionalProperties:false});
