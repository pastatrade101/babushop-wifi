<script lang="ts">
/**
 * Single-series trend over time: 2px line, ~10% area wash, hairline gridlines,
 * crosshair + tooltip on hover. One series, so no legend box -- the card title
 * names what is plotted. Values are labelled only at the peak and the endpoint;
 * a number on every point goes unread.
 *
 * The series hue is the brand green validated for this surface (OKLCH lightness
 * band, chroma floor, and 3:1 against white).
 */
let {points=[],valueKey='net_tzs',format=(n:number)=>String(n),label='Value',height=210}:{
 points:any[];valueKey?:string;format?:(n:number)=>string;label?:string;height?:number
}=$props();

const W=680,PAD={t:18,r:16,b:26,l:52};
const values=$derived(points.map(p=>Number(p[valueKey])||0));
const max=$derived(Math.max(1,...values));
// Snap the top of the scale to 1/2/5 x 10^n so the midpoint tick is an exact,
// readable value. Without this, a max of 8 gives a 4.5 midpoint that formats to
// "5" at a position that is not 5, and an all-zero series labels two
// gridlines "1".
const top=$derived((()=>{
 const power=Math.pow(10,Math.floor(Math.log10(max)));
 return [1,2,5,10].map(m=>m*power).find(v=>v>=max)??10*power;
})());
const innerW=$derived(W-PAD.l-PAD.r),innerH=$derived(height-PAD.t-PAD.b);
const x=$derived((i:number)=>points.length<2?PAD.l+innerW/2:PAD.l+(i/(points.length-1))*innerW);
const y=$derived((v:number)=>PAD.t+innerH-(v/top)*innerH);
const line=$derived(values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' '));
const area=$derived(values.length?line+` L${x(values.length-1).toFixed(1)} ${PAD.t+innerH} L${x(0).toFixed(1)} ${PAD.t+innerH} Z`:'');
// Drop any tick whose rendered label repeats one already shown: a duplicate
// label on two different gridlines is worse than one fewer gridline.
const ticks=$derived([0,0.5,1].map(f=>({v:top*f,y:y(top*f),text:format(top*f)}))
 .filter((tick,i,all)=>all.findIndex(other=>other.text===tick.text)===i));
const peak=$derived(values.indexOf(Math.max(...values)));
const last=$derived(values.length-1);
const short=(d:string)=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});

let hover=$state(-1);
function track(event:PointerEvent){
 const box=(event.currentTarget as SVGElement).getBoundingClientRect();
 if(!points.length||!box.width)return;
 const px=((event.clientX-box.left)/box.width)*W;
 const i=Math.round(((px-PAD.l)/innerW)*(points.length-1));
 hover=Math.max(0,Math.min(points.length-1,i));
}
</script>

{#if points.length}
<div class="chart">
 <svg viewBox="0 0 {W} {height}" role="img" aria-label="{label} over {points.length} days" preserveAspectRatio="none"
  onpointermove={track} onpointerleave={()=>hover=-1} onpointerdown={track}>
  {#each ticks as tick}
   <line class="grid" x1={PAD.l} x2={W-PAD.r} y1={tick.y} y2={tick.y}/>
   <text class="axis" x={PAD.l-8} y={tick.y+4} text-anchor="end">{tick.text}</text>
  {/each}
  <path class="area" d={area}/>
  <path class="line" d={line}/>
  {#if hover>=0}
   <line class="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t+innerH}/>
   <circle class="dot" cx={x(hover)} cy={y(values[hover])} r="5"/>
  {:else}
   <circle class="dot" cx={x(last)} cy={y(values[last])} r="5"/>
  {/if}
  <text class="axis" x={PAD.l} y={height-8}>{short(points[0].day)}</text>
  <text class="axis" x={W-PAD.r} y={height-8} text-anchor="end">{short(points[last].day)}</text>
  <!-- Selective labels only: the peak, and the latest value. -->
  {#if peak!==last&&values[peak]>0}
   <text class="mark-label" x={x(peak)} y={y(values[peak])-11} text-anchor="middle">{format(values[peak])}</text>
  {/if}
 </svg>
 <p class="chart-readout" aria-live="polite">
  {#if hover>=0}<strong>{format(values[hover])}</strong> · {short(points[hover].day)}
  {:else}<strong>{format(values[last])}</strong> · latest{/if}
 </p>
</div>
{:else}
<p class="small muted">No data for this period yet.</p>
{/if}

<style>
.chart{--series:#1a7f5c}
svg{display:block;width:100%;height:auto;touch-action:none}
.grid{stroke:#e8eee9;stroke-width:1}
.area{fill:var(--series);fill-opacity:.1;stroke:none}
.line{fill:none;stroke:var(--series);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
/* 2px surface ring keeps the marker legible where it crosses the line. */
.dot{fill:var(--series);stroke:#fff;stroke-width:2}
.crosshair{stroke:#b9c7bd;stroke-width:1}
.axis{fill:#7d8d80;font-size:12px}
.mark-label{fill:#3a5c49;font-size:12px;font-weight:600}
.chart-readout{margin:6px 0 0;font-size:.76rem;color:#6d7d71}
.chart-readout strong{color:#1e4634;font-variant-numeric:tabular-nums}
</style>
