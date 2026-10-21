<script lang="ts">
import {enhance} from '$app/forms';
import {onMount,tick} from 'svelte';
import Icon from '$lib/components/Icon.svelte';
import {openModal,closeModal} from '$lib/modal';
let {data,form}=$props();

type Offer={id:string;name:string;starts_at:string;ends_at:string;daily_start:string|null;daily_end:string|null;download_mbps:number;upload_mbps:number;enabled:boolean;state:'ON'|'WAITING'|'ENDED'|'OFF';until:string|null;next:string|null;logins:number;devices:number;sales:number;revenue_tzs:number;
 online:number;down_bytes:number;up_bytes:number;measured:boolean;usage:Usage[]};
type Usage={device:string;sign_ins:number;down_bytes:number;up_bytes:number;seconds:number;online:boolean;measured:boolean;last_at:string|null};
const offers=$derived((data.offers??[]) as Offer[]);

// ── Times: always Tanzanian (UTC+3), whatever the browser's own zone ────────
const TZ='Africa/Dar_es_Salaam';
const dayFmt=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:TZ});
const timeFmt=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:TZ});
const dayKey=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(d);
const at=(iso:string)=>{const d=new Date(iso);return dayKey(d)===dayKey(new Date())?'today '+timeFmt.format(d):dayFmt.format(d)+', '+timeFmt.format(d);};
const range=(o:Offer)=>{const a=new Date(o.starts_at),b=new Date(o.ends_at);return dayKey(a)===dayKey(b)?`${dayFmt.format(a)}, ${timeFmt.format(a)}–${timeFmt.format(b)}`:`${dayFmt.format(a)}, ${timeFmt.format(a)} → ${dayFmt.format(b)}, ${timeFmt.format(b)}`;};
/** An instant as the value a datetime-local input shows in Dar es Salaam. */
const local=(iso:string)=>new Date(new Date(iso).getTime()+3*3600_000).toISOString().slice(0,16);
const money=(n:number)=>'TZS '+new Intl.NumberFormat('en-TZ').format(Math.round(n||0));
// Data the way a phone plan counts it: 1 GB = 1000 MB.
// The unit steps up before rounding would print "1000 MB".
const bytes=(n:number)=>{const v=Math.max(0,n||0);return v>=999.5e6?(v/1e9).toFixed(v>=9.95e9?1:2)+' GB':v>=999.5e3?(v/1e6).toFixed(v>=99.95e6?0:1)+' MB':v>=1e3?Math.round(v/1e3)+' KB':v?'1 KB':'0 MB';};
const minutes=(s:number)=>{const m=Math.round((s||0)/60),h=Math.floor(m/60);return h?`${h}h ${m%60}m`:`${m} min`;};

// A clock for the countdowns and progress bars, ticking each minute.
let now=$state(Date.now());
onMount(()=>{const t=setInterval(()=>now=Date.now(),30_000);return()=>clearInterval(t);});
const span=(ms:number)=>{const m=Math.max(0,Math.round(ms/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60),r=m%60;return d?`${d}d ${h}h`:h?`${h}h ${r}m`:`${r}m`;};
/** How far through its whole run the offer is, 0..1. */
const progress=(o:Offer)=>{const a=Date.parse(o.starts_at),b=Date.parse(o.ends_at);return Math.min(1,Math.max(0,(now-a)/(b-a)));};
const STATE:Record<Offer['state'],{label:string;tone:string}>={ON:{label:'On now',tone:'on'},WAITING:{label:'Scheduled',tone:'waiting'},ENDED:{label:'Ended',tone:'ended'},OFF:{label:'Switched off',tone:'off'}};
const live=$derived(offers.filter(o=>o.state==='ON'));

// ── The pop-up form ─────────────────────────────────────────────────────────
let dialog:HTMLDialogElement|undefined=$state();
let editing=$state<Offer|null>(null);
let daily=$state(false);
let saving=$state(false);
let problem=$state<string|null>(null);
// What was typed into a failed save, shown again only in the form it came from.
let typed=$state<Record<string,any>|null>(null);
const v=$derived(typed??(editing?{...editing,starts_at:local(editing.starts_at),ends_at:local(editing.ends_at)}:null));
const hourFrom=(t:number)=>local(new Date(Math.ceil(t/3600_000)*3600_000).toISOString());
async function open(o:Offer|null){
 editing=o;typed=null;problem=null;daily=!!o?.daily_start;
 await tick();openModal(dialog);
 (dialog?.querySelector('input[name=name]') as HTMLInputElement|null)?.focus();
}
function close(){closeModal(dialog);}
function onBackdrop(e:MouseEvent){if(e.target===dialog)close();}
const submit=({formData}:{formData:FormData})=>{
 saving=true;problem=null;
 const snapshot=Object.fromEntries(formData.entries());
 return async({result,update}:{result:any;update:(o?:{reset?:boolean;invalidateAll?:boolean})=>Promise<void>})=>{
  saving=false;
  if(result.type==='success'){close();editing=null;typed=null;await update({reset:true});}
  else if(result.type==='failure'){problem=result.data?.error??'Could not save the offer.';typed={...snapshot,enabled:snapshot.enabled==='on'};}
  else{problem='Could not save the offer.';}
 };
};
</script>

<svelte:head><title>Free offer · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div><p class="eyebrow">MARKETING</p><h1>Free Wi-Fi offer</h1>
  <p>Choose when anyone on the shop Wi-Fi can go online free with one tap. The sign-in page that pops up on their phone shows the offer while it runs; outside it, only your packages.</p></div>
 <div class="heading-actions"><button type="button" class="button" onclick={()=>open(null)}><Icon name="plus" size={18}/>New offer</button></div>
</div>

{#if form?.message}<div class="notice" role="status">{form.message}</div>{/if}
{#if form?.error&&!problem}<div class="notice error" role="alert">{form.error}</div>{/if}

{#if !offers.length}
 <section class="panel empty">
  <span class="empty-icon"><Icon name="gift" size={28}/></span>
  <h2>No offers yet</h2>
  <p class="muted">Set a time when the Wi-Fi is free for everyone, for example 17:00 to 19:00 every day this week. People who try it come back and buy.</p>
  <button type="button" class="button" onclick={()=>open(null)}><Icon name="plus" size={18}/>Create your first offer</button>
 </section>
{:else}
 {#if live.length}
  <p class="live-line" role="status"><span class="pulse" aria-hidden="true"></span><span>Free Wi-Fi is on now: <strong>{live[0].name}</strong>, until {at(live[0].until!)}.</span></p>
 {/if}
 <div class="offer-grid">
  {#each offers as o (o.id)}
   {@const s=STATE[o.state]}
   <article class="offer-card tone-{s.tone}">
    <header>
     <div class="title">
      <span class="pill {s.tone}">{#if o.state==='ON'}<span class="pulse" aria-hidden="true"></span>{/if}{s.label}</span>
      <h2>{o.name}</h2>
     </div>
     <div class="actions" role="group" aria-label={'Actions for '+o.name}>
      <button type="button" class="act" onclick={()=>open(o)}><Icon name="settings" size={15}/>Edit</button>
      {#if o.state!=='ENDED'}<form method="POST" action="?/toggle" use:enhance><input type="hidden" name="id" value={o.id}><button class="act" class:danger={o.enabled}>{o.enabled?'Switch off':'Switch on'}</button></form>{/if}
     </div>
    </header>

    <div class="when">
     {#if o.state==='ON'}
      <div class="when-line"><strong>{span(Date.parse(o.until!)-now)} left</strong><span>free until {at(o.until!)}</span></div>
      <div class="bar" role="progressbar" aria-label="How far through the offer" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress(o)*100)}><span style="width:{progress(o)*100}%"></span></div>
     {:else if o.state==='WAITING'}
      <div class="when-line"><strong>Starts in {span(Date.parse(o.next!)-now)}</strong><span>{at(o.next!)}</span></div>
     {:else if o.state==='ENDED'}
      <div class="when-line"><strong>Finished</strong><span>ended {at(o.ends_at)}</span></div>
     {:else}
      <div class="when-line"><strong>Not running</strong><span>switch it on to show it on the sign-in page</span></div>
     {/if}
    </div>

    <ul class="chips">
     <li><Icon name="calendar" size={14}/>{range(o)}</li>
     <li><Icon name="clock" size={14}/>{o.daily_start?`Daily ${o.daily_start}–${o.daily_end}`:'All day'}</li>
     <li><Icon name="bolt" size={14}/>{o.download_mbps}↓ / {o.upload_mbps}↑ Mbps</li>
    </ul>

    <dl class="stats">
     <div><dt>Devices</dt><dd>{o.devices}</dd></div>
     <div><dt>On now</dt><dd class:live={o.online>0}>{o.online}</dd></div>
     <div><dt>Data used</dt><dd title={o.measured?`${bytes(o.down_bytes)} down · ${bytes(o.up_bytes)} up`:'Recorded for sign-ins from 21 Oct'}>{o.measured?bytes(o.down_bytes+o.up_bytes):'—'}</dd></div>
     <div><dt>Free sign-ins</dt><dd>{o.logins}</dd></div>
     <div><dt>Packages sold</dt><dd>{o.sales}</dd></div>
     <div><dt>Taken</dt><dd>{money(o.revenue_tzs)}</dd></div>
    </dl>
    <p class="insight">
     {#if o.state==='WAITING'}Nothing to measure yet. Counts start when the offer goes on.
     {:else if !o.devices}No phone has used it yet.{#if o.state==='ON'}{' '}Phones see it when they join the Wi-Fi.{/if}
     {:else}{o.devices} device{o.devices===1?'':'s'} went online free{o.logins>o.devices?`, ${(o.logins/o.devices).toFixed(1)} sign-ins each`:''}. {o.sales?`${o.sales} package${o.sales===1?'':'s'} sold over the same time.`:'No package sold over the same time yet.'}{/if}
    </p>
    {#if o.usage.length}
     <details class="usage">
      <summary>Data per device <span class="count">{o.usage.length}{o.devices>o.usage.length?` of ${o.devices}`:''}</span></summary>
      <div class="usage-wrap">
       <table>
        <thead><tr><th>Device</th><th>Status</th><th class="num">Downloaded</th><th class="num">Uploaded</th><th class="num">Time online</th><th class="num">Sign-ins</th></tr></thead>
        <tbody>
         {#each o.usage as d (d.device)}
          <tr>
           <td class="mac">{d.device}</td>
           <td>{#if d.online}<span class="pill on">Online</span>{:else}<span class="pill">{d.last_at?at(d.last_at):'—'}</span>{/if}</td>
           <td class="num">{d.measured?bytes(d.down_bytes):'—'}</td>
           <td class="num">{d.measured?bytes(d.up_bytes):'—'}</td>
           <td class="num">{d.measured?minutes(d.seconds):'—'}</td>
           <td class="num">{d.sign_ins}</td>
          </tr>
         {/each}
        </tbody>
       </table>
      </div>
      {#if o.usage.some(d=>!d.measured)}<p class="usage-note">— means the phone signed in before data was recorded (from 21 Oct).</p>{/if}
     </details>
    {/if}
   </article>
  {/each}
 </div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="offer-dialog" bind:this={dialog} onclick={onBackdrop} aria-labelledby="offer-dialog-title">
 {#key editing?.id??'new'}
 <form method="POST" action="?/save" use:enhance={submit}>
  <div class="dialog-head">
   <h2 id="offer-dialog-title">{editing?'Edit offer':'New offer'}</h2>
   <button type="button" class="icon-close" aria-label="Close" onclick={close}><Icon name="close" size={18}/></button>
  </div>
  {#if problem}<div class="notice error" role="alert">{problem}</div>{/if}
  <input type="hidden" name="id" value={editing?.id??''}>
  <label class="field">Name customers see<input name="name" maxlength="80" required placeholder="Wi-Fi bure wiki hii" value={v?.name??''}></label>
  <div class="two dates">
   <label class="field">Starts<input type="datetime-local" name="starts_at" required value={v?.starts_at?(String(v.starts_at).length>16?local(v.starts_at):v.starts_at):hourFrom(Date.now())}></label>
   <label class="field">Ends<input type="datetime-local" name="ends_at" required value={v?.ends_at?(String(v.ends_at).length>16?local(v.ends_at):v.ends_at):hourFrom(Date.now()+7*86400_000)}></label>
  </div>
  <label class="check"><input type="checkbox" name="daily" bind:checked={daily}>Only between these hours each day</label>
  {#if daily}
   <div class="two">
    <label class="field">From<input type="time" name="daily_start" required value={v?.daily_start??'17:00'}></label>
    <label class="field">To<input type="time" name="daily_end" required value={v?.daily_end??'19:00'}></label>
   </div>
   <p class="hint">Hours may run past midnight, for example 22:00 to 02:00.</p>
  {/if}
  <div class="two">
   <label class="field">Download · Mbps<input type="number" name="download_mbps" min="1" max="10000" required value={v?.download_mbps??2}></label>
   <label class="field">Upload · Mbps<input type="number" name="upload_mbps" min="1" max="10000" required value={v?.upload_mbps??1}></label>
  </div>
  <p class="hint">A slower free speed leaves a reason to buy a package. Times are Tanzanian time.</p>
  <label class="check"><input type="checkbox" name="enabled" checked={v?(v.enabled===true||v.enabled==='on'):true}>Switched on</label>
  <div class="dialog-actions">
   <button type="button" class="button secondary" onclick={close}>Cancel</button>
   <button class="button" disabled={saving}>{saving?'Saving…':editing?'Save offer':'Create offer'}</button>
  </div>
 </form>
 {/key}
</dialog>

<style>
 .heading-actions .button{margin-top:0}
 .live-line{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:12px 16px;border-radius:12px;background:var(--success-soft);color:var(--ink);font-size:.9rem}
 .pulse{width:9px;height:9px;border-radius:50%;background:var(--success);box-shadow:0 0 0 0 color-mix(in srgb,var(--success) 55%,transparent);animation:pulse 1.8s infinite;flex-shrink:0;display:inline-block}
 @keyframes pulse{70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
 @media (prefers-reduced-motion:reduce){.pulse{animation:none}}

 .offer-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,430px),1fr));gap:16px}
 .offer-card{position:relative;display:flex;flex-direction:column;gap:14px;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden;container-type:inline-size}
 .offer-card::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--line)}
 .tone-on::before{background:var(--success)}.tone-waiting::before{background:var(--primary)}
 .offer-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
 .title{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}
 .title h2{margin:0;font-size:1.15rem;line-height:1.3;overflow-wrap:anywhere}
 .pill{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;font-size:.72rem;font-weight:700;letter-spacing:.02em}
 .pill.on{background:var(--success-soft);color:var(--success)}.pill.waiting{background:var(--primary-soft);color:var(--primary-text)}
 .pill.ended,.pill.off{background:var(--surface-muted);color:var(--muted)}
 /* Edit and Switch off: one height, one edge, joined like a button group. */
 .actions{display:inline-flex;align-items:stretch;flex-shrink:0}
 .actions form{display:flex;margin:0}
 .act{display:inline-flex;align-items:center;gap:6px;height:36px;margin:0;padding:0 13px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap}
 .actions>.act{border-radius:9px 0 0 9px}
 .actions>.act:only-child{border-radius:9px}
 .actions form .act{border-radius:0 9px 9px 0;margin-left:-1px}
 .act:hover{background:var(--surface-muted)}
 .act.danger{color:var(--danger)}

 .when{display:flex;flex-direction:column;gap:8px}
 .when-line{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .when-line strong{font-size:1.05rem}.when-line span{color:var(--muted);font-size:.84rem}
 .bar{height:8px;border-radius:99px;background:var(--surface-muted);overflow:hidden}
 .bar span{display:block;height:100%;border-radius:inherit;background:var(--success)}

 .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
 .chips li{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:var(--surface-muted);color:var(--ink);font-size:.78rem}

 .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin:0;border:1px solid var(--line);border-radius:11px;overflow:hidden;background:var(--line)}
 .stats div{padding:11px 12px;background:var(--surface)}
 .stats dt{font-size:.7rem;color:var(--muted);font-weight:600;letter-spacing:.02em}
 .stats dd{margin:3px 0 0;font-size:1.15rem;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
 .insight{margin:0;font-size:.84rem;color:var(--muted)}
 .stats dd.live{color:var(--success)}
 /* A narrow card (two side by side) keeps three figures to a row only while a full TZS amount still fits. */
 @container (max-width:520px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}

 /* Who used how much: folded away until asked for. */
 .usage{border:1px solid var(--line);border-radius:11px;background:var(--surface)}
 .usage summary{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 12px;cursor:pointer;font-size:.84rem;font-weight:600;color:var(--ink);list-style:none}
 .usage summary::-webkit-details-marker{display:none}
 .usage summary::before{content:"";width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .15s}
 .usage[open] summary::before{transform:rotate(45deg)}
 .usage .count{margin-left:auto;padding:1px 8px;border-radius:99px;background:var(--surface-muted);color:var(--muted);font-size:.75rem}
 .usage-wrap{overflow-x:auto;border-top:1px solid var(--line)}
 .usage table{width:100%;border-collapse:collapse;font-size:.8rem}
 .usage th{padding:8px 12px;text-align:left;font-size:.7rem;font-weight:600;color:var(--muted);white-space:nowrap;background:var(--surface-muted)}
 .usage td{padding:8px 12px;border-top:1px solid var(--line);color:var(--ink);white-space:nowrap}
 .usage .num{text-align:right;font-variant-numeric:tabular-nums}
 .usage .mac{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem}
 .usage .pill{display:inline-block;padding:1px 8px;border-radius:99px;background:var(--surface-muted);color:var(--muted);font-size:.72rem}
 .usage .pill.on{background:var(--success-soft,rgba(22,163,74,.12));color:var(--success)}
 .usage-note{margin:0;padding:8px 12px;border-top:1px solid var(--line);font-size:.75rem;color:var(--muted)}

 .empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:40px 24px}
 .empty-icon{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:var(--primary-soft);color:var(--primary-text)}
 .empty h2{margin:0}.empty p{max-width:440px;margin:0}

 /* The pop-up. Not called .dialog: that name carries the customer pages' reset. */
 /* margin:auto puts the modal back in the middle: the stylesheet reset zeroes the browser's own margin. */
 .offer-dialog{margin:auto;width:min(560px,calc(100% - 24px));max-height:calc(100vh - 24px);padding:0;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.25)}
 .offer-dialog::backdrop{background:rgba(15,23,42,.45)}
 .offer-dialog form{display:flex;flex-direction:column;gap:14px;padding:22px}
 .dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
 .dialog-head h2{margin:0;font-size:1.2rem}
 .icon-close{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--muted);cursor:pointer}
 .field{display:flex;flex-direction:column;gap:6px;margin:0;font-size:.82rem;font-weight:600}
 .field input{height:42px;min-height:42px;margin:0;padding:0 12px;box-sizing:border-box}
 .two{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end}
 .check{display:flex;flex-direction:row;align-items:center;gap:9px;margin:0;font-size:.86rem;font-weight:500}
 .check input{width:18px;height:18px;min-height:0;margin:0;padding:0}
 .hint{margin:-6px 0 0;font-size:.78rem;color:var(--muted)}
 .dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding-top:4px}
 .dialog-actions .button{margin:0;height:42px}
 .offer-dialog .notice{margin:0}

 @media (max-width:640px){
  .offer-card{padding:16px}
  .offer-card header{flex-direction:column;align-items:stretch}
  .actions{width:100%}.actions>.act,.actions form{flex:1}.actions form .act{width:100%;justify-content:center}.actions>.act{justify-content:center}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .two.dates{grid-template-columns:1fr}
  .dialog-actions .button{flex:1}
 }
</style>
