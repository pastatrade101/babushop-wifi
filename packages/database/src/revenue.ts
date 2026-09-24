import {pool,requireValue,SITE} from './index.ts';

type Channel='cash'|'azampay'|'other';
type ChannelTotals={channel:Channel;gross_tzs:number;reversals_tzs:number;sales_count:number;vouchers_sold:number};

/** Sale receipts are the revenue ledger. Payment attempts are only attribution:
 * adding their amounts would count every successful online purchase twice.
 * Reversals belong to the day they were recorded, including reversals of older
 * sales. All bounds are midnight in the shop's Tanzania timezone.
 */
export async function revenueSummary(from?:string,to?:string){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const start=from||today,end=to||today;
 requireValue(start<=end,400,'Start date must be on or before end date');
 const {rows}=await pool.query<ChannelTotals>(`with bounds as (
   select $1::date::timestamp at time zone 'Africa/Dar_es_Salaam' start_at,
    ($2::date+1)::timestamp at time zone 'Africa/Dar_es_Salaam' end_at
  ), period_events as (
   select s.id sale_id,s.total_tzs::bigint gross_tzs,0::bigint reversals_tzs,1 sales_count,
    (select count(*) from wifi.manual_sale_items i where i.sale_id=s.id) vouchers_sold
   from wifi.manual_sales s,bounds
   where s.site_id=$3 and s.created_at>=start_at and s.created_at<end_at
   union all
   select s.id,0,s.total_tzs,0,0
   from wifi.sale_reversals r join wifi.manual_sales s on s.id=r.sale_id,bounds
   where s.site_id=$3 and r.created_at>=start_at and r.created_at<end_at
  )
  select case when s.channel='COUNTER' and s.payment_method='CASH' then 'cash'
    when p.provider='azam' and p.status='PAID' then 'azampay' else 'other' end channel,
   sum(e.gross_tzs)::float8 gross_tzs,sum(e.reversals_tzs)::float8 reversals_tzs,
   sum(e.sales_count)::int sales_count,sum(e.vouchers_sold)::int vouchers_sold
  from period_events e join wifi.manual_sales s on s.id=e.sale_id
  left join wifi.payment_intents p on p.sale_id=s.id and p.site_id=s.site_id
  group by 1`,[start,end,SITE]);
 const empty={gross_tzs:0,reversals_tzs:0,sales_count:0,vouchers_sold:0};
 const channels:Record<Channel,typeof empty>={cash:{...empty},azampay:{...empty},other:{...empty}};
 for(const row of rows)channels[row.channel]=row;
 const total=rows.reduce((sum,row)=>({gross_tzs:sum.gross_tzs+row.gross_tzs,reversals_tzs:sum.reversals_tzs+row.reversals_tzs,sales_count:sum.sales_count+row.sales_count,vouchers_sold:sum.vouchers_sold+row.vouchers_sold}),{...empty});
 return {
  from:start,to:end,...total,net_tzs:total.gross_tzs-total.reversals_tzs,
  cash_gross_tzs:channels.cash.gross_tzs,cash_reversals_tzs:channels.cash.reversals_tzs,cash_net_tzs:channels.cash.gross_tzs-channels.cash.reversals_tzs,
  azampay_gross_tzs:channels.azampay.gross_tzs,azampay_reversals_tzs:channels.azampay.reversals_tzs,azampay_net_tzs:channels.azampay.gross_tzs-channels.azampay.reversals_tzs,azampay_sales_count:channels.azampay.sales_count,
  other_gross_tzs:channels.other.gross_tzs,other_reversals_tzs:channels.other.reversals_tzs,other_net_tzs:channels.other.gross_tzs-channels.other.reversals_tzs,
 };
}
