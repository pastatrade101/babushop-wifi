import Fastify from 'fastify';
import {networkPlan,validateSpeeds,checkMikroTik} from '../../../packages/network/src/index.ts';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {Type as T} from '@sinclair/typebox';
import {createClient} from '@supabase/supabase-js';
import {pool,tx,audit,Problem,requireValue,SITE,type Staff} from '../../../packages/database/src/index.ts';
import * as sales from '../../../packages/database/src/sales.ts';
import * as access from '../../../packages/database/src/access.ts';
import * as purchases from '../../../packages/database/src/purchases.ts';
import * as catalogue from '../../../packages/database/src/catalogue.ts';
import {paymentProvider} from '../../../packages/payments/src/index.ts';
import {digest,csvCell} from '../../../packages/database/src/crypto.ts';
import {type Adapter,adapterFromEnv} from '../../../packages/omada/src/index.ts';
import * as S from '../../../packages/contracts/src/index.ts';
import {registerNetwork} from './network.ts';
declare module 'fastify' {interface FastifyRequest {staff:Staff|null;}}
export async function buildApp(options:{adapter?:Adapter;verifyToken?:(token:string)=>Promise<string|null>;logger?:boolean}={}){
 const adapter=options.adapter||adapterFromEnv();const app=Fastify({logger:options.logger?{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie'],serializers:{req:r=>({method:r.method,url:r.url.split('?')[0],id:r.id}),err:()=>({type:'Error',message:'Request failed',stack:''})}}:false,bodyLimit:16384,trustProxy:process.env.TRUST_PROXY||false,ajv:{customOptions:{removeAdditional:false}}});
 const supabase=options.verifyToken?null:createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const verify=options.verifyToken||(async(token:string)=>{const {data,error}=await supabase!.auth.getUser(token);return error?null:data.user?.id||null;});
 app.decorateRequest('staff',null);
 // Keep the raw JSON alongside the parsed body: the payment webhook's HMAC is
 // computed over the exact bytes sent, which re-serializing would not reproduce.
 app.addContentTypeParser('application/json',{parseAs:'string'},(req:any,body,done)=>{req.rawBody=body;try{done(null,body?JSON.parse(body as string):{});}catch{done(new Problem(400,'Invalid JSON body'),undefined);}});
 await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"]}}});
 await app.register(rateLimit,{max:600,timeWindow:'1 minute',keyGenerator:r=>r.ip});
 await app.register(swagger,{openapi:{info:{title:'BABU-SHOP WIFI API',version:'1.0.0'},components:{securitySchemes:{staffToken:{type:'http',scheme:'bearer'}}}}});
 app.setErrorHandler((error,_req,reply)=>{const e=error as any;const status=e instanceof Problem?e.status:e.validation?400:e.statusCode===429?429:500;reply.code(status).send({error:status===500?'Unable to complete the request. Please try again.':e.validation?'Check the submitted fields.':status===429?'Too many attempts. Please wait and try again.':e.message});});
 app.addHook('onRequest',async(req,reply)=>{reply.header('Cache-Control','no-store');if(['POST','PATCH','DELETE','PUT'].includes(req.method)&&req.headers.origin&&req.headers.origin!==process.env.APP_ORIGIN)throw new Problem(403,'Origin not allowed');
 const path=req.url.split('?')[0];if(path.startsWith('/health/')||path.startsWith('/api/v1/portal/'))return;
 const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];requireValue(token,401,'Staff login required');let id:string|null=null;try{id=await verify(token);}catch{throw new Problem(503,'Authentication unavailable');}requireValue(id,401,'Staff login required');const staff=(await pool.query('select id,display_name,role,enabled from wifi.staff_profiles where id=$1',[id])).rows[0];requireValue(staff?.enabled,403,'Staff access is disabled or unavailable');req.staff=staff;
 if(path.startsWith('/docs')||path==='/api/v1/openapi.json')requireValue(staff.role==='ADMIN',403,'Administrator permission required');
 });
 app.get('/docs',async(_req,reply)=>reply.type('text/html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>BABU-SHOP WIFI API</title><h1>BABU-SHOP WIFI API</h1><p>Administrator bearer authentication is required. Download the OpenAPI schema at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> and import it into your API client.</p></html>')); 
 const admin=async(req:any)=>requireValue(req.staff?.role==='ADMIN',403,'Administrator permission required');
 const schema=(body?:any,response:any=S.Row,extra:object={})=>({...(body?{body}:{}),response:{200:response,'4xx':S.ErrorResponse,'5xx':S.ErrorResponse},...extra});
 const route=(method:any,url:string,body:any,response:any,handler:any,isAdmin=false,extra:any={})=>app.route({method,url:'/api/v1'+url,schema:schema(body,response,extra.schema||{}),...(isAdmin?{preHandler:admin}:{}),config:extra.config||{},handler});
 const paged=async(sql:string,values:any[],q:any)=>{const page=q.page||1;const rows=(await pool.query(`select * from (${sql}) listed order by created_at ${q.sort==='oldest'?'asc':'desc'} limit 26 offset $${values.length+1}`,[...values,(page-1)*25])).rows;return {items:rows.slice(0,25),page,has_more:rows.length>25};};
 app.get('/health/live',{schema:schema(undefined,S.OK)},async()=>({ok:true}));
 app.get('/health/ready',{schema:schema(undefined,S.OK)},async()=>{await pool.query('select 1 from wifi.sites limit 1');return {ok:true};});
 route('GET','/openapi.json',undefined,T.Any(),async()=>app.swagger(),true);
 route('GET','/me',undefined,S.Row,async(r:any)=>r.staff);
 route('GET','/runtime',undefined,T.Object({mode:T.String(),provider:T.String(),radius_enabled:T.Boolean()}),async()=>({mode:adapter.mode,provider:process.env.NETWORK_PROVIDER||'omada',radius_enabled:adapter.mode==='live'&&process.env.NETWORK_PROVIDER==='mikrotik'&&process.env.MIKROTIK_RADIUS_ENABLED==='true'}));
 route('GET','/packages',undefined,S.List,async(r:any)=>{const q=r.query;return paged(`select p.*, (select count(*)::int from wifi.vouchers v where v.package_id=p.id and inventory_state='AVAILABLE' and (reserved_until is null or reserved_until<now())) available from wifi.packages p where site_id=$1 and name ilike $2 ${r.staff.role==='CASHIER'?'and active':''}`,[SITE,'%'+(q.q||'')+'%'],q);},false,{schema:{querystring:S.Paging}});
 route('POST','/packages',S.PackageInput,S.Row,async(r:any)=>tx(async db=>{const b=r.body;let speeds;try{speeds=validateSpeeds(b);}catch(e){throw new Problem(400,(e as Error).message);}const p=(await db.query('insert into wifi.packages(site_id,name,description,price_tzs,duration_minutes,active,download_mbps,upload_mbps) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[SITE,b.name,b.description||'',b.price_tzs,b.duration_minutes,b.active??true,speeds.download_mbps,speeds.upload_mbps])).rows[0];await audit(db,r.staff.id,'PACKAGE_CREATED',p.id);return p;}),true);
 route('PATCH','/packages/:id',S.PackageInput,S.Row,async(r:any)=>tx(async db=>{const b=r.body;let speeds;try{speeds=validateSpeeds(b);}catch(e){throw new Problem(400,(e as Error).message);}const p=(await db.query('update wifi.packages set name=$2,description=$3,price_tzs=$4,duration_minutes=$5,active=$6,download_mbps=$8,upload_mbps=$9,updated_at=now() where id=$1 and site_id=$7 returning *',[r.params.id,b.name,b.description||'',b.price_tzs,b.duration_minutes,b.active??true,SITE,speeds.download_mbps,speeds.upload_mbps])).rows[0];requireValue(p,404,'Package not found');await audit(db,r.staff.id,'PACKAGE_UPDATED',p.id);return p;}),true,{schema:{params:S.Params}});
 route('POST','/packages/bulk',S.BulkPackageInput,T.Object({created:T.Integer(),items:T.Array(S.Row)},{additionalProperties:false}),async(r:any)=>catalogue.bulkCreate(r.staff,r.body.items),true,{config:{rateLimit:{max:10,timeWindow:'1 minute'}}});
 route('POST','/voucher-batches',S.BatchInput,S.Row,async(r:any)=>sales.generateBatch(r.staff,r.body),true);
 route('GET','/voucher-batches',undefined,S.List,async(r:any)=>paged('select * from wifi.voucher_batches where label ilike $1',['%'+(r.query.q||'')+'%'],r.query),true,{schema:{querystring:S.Paging}});
 route('GET','/voucher-batches/:id',undefined,S.Row,async(r:any)=>{const b=(await pool.query('select * from wifi.voucher_batches where id=$1',[r.params.id])).rows[0];requireValue(b,404,'Batch not found');return b;},true,{schema:{params:S.Params}});
 route('GET','/vouchers',undefined,S.List,async(r:any)=>paged(`select v.id,v.site_id,v.batch_id,v.package_id,v.code_mask,v.package_name,v.price_tzs,v.duration_minutes,v.download_mbps,v.upload_mbps,v.inventory_state,v.created_at,g.state from wifi.vouchers v left join wifi.access_grants g on g.voucher_id=v.id where (v.code_mask ilike $1 or v.package_name ilike $1) and ($2='' or v.inventory_state=$2 or g.state=$2) and ($3::uuid is null or v.package_id=$3::uuid)`,['%'+(r.query.q||'')+'%',r.query.state||'',r.query.package_id||null],r.query),false,{schema:{querystring:S.Paging}});
 route('POST','/vouchers/:id/reveal',T.Object({},{additionalProperties:false}),S.SecretRows,async(r:any)=>({items:await sales.reveal(r.staff,{voucher_id:r.params.id})}),true,{schema:{params:S.Params},config:{rateLimit:{max:30,timeWindow:'1 minute'}}});
 route('POST','/vouchers/:id/void',S.Reason,S.OK,async(r:any)=>sales.voidVoucher(r.staff,r.params.id,r.body.reason),true,{schema:{params:S.Params}});
 route('POST','/voucher-batches/:id/print',T.Object({},{additionalProperties:false}),S.SecretRows,async(r:any)=>({items:await sales.reveal(r.staff,{batch_id:r.params.id},'BATCH_PRINTED')}),true,{schema:{params:S.Params},config:{rateLimit:{max:15,timeWindow:'1 minute'}}});
 route('POST','/voucher-batches/:id/issue',T.Object({},{additionalProperties:false}),T.Object({issued:T.Integer(),total_tzs:T.Number(),items:T.Array(S.Row)},{additionalProperties:false}),async(r:any)=>sales.issueBatch(r.staff,r.params.id),true,{schema:{params:S.Params},config:{rateLimit:{max:15,timeWindow:'1 minute'}}});
 route('POST','/voucher-batches/:id/export',T.Object({},{additionalProperties:false}),T.String(),async(r:any,reply:any)=>{const rows=await sales.reveal(r.staff,{batch_id:r.params.id},'BATCH_EXPORTED');reply.type('text/csv').header('Content-Disposition','attachment; filename="vouchers.csv"');return ['code,package,price_tzs,duration_minutes',...rows.map(v=>[v.code,v.package_name,v.price_tzs,v.duration_minutes].map(csvCell).join(','))].join('\r\n');},true,{schema:{params:S.Params},config:{rateLimit:{max:10,timeWindow:'1 minute'}}});
 route('POST','/sales/reserve',S.ReservationInput,T.Object({...S.Row.properties,items:T.Array(S.Row)},{additionalProperties:false}),async(r:any)=>sales.reserve(r.staff,r.body));
 route('POST','/sales',S.SaleInput,S.Row,async(r:any)=>sales.sell(r.staff,r.body,r.headers['idempotency-key']),false,{schema:{headers:T.Object({'idempotency-key':S.Id})}});
 route('GET','/sales',undefined,S.List,async(r:any)=>paged(`select s.*, i.provider, i.network, i.reference payment_reference from wifi.manual_sales s
   left join wifi.payment_intents i on i.sale_id=s.id
   where ($1::boolean or cashier_id=$2) and (receipt_number ilike $3 or customer_phone ilike $3 or i.reference ilike $3)`,[r.staff.role==='ADMIN',r.staff.id,'%'+(r.query.q||'')+'%'],r.query),false,{schema:{querystring:S.Paging}});
 route('GET','/sales/:id',undefined,T.Object({...S.Row.properties,items:T.Array(S.Row)},{additionalProperties:false}),async(r:any)=>sales.saleDetail(r.staff,r.params.id),false,{schema:{params:S.Params}});
 route('POST','/sales/:id/print',T.Object({},{additionalProperties:false}),S.SecretRows,async(r:any)=>({items:await sales.reveal(r.staff,{sale_id:r.params.id},'SALE_PRINTED')}),false,{schema:{params:S.Params},config:{rateLimit:{max:30,timeWindow:'1 minute'}}});
 route('POST','/sales/:id/reverse',S.Reason,S.Row,async(r:any)=>sales.reverse(r.staff,r.params.id,r.body.reason),true,{schema:{params:S.Params}});
 route('GET','/access-grants',undefined,S.List,async(r:any)=>paged('select g.*,v.code_mask,v.package_name from wifi.access_grants g join wifi.vouchers v on v.id=g.voucher_id where ($1=\'\' or g.state=$1)',[r.query.state||''],r.query),true,{schema:{querystring:S.Paging}});
 route('GET','/sessions',undefined,S.List,async(r:any)=>paged(`select s.id,s.session_id,s.created_at,s.last_seen_at,s.stopped_at,s.terminate_cause,
 s.session_seconds::float8,s.upload_bytes::text,s.download_bytes::text,g.client_mac,v.code_mask,v.package_name,g.proposed_expires_at,
 case when s.stopped_at is not null then 'STOPPED' when g.state='REVOKED' then 'REVOKED_PENDING_DISCONNECT' when g.proposed_expires_at<=now() then 'EXPIRED' when s.last_seen_at<now()-interval '3 minutes' then 'STALE' else 'RECENTLY_REPORTED' end session_state
 from wifi.network_sessions s join wifi.access_grants g on g.id=s.grant_id join wifi.vouchers v on v.id=g.voucher_id
 where (v.code_mask ilike $1 or v.package_name ilike $1 or g.client_mac ilike $1)`,['%'+(r.query.q||'')+'%'],r.query),true,{schema:{querystring:S.Paging}});
 route('GET','/authorization-attempts',undefined,S.List,async(r:any)=>paged('select id,grant_id,deadline,state,evidence,review_note,reviewed_by,created_at,updated_at from wifi.authorization_attempts where ($1=\'\' or state=$1)',[r.query.state||''],r.query),true,{schema:{querystring:S.Paging}});
 route('POST','/access-grants/:id/revoke',S.Reason,S.OK,async(r:any)=>access.revoke(r.staff,r.params.id,r.body.reason),true,{schema:{params:S.Params}});
 route('POST','/authorization-attempts/:id/review',T.Object({decision:T.Union([T.Literal('ACCEPTED'),T.Literal('REJECTED')]),reason:T.String({minLength:10,maxLength:500})},{additionalProperties:false}),S.OK,async(r:any)=>access.review(r.staff,r.params.id,r.body),true,{schema:{params:S.Params}});
 const totals=async(from?:string,to?:string)=>{const row=(await pool.query(`with bounds as (select coalesce($1::date,(now() at time zone 'Africa/Dar_es_Salaam')::date)::timestamp at time zone 'Africa/Dar_es_Salaam' start_at,(coalesce($2::date,(now() at time zone 'Africa/Dar_es_Salaam')::date)+1)::timestamp at time zone 'Africa/Dar_es_Salaam' end_at)
 select (select coalesce(sum(total_tzs),0)::float8 from wifi.manual_sales,bounds where created_at>=start_at and created_at<end_at) gross_tzs,(select coalesce(sum(s.total_tzs),0)::float8 from wifi.sale_reversals r join wifi.manual_sales s on s.id=r.sale_id,bounds where r.created_at>=start_at and r.created_at<end_at) reversals_tzs,(select count(*)::int from wifi.manual_sale_items i join wifi.manual_sales s on s.id=i.sale_id,bounds where s.created_at>=start_at and s.created_at<end_at) vouchers_sold`,[from||null,to||null])).rows[0];return {...row,net_tzs:row.gross_tzs-row.reversals_tzs};};
 const inventory=async()=> (await pool.query("select count(*) filter(where inventory_state='AVAILABLE')::int stock,count(*) filter(where inventory_state='SOLD' and g.id is null)::int sold_unused,count(*) filter(where g.state='ACTIVE' and g.proposed_expires_at>now())::int active,count(*) filter(where g.state='NEEDS_REVIEW')::int needs_review from wifi.vouchers v left join wifi.access_grants g on g.voucher_id=v.id")).rows[0];
 route('GET','/dashboard',undefined,S.Row,async(r:any)=>r.staff.role==='ADMIN'?{...await totals(),...await inventory()}:await inventory());
 route('GET','/reports/sales',undefined,S.Row,async(r:any)=>totals(r.query.from,r.query.to),true,{schema:{querystring:S.Paging}});
 route('GET','/reports/inventory',undefined,S.Row,inventory,true);
 // Daily buckets in shop time, zero-filled so a quiet day is a gap at zero
 // rather than a missing point the chart would interpolate straight through.
 route('GET','/reports/trend',undefined,S.Trend,async(r:any)=>{
  const days=Math.min(Math.max(Number(r.query.days)||30,7),180);
  const rows=(await pool.query(`with span as (
    select generate_series(((now() at time zone 'Africa/Dar_es_Salaam')::date-($1::int-1)),(now() at time zone 'Africa/Dar_es_Salaam')::date,interval '1 day')::date d)
   select to_char(d,'YYYY-MM-DD') as "day",
    coalesce((select sum(s.total_tzs) from wifi.manual_sales s where (s.created_at at time zone 'Africa/Dar_es_Salaam')::date=d),0)::float8 gross_tzs,
    coalesce((select sum(s.total_tzs) from wifi.sale_reversals v join wifi.manual_sales s on s.id=v.sale_id where (v.created_at at time zone 'Africa/Dar_es_Salaam')::date=d),0)::float8 reversed_tzs,
    coalesce((select count(*) from wifi.manual_sale_items i join wifi.manual_sales s on s.id=i.sale_id where (s.created_at at time zone 'Africa/Dar_es_Salaam')::date=d),0)::int vouchers_sold
   from span order by d`,[days])).rows;
  return {items:rows.map(v=>({day:v.day,gross_tzs:v.gross_tzs,net_tzs:v.gross_tzs-v.reversed_tzs,vouchers_sold:v.vouchers_sold}))};
 },true,{schema:{querystring:S.TrendQuery}});
 // Revenue by package. Capped at ten bars: past that a ranked bar chart stops
 // being readable, and the remainder is rolled into one "Other" row.
 route('GET','/reports/by-package',undefined,S.PackageBreakdown,async(r:any)=>{
  const days=Math.min(Math.max(Number(r.query.days)||30,7),180);
  const rows=(await pool.query(`select i.package_name,count(*)::int vouchers,sum(i.price_tzs)::float8 revenue_tzs
   from wifi.manual_sale_items i join wifi.manual_sales s on s.id=i.sale_id
   where s.created_at>=(now() at time zone 'Africa/Dar_es_Salaam')::date-($1::int-1)
   group by 1 order by revenue_tzs desc`,[days])).rows;
  if(rows.length<=10)return {items:rows};
  const rest=rows.slice(10).reduce((a,v)=>({vouchers:a.vouchers+v.vouchers,revenue_tzs:a.revenue_tzs+v.revenue_tzs}),{vouchers:0,revenue_tzs:0});
  return {items:[...rows.slice(0,10),{package_name:'Other',...rest}]};
 },true,{schema:{querystring:S.TrendQuery}});
 route('GET','/staff',undefined,S.List,async(r:any)=>paged('select id,display_name,role,enabled,created_at from wifi.staff_profiles where display_name ilike $1',['%'+(r.query.q||'')+'%'],r.query),true,{schema:{querystring:S.Paging}});
 route('PATCH','/staff/:id',T.Object({role:T.Union([T.Literal('ADMIN'),T.Literal('CASHIER')]),enabled:T.Boolean()},{additionalProperties:false}),S.Row,async(r:any)=>tx(async db=>{requireValue(r.params.id!==r.staff.id,409,'Ask another administrator to change your own access');await db.query('select pg_advisory_xact_lock(884421)');const p=(await db.query('update wifi.staff_profiles set role=$2,enabled=$3 where id=$1 returning id,display_name,role,enabled',[r.params.id,r.body.role,r.body.enabled])).rows[0];requireValue(p,404,'Staff member not found');await audit(db,r.staff.id,'STAFF_ACCESS_CHANGED',p.id,r.body);return p;}),true,{schema:{params:S.Params}});
 route('GET','/audit',undefined,S.List,async(r:any)=>paged('select id,actor_id,action,entity_id,created_at from wifi.audit_logs',[],r.query),true,{schema:{querystring:S.Paging}});
 const integrationSchema=T.Object({mode:T.String(),message:T.String(),last_check:T.Union([T.String(),T.Null()]),ok:T.Union([T.Boolean(),T.Null()]),capabilities:T.Object({mode:T.String(),expiry:T.String(),profile:T.Optional(T.String()),lookup:T.String(),disconnect:T.String(),reconciliation:T.String(),rateLimits:T.Boolean()})});
 registerNetwork(route as any);
 route('GET','/integrations/network/status',undefined,T.Object({provider:T.String(),download_mbps:T.Number(),upload_mbps:T.Union([T.Number(),T.Null()]),commissioned:T.Boolean(),radius_enabled:T.Boolean(),message:T.Union([T.String(),T.Null()]),configured:T.Boolean(),last_check:T.Union([T.String(),T.Null()]),ok:T.Union([T.Boolean(),T.Null()])}),async()=>{const plan=networkPlan();const a=(await pool.query("select created_at,details from wifi.audit_logs where action='MIKROTIK_CHECK' order by created_at desc limit 1")).rows[0];return {...plan,radius_enabled:process.env.MIKROTIK_RADIUS_ENABLED==='true'&&process.env.OMADA_MODE==='live',message:a?.details.message||null,configured:!!(process.env.MIKROTIK_BASE_URL&&process.env.MIKROTIK_USERNAME&&process.env.MIKROTIK_PASSWORD),last_check:a?.created_at?.toISOString()||null,ok:a?.details.ok??null};},true);
 route('POST','/integrations/mikrotik/test',T.Object({},{additionalProperties:false}),S.OK,async(r:any)=>{const result=await checkMikroTik();await audit(pool,r.staff.id,'MIKROTIK_CHECK',null,result);return result;},true,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}});
 route('GET','/integrations/omada/status',undefined,integrationSchema,async()=>{const a=(await pool.query("select created_at,details from wifi.audit_logs where action='OMADA_TEST' order by created_at desc limit 1")).rows[0];return {mode:adapter.mode,message:adapter.mode==='mock'?'Simulation mode — no real internet authorization':'Live mode — commissioning required for each controller/AP change',last_check:a?.created_at?.toISOString()||null,ok:a?.details.ok??null,capabilities:adapter.capabilities()};},true);
 route('POST','/integrations/omada/test',T.Object({},{additionalProperties:false}),S.OK,async(r:any)=>{const result=await adapter.test();await audit(pool,r.staff.id,'OMADA_TEST',null,result);return result;},true,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}});
 route('POST','/portal/context',S.ContextInput,T.Object({context_token:T.String(),expires_in:T.Integer()}),async(r:any)=>access.createContext(r.body),false,{config:{rateLimit:{max:300,timeWindow:'1 minute'}}});
 route('POST','/portal/redeem',T.Object({code:T.String({minLength:16,maxLength:40}),context_token:S.Text(100)},{additionalProperties:false}),T.Object({status_token:T.String(),state:T.String()}),async(r:any)=>access.redeem(r.body.code,r.body.context_token),false,{config:{rateLimit:{hook:'preHandler',max:15,timeWindow:'1 minute',keyGenerator:(r:any)=>digest(r.body?.context_token||r.ip,'PORTAL_CONTEXT_SECRET')}}});
 route('POST','/portal/status',T.Object({status_token:S.Text(100)},{additionalProperties:false}),T.Object({state:T.String(),expires_at:T.Union([T.String(),T.Null()]),attempt_state:T.Union([T.String(),T.Null()])}),async(r:any)=>access.status(r.body.status_token),false,{config:{rateLimit:{hook:'preHandler',max:120,timeWindow:'1 minute',keyGenerator:(r:any)=>digest(r.body?.status_token||r.ip,'PORTAL_CONTEXT_SECRET')}}});
 // Self-service purchase. Unauthenticated by design -- a customer buying a
 // voucher has no account. Cash sales at the counter are unaffected.
 // The shop tells the page how to pay, not who takes the money: `flow` decides
 // whether the buyer is sent away or prompted on their handset, and `networks`
 // is only non-empty when we have to ask which one to push to.
 route('GET','/portal/shop',undefined,T.Object({enabled:T.Boolean(),flow:T.String(),networks:T.Array(T.Object({value:T.String(),label:T.String()},{additionalProperties:false})),items:T.Array(T.Any())},{additionalProperties:false}),async()=>{
  const provider=paymentProvider();
  return {enabled:!!provider,flow:provider?.flow||'redirect',networks:provider?.networks||[],...(provider?await purchases.catalogue():{items:[]})};
 },false,{config:{rateLimit:{max:120,timeWindow:'1 minute'}}});
 // Every payment attempt, settled or not. A customer who says "I paid and got
 // nothing" is looking for a row that never became a sale.
 route('GET','/payments',undefined,S.List,async(r:any)=>purchases.attempts(r.query),false,{schema:{querystring:S.Paging}});
 route('POST','/portal/purchase',S.PurchaseInput,T.Object({reference:T.String(),claim_token:T.String(),checkout_url:T.Union([T.String(),T.Null()]),flow:T.String(),instruction:T.Union([T.String(),T.Null()]),amount_tzs:T.Integer(),expires_at:T.String()},{additionalProperties:false}),async(r:any)=>purchases.start(r.body),false,{config:{rateLimit:{max:10,timeWindow:'1 minute'}}});
 route('POST','/portal/purchase/status',S.ClaimInput,T.Object({status:T.String(),code:T.Union([T.String(),T.Null()]),package_name:T.Union([T.String(),T.Null()]),duration_minutes:T.Optional(T.Integer()),message:T.Union([T.String(),T.Null()])},{additionalProperties:false}),async(r:any)=>purchases.status(r.body.claim_token),false,{config:{rateLimit:{hook:'preHandler',max:120,timeWindow:'1 minute',keyGenerator:(r:any)=>digest(r.body?.claim_token||r.ip,'PORTAL_CONTEXT_SECRET')}}});
 // Our own callback endpoint, on our own domain. Authenticated by the provider's
 // own scheme, not a staff token. Always answers 200 once authentic, so the
 // provider stops retrying a delivered event; failures are recorded rather than
 // surfaced to the provider.
 const deliver=async(r:any,reply:any)=>{
  try{return await purchases.webhook(r.rawBody??'',r.headers);}
  catch(e:any){const status=e instanceof Problem?e.status:500;if(status===401)return reply.code(401).send({error:'Invalid signature'});app.log?.error?.({err:'webhook'},'payment webhook failed');return reply.code(status===400?400:500).send({error:'Could not process the event'});}
 };
 app.post('/api/v1/portal/payments/webhook/snippe',{config:{rateLimit:{max:240,timeWindow:'1 minute'}}},deliver);
 // AzamPay does not sign its callbacks, so the secret is the last path segment
 // of the URL registered with them. It is moved into a header before the
 // provider verifies it, so the check lives with the provider and the secret
 // never has to be re-read here.
 app.post('/api/v1/portal/payments/webhook/azam/:token',{config:{rateLimit:{max:240,timeWindow:'1 minute'}}},async(r:any,reply:any)=>{
  r.headers['x-callback-token']=r.headers['x-callback-token']||String(r.params.token||'');
  return deliver(r,reply);
 });
 return app;
}
