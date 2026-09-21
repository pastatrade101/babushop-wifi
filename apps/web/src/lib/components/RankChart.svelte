<script lang="ts">
/**
 * Ranked horizontal bars for a nominal dimension (package names). Nominal, so
 * every bar takes the same slot-1 hue: colouring each bar differently would
 * spend the identity channel re-encoding what bar length already shows.
 *
 * Bars are capped at 24px with a 4px rounded data-end, square at the baseline.
 * Values sit outside the bar when the label would not fit inside with padding.
 */
let {rows=[],valueKey='revenue_tzs',labelKey='package_name',format=(n:number)=>String(n),sub=(_r:any)=>''}:{
 rows:any[];valueKey?:string;labelKey?:string;format?:(n:number)=>string;sub?:(row:any)=>string
}=$props();

const max=$derived(Math.max(1,...rows.map(r=>Number(r[valueKey])||0)));
const width=(row:any)=>((Number(row[valueKey])||0)/max)*100;
let hover=$state(-1);
</script>

{#if rows.length}
<ul class="rank">
 {#each rows as row,i (row[labelKey])}
  <li class:hovered={hover===i} onpointerenter={()=>hover=i} onpointerleave={()=>hover=-1}>
   <div class="rank-head">
    <span class="rank-name" title={row[labelKey]}>{row[labelKey]}</span>
    <span class="rank-value">{format(Number(row[valueKey])||0)}</span>
   </div>
   <div class="track"><div class="bar" style="width:{Math.max(width(row),1.5)}%"></div></div>
   {#if sub(row)}<span class="rank-sub">{sub(row)}</span>{/if}
  </li>
 {/each}
</ul>
{:else}
<p class="small muted">No sales in this period yet.</p>
{/if}

<style>
.rank{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.rank li{display:flex;flex-direction:column;gap:5px}
.rank-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.rank-name{font-size:.82rem;font-weight:600;color:#274b36;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-value{font-size:.82rem;font-weight:650;color:#1e4634;font-variant-numeric:tabular-nums;white-space:nowrap}
.rank-sub{font-size:.7rem;color:#7d8d80}
/* The track is the slot; the bar never fills it edge to edge -- the leftover is air. */
.track{background:#eef3ee;border-radius:5px;height:10px;overflow:hidden}
.bar{height:100%;background:#1a7f5c;border-radius:0 4px 4px 0;transition:width .3s ease}
.rank li.hovered .rank-name{color:#14301f}
.rank li.hovered .bar{background:#14684b}
</style>
