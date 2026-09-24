<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import TrendChart from '$lib/components/TrendChart.svelte';
import RankChart from '$lib/components/RankChart.svelte';
let {data}=$props();
const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(n||0);
const compact=(n:number)=>Math.abs(n)>=1000000?(n/1000000).toFixed(1)+'M':Math.abs(n)>=1000?Math.round(n/1000)+'k':String(Math.round(n));
const day=(value:string)=>new Intl.DateTimeFormat('en-TZ',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
</script>
<svelte:head><title>Revenue · {data.brand}</title></svelte:head>
<div class="page-heading"><div><h1>Revenue</h1><p>Cash sales and verified AzamPay revenue, with reversals accounted for.</p></div><a class="button secondary" href="/sales"><Icon name="sales" size={18}/> View sales</a></div>
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
.revenue-filters{display:flex;align-items:end;justify-content:space-between;gap:20px;flex-wrap:wrap}.period-presets{display:flex;gap:8px;padding-bottom:2px}.selected{background:var(--primary-soft);border-color:var(--primary);color:var(--primary-text)}.filter-bar{padding:0}.period-heading{margin-bottom:18px}.period-heading p,.history-heading p{margin:5px 0 0}.revenue-metrics strong{font-size:clamp(1.1rem,1.8vw,1.7rem);overflow-wrap:anywhere}.revenue-metrics strong small{font-size:.7rem;font-weight:500;display:inline;color:var(--muted);min-height:0}.revenue-ledger{display:flex;gap:24px;flex-wrap:wrap}.revenue-ledger>div{flex:1;min-width:140px;display:flex;flex-direction:column;gap:7px}.revenue-ledger span{font-size:.8125rem;color:var(--muted)}.revenue-ledger strong{font-size:1.125rem;font-variant-numeric:tabular-nums}.revenue-note{margin:0 0 28px;line-height:1.7}.history-heading{margin-top:32px}.card-head :global(svg){color:var(--primary-text)}
@media(max-width:560px){.revenue-filters{gap:20px}.filter-bar{width:100%}.filter-bar label{flex:1;min-width:110px}.filter-bar .button{width:100%}.revenue-metrics strong{font-size:1.25rem}.revenue-metrics article{min-height:200px}.metric-heading{padding-right:28px}.revenue-ledger{gap:20px}.revenue-ledger>div{min-width:120px}.history-heading p{line-height:1.6}}
</style>
