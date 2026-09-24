<script lang="ts">
import {invalidate,goto} from '$app/navigation';
import {navigating} from '$app/state';
import SafetyBadge from '$lib/components/SafetyBadge.svelte';
import Icon from '$lib/components/Icon.svelte';
let {data}=$props();

type Row=Record<string,string>;
const view=$derived(data.view as any);
const ov=$derived(data.overview as any);
const menus=$derived((data.menus?.groups??[]) as {group:string;items:{id:string;label:string;live:boolean;single:boolean}[]}[]);
const current=$derived(menus.flatMap(g=>g.items.map(i=>({...i,group:g.group}))).find(i=>i.id===data.menu)??null);

// ── Formatting: RouterOS sends every value as a string ─────────────────────
const units=['B','KiB','MiB','GiB','TiB'];
function bytes(n:number){let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return (i?n.toFixed(n<10?1:0):String(n))+' '+units[i];}
const isBytes=(key:string)=>/(^|-)(bytes?|byte)(-|$)|^(rx|tx)$|memory$|hdd-space$/.test(key);
function show(key:string,value:string|undefined){
 if(value===undefined||value==='')return '';
 if(value==='true')return 'yes';
 if(value==='false')return 'no';
 if(isBytes(key)){
  if(/^\d+$/.test(value))return bytes(Number(value));
  if(/^\d+\/\d+$/.test(value))return value.split('/').map(v=>bytes(Number(v))).join(' / ');
 }
 if(key==='cpu-load'&&/^\d+$/.test(value))return value+'%';
 // Comma lists (log topics, DNS servers, allowed addresses) need somewhere to wrap.
 if(/^[^\s,]+(,[^\s,]+)+$/.test(value))return value.replaceAll(',',', ');
 return value;
}
const heading=(key:string)=>key.replace(/^configuration\./,'').replace(/-/g,' ');

// ── Search, selection ──────────────────────────────────────────────────────
// Keyed on plain values, which only change when the menu does. The data object
// itself is replaced on every refresh, and must not reset a search in progress.
const menuId=$derived(data.menu as string);
const liveMenu=$derived(!!current?.live);
let query=$state('');
let open=$state<string|null>(null);
$effect(()=>{menuId;query='';open=null;});
const rows=$derived.by(()=>{
 const items=(view?.items??[]) as Row[];
 const q=query.trim().toLowerCase();
 return q?items.filter(r=>Object.values(r).some(v=>v.toLowerCase().includes(q))):items;
});
const rowKey=(row:Row,i:number)=>row['.id']??String(i);

// ── Live refresh ───────────────────────────────────────────────────────────
// On by default for menus that change by the second (active users, log,
// traffic). Paused while the tab is hidden, so a forgotten tab is not
// polling the router all night.
let auto=$state(false);
let refreshing=$state(false);
$effect(()=>{menuId;auto=liveMenu;});
async function refresh(){if(refreshing)return;refreshing=true;try{await invalidate('app:router');}finally{refreshing=false;}}
$effect(()=>{
 if(!auto)return;
 const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},5000);
 return()=>clearInterval(timer);
});

const readAt=$derived(view?.read_at?new Intl.DateTimeFormat('en-GB',{timeStyle:'medium',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(view.read_at)):'');
const memUsed=$derived(ov?.total_memory&&ov?.free_memory?Number(ov.total_memory)-Number(ov.free_memory):null);
const memPct=$derived(memUsed!==null&&ov?.total_memory?Math.round(memUsed/Number(ov.total_memory)*100):null);
const loading=$derived(!!navigating.to&&navigating.to.url.pathname==='/router');
const isLog=$derived(menuId==='log');
const logTone=(topics:string)=>/critical|error/.test(topics)?'bad':/warning/.test(topics)?'warn':'';
</script>

<svelte:head><title>Router · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div>
  <p class="eyebrow"><a href="/network">Network</a></p>
  <h1>{ov?.identity||'Router'}</h1>
  <p>{#if ov?.version}{ov.model||ov.board} · RouterOS {ov.version} · up {ov.uptime}{:else}WinBox's menus, read live from the router.{/if}</p>
 </div>
 <SafetyBadge level="read"/>
</div>

{#if ov?.error}<div class="notice error">{ov.error}</div>{/if}

{#if ov?.version}
 <div class="router-stats" aria-label="Router health">
  <div><span>CPU load</span><strong>{ov.cpu_load??'—'}%</strong><small>{ov.cpu_count?ov.cpu_count+' core'+(ov.cpu_count==='1'?'':'s'):''}</small></div>
  <div><span>Memory</span><strong>{memPct??'—'}%</strong><small>{memUsed!==null?bytes(memUsed)+' of '+bytes(Number(ov.total_memory)):''}</small></div>
  <div><span>Storage free</span><strong>{ov.free_hdd?bytes(Number(ov.free_hdd)):'—'}</strong><small>{ov.total_hdd?'of '+bytes(Number(ov.total_hdd)):''}</small></div>
  <div><span>Router clock</span><strong>{ov.time??'—'}</strong><small>{ov.date??''} {ov.time_zone??''}</small></div>
 </div>
{/if}

<div class="console">
 <nav class="console-menu" aria-label="Router menus">
  <label class="menu-picker"><span class="sr-only">Router menu</span>
   <select value={data.menu} onchange={e=>goto('?menu='+(e.currentTarget as HTMLSelectElement).value,{noScroll:true,keepFocus:true})}>
    {#each menus as g}<optgroup label={g.group}>{#each g.items as item}<option value={item.id}>{item.label}</option>{/each}</optgroup>{/each}
   </select>
  </label>
  <div class="menu-tree">
   {#each menus as g}
    <p class="menu-group">{g.group}</p>
    {#each g.items as item}
     <a href={'?menu='+item.id} data-sveltekit-noscroll class:current={item.id===data.menu} aria-current={item.id===data.menu?'page':undefined}>{item.label}{#if item.live}<span class="live-dot" title="Changes live"></span>{/if}</a>
    {/each}
   {/each}
  </div>
 </nav>

 <section class="console-view" aria-busy={loading||refreshing}>
  <div class="view-head">
   <div>
    <h2>{current?.label??'Unknown menu'}</h2>
    <p class="small">{current?current.group+' · ':''}{#if view?.items}{view.count} {view.count===1?'item':'items'}{#if view.truncated} (newest {view.count}){/if} · read {readAt}{/if}{#if loading} · loading…{/if}</p>
   </div>
   <div class="view-tools">
    {#if !current?.single}<input type="search" placeholder="Find…" aria-label="Filter these items" bind:value={query}>{/if}
    <label class="auto"><input type="checkbox" bind:checked={auto}>Auto refresh</label>
    <button type="button" class="small-button" onclick={refresh} disabled={refreshing}><span class:spin={refreshing}><Icon name="reverse" size={15}/></span>Refresh</button>
   </div>
  </div>

  {#if view?.error}
   {#if view.error!==ov?.error}<div class="notice error">{view.error}</div>{/if}
  {:else if current?.single}
   {@const row=(view?.items?.[0]??{}) as Row}
   <dl class="details kv">
    {#each Object.entries(row).filter(([k])=>!k.startsWith('.')) as [key,value]}<dt>{heading(key)}</dt><dd>{show(key,value)||'—'}</dd>{/each}
   </dl>
  {:else if !rows.length}
   <div class="empty"><h2>{query?'Nothing matches':'No items'}</h2><p>{query?'Try a different search.':'The router has nothing in this list.'}</p></div>
  {:else}
   <div class="table-wrap">
    <table class="rtable" class:log={isLog}>
     <thead><tr><th class="flag-col" title="X disabled · I invalid · D dynamic · R running · S slave">{isLog?'':'Flags'}</th>{#each view.columns as col}<th>{heading(col)}</th>{/each}</tr></thead>
     <tbody>
      {#each rows as row,i (rowKey(row,i))}
       <!-- The row is clickable for the mouse, the way WinBox opens an item; the button is the keyboard's way in. -->
       <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
       <tr class:disabled={row.disabled==='true'} class:dynamic={row.dynamic==='true'} class:selected={open===rowKey(row,i)} class={isLog?logTone(row.topics??''):''}
        onclick={()=>open=open===rowKey(row,i)?null:rowKey(row,i)}>
        <td class="flag-col"><button type="button" class="row-toggle" aria-expanded={open===rowKey(row,i)} aria-label="Show all fields" onclick={e=>{e.stopPropagation();open=open===rowKey(row,i)?null:rowKey(row,i);}}><span class="caret" class:turned={open===rowKey(row,i)}>▸</span>{isLog?'':row['.flags']??''}</button></td>
        {#each view.columns as col}<td class:num={isBytes(col)}>{show(col,row[col])}</td>{/each}
       </tr>
       {#if open===rowKey(row,i)}
        <tr class="row-detail"><td colspan={view.columns.length+1}>
         <dl class="kv-grid">{#each Object.entries(row).filter(([k])=>!k.startsWith('.')||k==='.id') as [key,value]}<div><dt>{heading(key)}</dt><dd>{show(key,value)||'—'}</dd></div>{/each}</dl>
        </td></tr>
       {/if}
      {/each}
     </tbody>
    </table>
   </div>
  {/if}
  <p class="small footnote">Read-only. Passwords, keys and script bodies are never sent to the browser, and customer voucher codes show only their last four characters. Changes still go through WinBox.</p>
 </section>
</div>

<style>
 .router-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
 .router-stats>div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:2px;box-shadow:var(--shadow)}
 .router-stats span{font-size:.75rem;color:var(--muted)}
 .router-stats strong{font-size:1.35rem;color:var(--ink);letter-spacing:-.02em}
 .router-stats small{font-size:.72rem;color:var(--muted);min-height:1em}

 .console{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;align-items:start}
 .console-menu{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px;position:sticky;top:84px;max-height:calc(100vh - 110px);overflow:auto}
 .menu-picker{display:none}
 .menu-group{font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--muted);margin:12px 8px 4px}
 .menu-group:first-child{margin-top:4px}
 .menu-tree a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:7px;font-size:.82rem;color:var(--ink);text-decoration:none}
 .menu-tree a:hover{background:var(--surface-muted)}
 .menu-tree a.current{background:var(--primary-soft);color:var(--primary-text);font-weight:600}
 .live-dot{width:6px;height:6px;border-radius:50%;background:var(--success);flex-shrink:0}

 .console-view{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0;box-shadow:var(--shadow)}
 .console-view[aria-busy=true] .table-wrap{opacity:.72;transition:opacity .2s}
 .view-head{display:flex;justify-content:space-between;align-items:start;gap:14px;margin-bottom:14px;flex-wrap:wrap}
 .view-head h2{margin:0}
 .view-head .small{margin:3px 0 0;color:var(--muted)}
 .view-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
 .view-tools input[type=search]{width:190px;min-height:36px;padding:7px 11px}
 .auto{flex-direction:row;align-items:center;gap:7px;margin:0;font-size:.8rem;font-weight:500;white-space:nowrap}
 .auto input{width:16px;height:16px;min-height:0;accent-color:var(--primary)}
 .spin{display:inline-flex;animation:spin 1s linear infinite}
 @keyframes spin{to{transform:rotate(360deg)}}

 table.rtable{font-size:.8rem}
 table.rtable th{padding:9px 10px;font-size:.74rem;text-transform:capitalize;white-space:nowrap}
 table.rtable td{padding:8px 10px;color:var(--ink);white-space:nowrap;cursor:pointer}
 table.rtable tbody td:first-child{font-weight:400}
 table.rtable td.num{font-variant-numeric:tabular-nums}
 table.log td:last-child{white-space:normal;min-width:260px;overflow-wrap:anywhere}
 table.log td:nth-child(3){white-space:normal;max-width:150px}
 table.log .flag-col{width:28px}
 .flag-col{width:56px;font-family:ui-monospace,monospace;color:var(--muted)!important;font-size:.74rem}
 .row-toggle{display:inline-flex;align-items:center;gap:5px;background:none;border:0;padding:2px;color:inherit;font:inherit;cursor:pointer;min-height:0}
 .caret{display:inline-block;transition:transform .15s}
 .caret.turned{transform:rotate(90deg)}
 tr.disabled td{color:var(--muted)!important;text-decoration:line-through;text-decoration-color:var(--line)}
 tr.dynamic td{font-style:italic}
 tr.selected td{background:var(--primary-soft)}
 tr.warn td{background:var(--warning-soft)}
 tr.bad td{background:var(--danger-soft)}
 tr.row-detail td{cursor:default;white-space:normal;background:var(--surface-muted)}
 .kv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 18px;margin:4px 0}
 .kv-grid div{display:flex;flex-direction:column;min-width:0}
 .kv-grid dt{font-size:.7rem;color:var(--muted);text-transform:capitalize}
 .kv-grid dd{margin:0;font-size:.8rem;overflow-wrap:anywhere}
 .kv{grid-template-columns:minmax(140px,.6fr) 1.4fr;margin:0}
 .kv dt{text-transform:capitalize}
 .footnote{margin:14px 0 0;color:var(--muted)}

 /* Below this width the tree would squeeze the table WinBox-thin, so it becomes a picker. */
 @media (max-width:1100px){
  .router-stats{grid-template-columns:repeat(2,1fr)}
  .console{grid-template-columns:1fr}
  .console-menu{position:static;max-height:none;padding:0;border:0;background:none;box-shadow:none}
  .menu-picker{display:block;margin:0}
  .menu-tree{display:none}
 }
 @media (max-width:800px){
  .view-tools{width:100%}
  .view-tools input[type=search]{flex:1;width:auto}
 }
</style>
