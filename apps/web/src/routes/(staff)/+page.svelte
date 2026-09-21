<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import TrendChart from '$lib/components/TrendChart.svelte';
import RankChart from '$lib/components/RankChart.svelte';
let {data}=$props();
const compact=(n:number)=>n>=1000000?(n/1000000).toFixed(1)+'M':n>=1000?Math.round(n/1000)+'k':String(Math.round(n));
const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(n||0);
const date=(d:string)=>new Intl.DateTimeFormat('en-TZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(d));
const admin=$derived(data.staff.role==='ADMIN');
const networkLabel=$derived(data.mode!=='live'?'Portal test mode':data.networkProvider==='mikrotik'&&data.radiusEnabled?'RADIUS authentication enabled':'Live authorization configured');
</script>
<svelte:head><title>Overview · {data.brand}</title></svelte:head>
<div class="page-heading"><div><p class="eyebrow">DAILY OVERVIEW</p><h1>Your shop, at a glance.</h1><p>Sales, vouchers and connections in one place.</p></div><a href="/sell" class="button"><Icon name="plus" size={18}/> Sell internet</a></div>
{#if admin}<section class="revenue-strip" aria-label="Today's cash movement"><div class="revenue-main"><span class="eyebrow">NET CASH TODAY</span><strong><small>TZS</small> {money(data.metrics.net_tzs)}</strong><span>After recorded reversals</span></div><div><span>Gross sales</span><strong>TZS {money(data.metrics.gross_tzs)}</strong></div><div><span>Reversals</span><strong>TZS {money(data.metrics.reversals_tzs)}</strong></div><div><span>Vouchers sold</span><strong>{data.metrics.vouchers_sold||0}</strong><small>Today · Tanzania time</small></div></section>{/if}
<section class="metrics" aria-label="Voucher inventory">
 <article><div class="metric-heading"><span>Available stock</span><Icon name="ticket" size={18}/></div><strong>{data.metrics.stock}</strong><small>Ready for the counter</small><a href="/vouchers?state=AVAILABLE">View stock <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Sold, unused</span><Icon name="clock" size={18}/></div><strong>{data.metrics.sold_unused}</strong><small>Waiting for first connection</small><a href="/vouchers?state=SOLD">View sold vouchers <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Active entitlements</span><Icon name="wifi" size={18}/></div><strong>{data.metrics.active}</strong><small>Unexpired access · not online devices</small>{#if admin}<a href="/sessions">View Wi-Fi sessions <Icon name="arrow" size={14}/></a>{/if}</article>
 <article class:attention={data.metrics.needs_review>0}><div class="metric-heading"><span>Needs review</span><Icon name="grants" size={18}/></div><strong>{data.metrics.needs_review}</strong><small>Authorization needing attention</small>{#if admin}<a href="/access-grants?state=NEEDS_REVIEW">Review access <Icon name="arrow" size={14}/></a>{/if}</article>
</section>
<div class="dashboard-bottom">
 <section class="panel action-panel"><div class="section-heading"><div><p class="eyebrow">AT THE COUNTER</p><h2>Keep your shop moving.</h2></div><Icon name="sales" size={22}/></div><div class="quick-actions"><a href="/sell"><span class="action-icon"><Icon name="plus"/></span><span><strong>Make a sale</strong><small>Reserve vouchers and record cash</small></span><Icon name="arrow" size={17}/></a>{#if admin}<a href="/voucher-batches"><span class="action-icon"><Icon name="batch"/></span><span><strong>Prepare voucher stock</strong><small>Generate and print a new batch</small></span><Icon name="arrow" size={17}/></a>{/if}<a href="/sales"><span class="action-icon"><Icon name="sales"/></span><span><strong>View sales</strong><small>Find a receipt or review a handover</small></span><Icon name="arrow" size={17}/></a></div></section>
 {#if data.integration}<section class="panel network-card"><div class="section-heading"><div><p class="eyebrow">YOUR NETWORK</p><h2>{data.networkProvider==='mikrotik'?'MikroTik + Omada Wi-Fi':'Omada Wi-Fi'}</h2></div><span class="action-icon"><Icon name="wifi"/></span></div><span class="mode-pill" class:test-mode={data.mode!=='live'}><span class="status-dot"></span>{networkLabel}</span><dl class="details"><dt>Router check</dt><dd>{data.integration.ok===true?'Reachable':data.integration.ok===false?'Needs attention':'Not checked'}</dd><dt>Last checked</dt><dd>{data.integration.last_check?date(data.integration.last_check):'—'}</dd>{#if data.networkProvider==='mikrotik'}<dt>Shared download</dt><dd>{data.wanDownload} Mbps</dd>{/if}</dl><a class="small-button" href="/settings">Network setup <Icon name="arrow" size={15}/></a><p class="small muted">Configuration and router checks do not verify voucher expiry.</p></section>{:else}<section class="panel accent"><p class="eyebrow">VOUCHER BASICS</p><h2>Ready when they are.</h2><p>Record the cash sale, then hand over the code. The customer’s time begins at their first connection.</p><a href="/vouchers" class="small-button">Open vouchers →</a></section>{/if}
</div>
{#if admin}
<div class="chart-grid">
 <section class="panel chart-card">
  <header class="card-head"><div><h2>Net revenue</h2><p class="small muted">Last 30 days, after reversals</p></div><a class="small-button" href="/reports">Reports <Icon name="arrow" size={14}/></a></header>
  <TrendChart points={data.trend} valueKey="net_tzs" label="Net revenue" format={(n)=>compact(n)}/>
 </section>
 <section class="panel chart-card">
  <header class="card-head"><div><h2>Vouchers sold</h2><p class="small muted">Last 30 days</p></div><a class="small-button" href="/sales">Sales <Icon name="arrow" size={14}/></a></header>
  <TrendChart points={data.trend} valueKey="vouchers_sold" label="Vouchers sold" format={(n)=>String(Math.round(n))} height={190}/>
 </section>
</div>
<section class="panel chart-card">
 <header class="card-head"><div><h2>Revenue by package</h2><p class="small muted">Last 30 days · ranked</p></div><a class="small-button" href="/packages">Packages <Icon name="arrow" size={14}/></a></header>
 <RankChart rows={data.byPackage} format={(n)=>'TZS '+money(n)} sub={(r)=>r.vouchers+' voucher'+(r.vouchers===1?'':'s')+' sold'}/>
</section>
{/if}
<div class="policy-strip"><Icon name="grants" size={18}/><strong>One voucher. One device.</strong><span>Time starts at first activation and continues while disconnected.</span></div>
