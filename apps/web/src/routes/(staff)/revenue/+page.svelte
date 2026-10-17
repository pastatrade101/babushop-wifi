<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import TrendChart from '$lib/components/TrendChart.svelte';
import RankChart from '$lib/components/RankChart.svelte';
let {data}=$props();
const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(n||0);
const compact=(n:number)=>Math.abs(n)>=1000000?(n/1000000).toFixed(1)+'M':Math.abs(n)>=1000?Math.round(n/1000)+'k':String(Math.round(n));
const day=(value:string)=>new Intl.DateTimeFormat('en-TZ',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
// The all-time collections card: a summary the owner can paste to the payment partner.
const NETWORKS:Record<string,string>={vodacom:'M-Pesa',airtel:'Airtel Money',tigo:'Mixx by Yas',halopesa:'HaloPesa',azampesa:'AzamPesa',other:'Other'};
const netLabel=(n:string)=>NETWORKS[n]??n;
/** An instant's calendar date in Dar es Salaam, as day() expects it. */
const darDate=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam'}).format(new Date(iso));
let copied=$state(false);
async function copyClaim(){
 const c=data.collections;if(!c)return;
 const range=c.first_paid_at?` (${day(darDate(c.first_paid_at))} – ${day(darDate(c.last_paid_at!))})`:'';
 const text=`${data.brand}: mobile money collected through source "${c.source}", all time: TZS ${money(c.total_tzs)} from ${c.payments} successful payment${c.payments===1?'':'s'}${range}.`+c.networks.map((n:any)=>`\n- ${netLabel(n.network)}: TZS ${money(n.total_tzs)} (${n.payments})`).join('');
 try{await navigator.clipboard.writeText(text);copied=true;setTimeout(()=>copied=false,2000);}catch{/* the figures stay on screen */}
}
</script>
<svelte:head><title>Revenue · {data.brand}</title></svelte:head>
<div class="page-heading"><div><h1>Revenue</h1><p>Cash sales and verified AzamPay revenue, with reversals accounted for.</p></div><a class="button secondary" href="/sales"><Icon name="sales" size={18}/> View sales</a></div>
{#if data.collections}
 {@const c=data.collections}
 <section class="panel claim-card" aria-label="Collected by the payment partner, all time">
  <div class="claim-main">
   <p class="claim-eyebrow"><Icon name="payment" size={16}/>Mobile money · source <code>{c.source}</code> · all time</p>
   <strong class="claim-total"><small>TZS</small> {money(c.total_tzs)}</strong>
   <p class="claim-sub">{c.payments} successful payment{c.payments===1?'':'s'}{#if c.first_paid_at} · {day(darDate(c.first_paid_at))} – {day(darDate(c.last_paid_at!))}{/if}. Your friend's gateway collected this for you: the amount to claim.</p>
  </div>
  <div class="claim-side">
   <div><span>This month</span><strong>TZS {money(c.this_month_tzs)}</strong></div>
   {#each c.networks as n (n.network)}<div><span>{netLabel(n.network)}</span><strong>TZS {money(n.total_tzs)}</strong><small>{n.payments} paid</small></div>{/each}
   {#if c.refund_due}<div class="warn"><span>Paid but refunded to customer</span><strong>TZS {money(c.refund_due_tzs)}</strong><small>{c.refund_due} included above</small></div>{/if}
   <button type="button" class="small-button" onclick={copyClaim}>{copied?'Copied ✓':'Copy summary'}</button>
  </div>
 </section>
{/if}
<section class="panel revenue-filters" aria-label="Revenue period">
 <div class="period-presets">{#each data.presets as period}<a class="small-button" class:selected={period.from===data.summary.from&&period.to===data.summary.to} href={'/revenue?'+new URLSearchParams({from:period.from,to:period.to})} aria-current={period.from===data.summary.from&&period.to===data.summary.to?'true':undefined}>{period.label}</a>{/each}</div>
 <form method="GET" class="filter-bar"><label>From<input type="date" name="from" value={data.summary.from} required></label><label>To<input type="date" name="to" value={data.summary.to} required></label><button class="button">Apply dates</button></form>
</section>
<div class="section-heading period-heading"><div><h2>Period summary</h2><p class="small muted">{day(data.summary.from)} – {day(data.summary.to)} · Tanzania time</p></div><span class="badge">TZS</span></div>
<section class="metrics revenue-metrics" aria-label="Revenue summary">
 <article><div class="metric-heading"><span>Net revenue</span><Icon name="reports" size={18}/></div><strong><small>TZS</small> {money(data.summary.net_tzs)}</strong><small>Gross sales less recorded reversals</small><a href="/reports">View reports <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Cash revenue</span><Icon name="sales" size={18}/></div><strong><small>TZS</small> {money(data.summary.cash_net_tzs)}</strong><small>Cash sales after reversals</small><a href="/sales">View sales ledger <Icon name="arrow" size={14}/></a></article>
 <article class="azampay-card"><div class="metric-heading"><span>AzamPay revenue</span><Icon name="payment" size={18}/></div><strong><small>TZS</small> {money(data.summary.azampay_net_tzs)}</strong><small>{data.summary.azampay_sales_count} verified paid sale{data.summary.azampay_sales_count===1?'':'s'} · after reversals</small><a href="/payments">View mobile payments <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Reversals</span><Icon name="reverse" size={18}/></div><strong><small>TZS</small> {money(data.summary.reversals_tzs)}</strong><small>Deducted on the date recorded</small><a href="/sales">Review sales <Icon name="arrow" size={14}/></a></article>
</section>
<section class="panel revenue-ledger" aria-label="Sales totals"><div><span>Gross sales</span><strong>TZS {money(data.summary.gross_tzs)}</strong></div><div><span>Recorded sales</span><strong>{money(data.summary.sales_count)}</strong></div><div><span>Vouchers sold</span><strong>{money(data.summary.vouchers_sold)}</strong></div>{#if data.summary.other_gross_tzs!==0||data.summary.other_reversals_tzs!==0}<div><span>Other payment revenue</span><strong>TZS {money(data.summary.other_net_tzs)}</strong></div>{/if}</section>
<p class="small muted revenue-note">AzamPay totals include verified, paid purchases linked to the sales ledger. Pending, failed and refund-due payments are excluded. Amounts are recorded sales, before any provider fees.</p>
<div class="section-heading history-heading"><div><h2>Last 30 days</h2><p class="small muted">Daily trends and package performance. These charts always show the latest 30 days.</p></div></div>
<div class="chart-grid">
 <section class="panel chart-card"><header class="card-head"><div><h2>Net revenue trend</h2><p class="small muted">All sales, after reversals</p></div><Icon name="reports"/></header>{#if data.trendError}<p class="notice" role="status">The revenue trend is unavailable. Reload to try again.</p>{:else}<TrendChart points={data.trend} valueKey="net_tzs" label="Net revenue" format={compact}/>{/if}</section>
 <section class="panel chart-card"><header class="card-head"><div><h2>Vouchers sold</h2><p class="small muted">Daily sales volume</p></div><Icon name="ticket"/></header>{#if data.trendError}<p class="notice" role="status">The sales trend is unavailable. Reload to try again.</p>{:else}<TrendChart points={data.trend} valueKey="vouchers_sold" label="Vouchers sold" format={(n)=>String(Math.round(n))}/>{/if}</section>
</div>
<section class="panel chart-card"><header class="card-head"><div><h2>Revenue by package</h2><p class="small muted">Last 30 days · gross sales before reversals</p></div><a class="small-button" href="/packages">Packages <Icon name="arrow" size={14}/></a></header>{#if data.packageError}<p class="notice" role="status">Package revenue is unavailable. Reload to try again.</p>{:else}<RankChart rows={data.byPackage} format={(n)=>'TZS '+money(n)} sub={(row)=>row.vouchers+' voucher'+(row.vouchers===1?'':'s')+' sold'}/>{/if}</section>
<style>
 .claim-card{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:20px;align-items:stretch;margin-bottom:20px;border-color:color-mix(in srgb,var(--primary) 35%,var(--line));background:linear-gradient(0deg,var(--surface),var(--surface)),var(--surface)}
 .claim-main{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0}
 .claim-eyebrow{display:flex;align-items:center;gap:7px;margin:0;color:var(--primary-text);font-size:.8rem;font-weight:700;letter-spacing:.02em}
 .claim-eyebrow code{font-size:.78rem;padding:1px 6px;border-radius:5px;background:var(--primary-soft)}
 .claim-total{font-size:2.3rem;line-height:1.1;font-weight:750;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
 .claim-total small{font-size:.9rem;font-weight:600;color:var(--muted);margin-right:4px}
 .claim-sub{margin:0;font-size:.86rem;color:var(--muted)}
 .claim-side{display:flex;flex-direction:column;gap:8px;padding-left:20px;border-left:1px solid var(--line);min-width:0}
 .claim-side>div{display:grid;grid-template-columns:1fr auto;column-gap:10px;align-items:baseline}
 .claim-side span{font-size:.8rem;color:var(--muted)}
 .claim-side strong{font-variant-numeric:tabular-nums;font-size:.95rem;color:var(--ink);text-align:right}
 .claim-side small{grid-column:2;font-size:.72rem;color:var(--muted);text-align:right}
 .claim-side .warn span,.claim-side .warn strong{color:var(--warning)}
 .claim-side .small-button{align-self:flex-start;margin-top:4px}
 @media (max-width:760px){.claim-card{grid-template-columns:1fr}.claim-side{padding-left:0;border-left:0;border-top:1px solid var(--line);padding-top:12px}.claim-total{font-size:1.9rem}}

.revenue-filters{display:flex;align-items:end;justify-content:space-between;gap:20px;flex-wrap:wrap}.period-presets{display:flex;gap:8px;padding-bottom:2px}.selected{background:var(--primary-soft);border-color:var(--primary);color:var(--primary-text)}.filter-bar{padding:0}.period-heading{margin-bottom:18px}.period-heading p,.history-heading p{margin:5px 0 0}.revenue-metrics strong{font-size:clamp(1.1rem,1.8vw,1.7rem);overflow-wrap:anywhere}.revenue-metrics strong small{font-size:.7rem;font-weight:500;display:inline;color:var(--muted);min-height:0}.revenue-ledger{display:flex;gap:24px;flex-wrap:wrap}.revenue-ledger>div{flex:1;min-width:140px;display:flex;flex-direction:column;gap:7px}.revenue-ledger span{font-size:.8125rem;color:var(--muted)}.revenue-ledger strong{font-size:1.125rem;font-variant-numeric:tabular-nums}.revenue-note{margin:0 0 28px;line-height:1.7}.history-heading{margin-top:32px}.card-head :global(svg){color:var(--primary-text)}
@media(max-width:560px){.revenue-filters{gap:20px}.filter-bar{width:100%}.filter-bar label{flex:1;min-width:110px}.filter-bar .button{width:100%}.revenue-metrics strong{font-size:1.25rem}.revenue-ledger{gap:20px}.revenue-ledger>div{min-width:120px}.history-heading p{line-height:1.6}}
</style>
