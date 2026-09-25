<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
let {data}=$props();

// ── Period ─────────────────────────────────────────────────────────────────
// Tanzania's local day, the same bounds the API uses.
const TZ='Africa/Dar_es_Salaam';
const iso=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(d);
const shift=(day:string,by:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+by);return d.toISOString().slice(0,10);};
const today=iso(new Date());
const from=$derived(data.query.from||today);
const to=$derived(data.query.to||data.query.from||today);
const presets=[
 {label:'Today',from:today,to:today},
 {label:'Yesterday',from:shift(today,-1),to:shift(today,-1)},
 {label:'7 days',from:shift(today,-6),to:today},
 {label:'30 days',from:shift(today,-29),to:today},
 {label:'This month',from:today.slice(0,8)+'01',to:today},
];
const nice=(day:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const period=$derived(from===to?(from===today?'Today':from===shift(today,-1)?'Yesterday':nice(from)):`${nice(from)} – ${nice(to)}`);
const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(Math.round(Number(n)||0));
const count=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;

// ── Activity ───────────────────────────────────────────────────────────────
// Each recorded action as a person would say it, with an icon and a colour
// for its kind: money in green, problems in red, stock in blue, and so on.
type Tone='green'|'red'|'amber'|'blue'|'purple'|'cyan'|'grey';
const ACTIONS:Record<string,[string,string,Tone]>={
 CASH_SALE:['Cash sale','sales','green'],
 SELF_SERVICE_SALE:['Mobile money sale','payment','green'],
 SALE_PRINTED:['Receipt printed','sales','blue'],
 SALE_REVERSED:['Sale reversed','reverse','amber'],
 PURCHASE_CHECKOUT_FAILED:['Mobile checkout failed','alert','red'],
 PURCHASE_REFUND_DUE:['Customer refund due','alert','red'],
 PAYMENT_CALLBACK_REJECTED:['Payment callback rejected','alert','red'],
 PAYMENT_CALLBACK_UNCONFIRMED:['Payment callback unconfirmed','alert','amber'],
 NOTIFICATION_FAILED:['Sale email not delivered','alert','amber'],
 BATCH_GENERATED:['Voucher batch generated','batch','blue'],
 BATCH_ISSUED:['Voucher batch issued','batch','blue'],
 BATCH_PRINTED:['Voucher batch printed','batch','blue'],
 PRINTED_STOCK_DELETED:['Printed stock deleted','ticket','amber'],
 VOUCHER_VOIDED:['Voucher voided','ticket','amber'],
 MIKROTIK_VOUCHER_ACTIVATED:['Voucher first used on Wi-Fi','wifi','green'],
 PACKAGE_CREATED:['Package created','package','purple'],
 PACKAGE_UPDATED:['Package updated','package','purple'],
 PACKAGES_IMPORTED:['Packages imported','package','purple'],
 ACCESS_REVOKED:['Wi-Fi access revoked','grants','amber'],
 ATTEMPT_REVIEWED:['Access attempt reviewed','grants','blue'],
 STAFF_ACCESS_CHANGED:['Staff access changed','staff','purple'],
 ROUTER_TERMINAL_COMMAND:['Router terminal command','terminal','cyan'],
 ROUTER_FILE_WRITTEN:['Hotspot page uploaded','folder','cyan'],
 ROUTER_FILE_WRITE_FAILED:['Hotspot upload failed','alert','red'],
 MIKROTIK_CHECK:['Router check','router','cyan'],
 NETWORK_DISCOVERED:['Network discovery','network','cyan'],
 NETWORK_DEVICE_PROBED:['Network device checked','network','cyan'],
 NETWORK_PLAN_DRAFTED:['Tunnel plan drafted','network','cyan'],
 NETWORK_PREFLIGHT_CAPTURED:['Server facts captured','network','cyan'],
 NETWORK_OMADA_URL_SET:['Controller address set','network','cyan'],
 OMADA_TEST:['Controller test','network','cyan'],
};
const sentence=(action:string)=>{const s=action.replaceAll('_',' ').toLowerCase();return s.charAt(0).toUpperCase()+s.slice(1);};
function describe(action:string):[string,string,Tone]{
 if(ACTIONS[action])return ACTIONS[action];
 if(action.startsWith('AUTHORIZATION_'))return ['Wi-Fi authorization '+action.slice(14).replaceAll('_',' ').toLowerCase(),'wifi','blue'];
 return [sentence(action),'reports','grey'];
}
type Entry={id:string;action:string;created_at:string;display_name?:string};
const time=(at:string)=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(new Date(at));
const dayLabel=(day:string)=>day===today?'Today':day===shift(today,-1)?'Yesterday':nice(day);
const groups=$derived.by(()=>{
 const out:{day:string;items:Entry[]}[]=[];
 for(const item of (data.audit.items??[]) as Entry[]){
  const day=iso(new Date(item.created_at));
  if(out.at(-1)?.day!==day)out.push({day,items:[]});
  out.at(-1)!.items.push(item);
 }
 return out;
});
const pageHref=(page:number)=>{const p=new URLSearchParams();if(data.query.from)p.set('from',data.query.from);if(data.query.to)p.set('to',data.query.to);if(page>1)p.set('page',String(page));const s=p.toString();return s?'?'+s:'?';};
const rangeHref=(f:string,t:string)=>f===today&&t===today?'/reports':`?from=${f}&to=${t}`;
</script>

<svelte:head><title>Reports · {data.brand}</title></svelte:head>

<div class="page-heading reports-heading">
 <div><h1>Reports</h1><p>Money and stock for the period you choose, in Tanzania time.</p></div>
 <form class="range" method="GET" aria-label="Report period">
  <div class="presets">{#each presets as p (p.label)}<a href={rangeHref(p.from,p.to)} class:selected={p.from===from&&p.to===to} aria-current={p.from===from&&p.to===to?'true':undefined}>{p.label}</a>{/each}</div>
  <div class="custom">
   <label><span class="sr-only">From</span><input type="date" name="from" value={from} max={today} aria-label="From"></label>
   <span class="dash" aria-hidden="true">–</span>
   <label><span class="sr-only">To</span><input type="date" name="to" value={to} max={today} aria-label="To"></label>
   <button class="button secondary">Apply</button>
  </div>
 </form>
</div>

<div class="block-head"><h2>Money in</h2><span class="chip">{period}</span></div>
<section class="metrics financial" aria-label="Money for {period}">
 <article><div class="metric-heading"><span>Gross sales</span><Icon name="sales" size={18}/></div><strong><small>TZS</small> {money(data.totals.gross_tzs)}</strong><small>{count(Number(data.totals.vouchers_sold)||0,'voucher','vouchers')} sold · cash and mobile money</small><a href="/sales">Open the sales ledger <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Reversals</span><Icon name="reverse" size={18}/></div><strong><small>TZS</small> {money(data.totals.reversals_tzs)}</strong><small>Refunds and cancellations recorded in this period</small><a href="/sales">Find them in the sales ledger <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Net money in</span><Icon name="money" size={18}/></div><strong><small>TZS</small> {money(data.totals.net_tzs)}</strong><small>Gross sales less reversals</small><a href="/revenue">Cash vs AzamPay breakdown <Icon name="arrow" size={14}/></a></article>
</section>

<div class="block-head"><h2>Stock right now</h2><span class="chip muted-chip">Live</span></div>
<section class="metrics" aria-label="Voucher stock right now">
 <article><div class="metric-heading"><span>Available</span><Icon name="ticket" size={18}/></div><strong>{data.inventory.stock}</strong><small>Ready to sell</small><a href="/vouchers?state=AVAILABLE">View stock <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Sold, not yet used</span><Icon name="clock" size={18}/></div><strong>{data.inventory.sold_unused}</strong><small>Waiting for their first connection</small><a href="/vouchers?state=SOLD">View sold vouchers <Icon name="arrow" size={14}/></a></article>
 <article><div class="metric-heading"><span>Active access</span><Icon name="wifi" size={18}/></div><strong>{data.inventory.active}</strong><small>Unexpired vouchers, online or not</small><a href="/sessions">View Wi-Fi sessions <Icon name="arrow" size={14}/></a></article>
 <article class:attention={data.inventory.needs_review>0}><div class="metric-heading"><span>Needs review</span><Icon name="grants" size={18}/></div><strong>{data.inventory.needs_review}</strong><small>{data.inventory.needs_review>0?'Access waiting for a decision':'Nothing waiting'}</small><a href="/access-grants?state=NEEDS_REVIEW">Review access <Icon name="arrow" size={14}/></a></article>
</section>
<p class="footnote">Sales count on their sale date and reversals on their reversal date, so a period's reversals can include older sales. Generating stock is not revenue.</p>

<section class="panel activity" aria-labelledby="activity-title">
 <div class="activity-head"><h2 id="activity-title">Recent activity</h2><span class="small muted">What staff and the system did, newest first</span></div>
 {#if !groups.length}<p class="muted small">Nothing recorded yet.</p>{/if}
 {#each groups as group (group.day)}
  <p class="day">{dayLabel(group.day)}</p>
  <ul>
   {#each group.items as item (item.id)}
    {@const [text,icon,tone]=describe(item.action)}
    <li>
     <span class="act-icon {tone}"><Icon name={icon} size={15}/></span>
     <span class="act-text"><strong>{text}</strong><small>{item.display_name?'by '+item.display_name:'Automatic'}</small></span>
     <time datetime={item.created_at}>{time(item.created_at)}</time>
    </li>
   {/each}
  </ul>
 {/each}
 {#if data.query.page>1||data.audit.has_more}
  <nav class="pager" aria-label="Activity pages">
   {#if data.query.page>1}<a class="small-button" href={pageHref(data.query.page-1)}>← Newer</a>{:else}<span></span>{/if}
   <span class="small muted">Page {data.query.page}</span>
   {#if data.audit.has_more}<a class="small-button" href={pageHref(data.query.page+1)}>Older →</a>{:else}<span></span>{/if}
  </nav>
 {/if}
</section>

<style>
.reports-heading{align-items:flex-end;flex-wrap:wrap}
.range{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0}
.presets{display:flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.presets a{padding:6px 11px;border-radius:7px;font-size:.78rem;font-weight:600;color:var(--muted);text-decoration:none;white-space:nowrap}
.presets a:hover{color:var(--ink);background:var(--surface-muted)}
.presets a.selected{background:var(--primary-soft);color:var(--primary-text)}
.custom{display:flex;align-items:center;gap:6px}
.custom label{margin:0}
.custom input{min-height:38px;padding:6px 10px;font-size:.8rem;width:auto}
.custom .button{min-height:38px;padding:7px 14px}
.dash{color:var(--muted)}

.block-head{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.block-head h2{margin:0;font-size:.95rem}
.chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;background:var(--primary-soft);color:var(--primary-text);font-size:.74rem;font-weight:650}
.chip.muted-chip{background:var(--success-soft);color:var(--success)}
.footnote{margin:-6px 0 20px;font-size:.76rem;color:var(--muted);line-height:1.5}

.activity-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.activity-head h2{margin:0}
.day{margin:14px 0 4px;font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.activity ul{list-style:none;margin:0;padding:0}
.activity li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px 4px;border-bottom:1px solid var(--line)}
.activity li:last-child{border-bottom:0}
.act-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:8px}
.act-icon.green{background:var(--success-soft);color:var(--success)}
.act-icon.red{background:var(--danger-soft);color:var(--danger)}
.act-icon.amber{background:var(--warning-soft);color:var(--warning)}
.act-icon.blue{background:var(--primary-soft);color:var(--primary-text)}
.act-icon.purple{background:var(--purple-soft);color:var(--purple)}
.act-icon.cyan{background:var(--cyan-soft);color:var(--cyan)}
.act-icon.grey{background:var(--surface-muted);color:var(--muted)}
.act-text{display:flex;flex-direction:column;min-width:0}
.act-text strong{font-size:.84rem;font-weight:600;color:var(--ink)}
.act-text small{font-size:.74rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.activity time{font-size:.78rem;color:var(--muted);font-variant-numeric:tabular-nums}
.pager{display:flex;align-items:center;justify-content:space-between;margin-top:12px}

@media (max-width:900px){.reports-heading{align-items:flex-start}.range{width:100%}.presets{overflow-x:auto;max-width:100%;scrollbar-width:none}.presets::-webkit-scrollbar{display:none}}
@media (max-width:560px){.custom{width:100%}.custom label{flex:1}.custom input{width:100%}}
</style>
