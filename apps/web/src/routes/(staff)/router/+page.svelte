<script lang="ts">
import {invalidate,goto} from '$app/navigation';
import {navigating} from '$app/state';
import {enhance} from '$app/forms';
import {tick,untrack} from 'svelte';
import type {SubmitFunction} from '@sveltejs/kit';
import Icon from '$lib/components/Icon.svelte';
let {data}=$props();

// WinBox, in the portal: the menu down the left, one window at a time on the
// workspace, its lists as tabs. Everything here is read from the router; the
// only thing the browser ever sends is which tab to show.

type Row=Record<string,string>;
type Tab={id:string;label:string;live:boolean;single:boolean};
type Win={id:string;title:string;icon:string;tabs:Tab[]};
type Entry={label:string;icon:string;window?:Win;windows?:Win[]};

const view=$derived(data.view as any);
const ov=$derived(data.overview as any);
const nav=$derived((data.menus?.nav??[]) as Entry[]);
const menuId=$derived(data.menu as string);
const windows=$derived(nav.flatMap(e=>e.window?[e.window]:e.windows??[]));
const currentWindow=$derived(windows.find(w=>w.tabs.some(t=>t.id===menuId))??null);
const currentTab=$derived(currentWindow?.tabs.find(t=>t.id===menuId)??null);
const isTerminal=$derived(menuId==='terminal');
const isLog=$derived(menuId==='log');
const liveMenu=$derived(!!currentTab?.live);
const href=(id:string)=>'?menu='+id;

// IP, System and Tools open like WinBox's submenus; the one holding the open
// window starts open.
const folderOf=(id:string)=>nav.find(e=>e.windows?.some(w=>w.tabs.some(t=>t.id===id)))?.label;
let folders=$state<Record<string,boolean>>(untrack(()=>{const f=folderOf(data.menu);return f?{[f]:true}:{};}));
const currentFolder=$derived(folderOf(menuId));
$effect(()=>{const f=currentFolder;if(f)untrack(()=>{if(!folders[f])folders[f]=true;});});

// ── Formatting: RouterOS sends every value as a string ─────────────────────
const units=['B','KiB','MiB','GiB','TiB'];
function bytes(n:number){let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return (i?n.toFixed(n<10?1:0):String(n))+' '+units[i];}
function bps(n:number){if(n<1000)return Math.round(n)+' bps';const u=['kbps','Mbps','Gbps'];let i=-1;while(n>=1000&&i<u.length-1){n/=1000;i++;}return n.toFixed(1)+' '+u[i];}
const isBytes=(key:string)=>/(^|-)(bytes?|byte)(-|$)|^(rx|tx|size)$|memory$|hdd-space$/.test(key);
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
const NAMES:Record<string,string>={'tx-rate':'Tx','rx-rate':'Rx','l2mtu':'L2 MTU','actual-mtu':'Actual MTU','mac-address':'MAC Address','tx-byte':'Tx Bytes','rx-byte':'Rx Bytes'};
const heading=(key:string)=>NAMES[key]??key.replace(/^configuration\./,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

// WinBox marks an interface's kind with an icon beside its name.
const TYPE_ICON:Record<string,string>={bridge:'bridge',ether:'ethernet',wg:'tunnel',loopback:'loopback',vlan:'vlan',wifi:'wifi',wlan:'wifi'};
const typeIcon=(row:Row)=>menuId==='interfaces'?TYPE_ICON[row.type]??null:null;
// Lists whose order is their meaning get WinBox's # column.
const ORDERED=new Set(['firewall-filter','firewall-nat','firewall-mangle','bridge-ports','simple-queues','queue-tree','walled-garden','walled-garden-ip','hotspot-bindings']);
const ordered=$derived(ORDERED.has(menuId));

// ── Live Tx/Rx for interfaces: the byte counters' change between two reads ──
let lastSample:{at:number;bytes:Map<string,[number,number]>}|null=null;
let rates=$state<Record<string,[number,number]>>({});
$effect(()=>{
 const v=view,id=menuId;
 if(id!=='interfaces'||!v?.items){lastSample=null;rates={};return;}
 const at=Date.parse(v.read_at);
 const now=new Map<string,[number,number]>((v.items as Row[]).map(r=>[r['.id'],[Number(r['tx-byte']||0),Number(r['rx-byte']||0)]]));
 const next:Record<string,[number,number]>={};
 if(lastSample&&at>lastSample.at){
  const dt=(at-lastSample.at)/1000;
  for(const [key,[tx,rx]] of now){const p=lastSample.bytes.get(key);if(p&&tx>=p[0]&&rx>=p[1])next[key]=[(tx-p[0])*8/dt,(rx-p[1])*8/dt];}
 }
 rates=next;lastSample={at,bytes:now};
});

const columns=$derived.by(()=>{
 const cols=((view?.columns??[]) as string[]).filter(c=>c!=='comment');
 if(menuId!=='interfaces')return cols;
 const at=Math.max(cols.indexOf('l2mtu'),cols.indexOf('actual-mtu'),cols.indexOf('type'))+1;
 return [...cols.slice(0,at),'tx-rate','rx-rate',...cols.slice(at)];
});
function cell(row:Row,col:string){
 if(col==='tx-rate'||col==='rx-rate'){const r=rates[row['.id']];return r?bps(r[col==='tx-rate'?0:1]):'—';}
 return show(col,row[col]);
}
function raw(row:Row,col:string):string|number{
 if(col==='tx-rate'||col==='rx-rate')return rates[row['.id']]?.[col==='tx-rate'?0:1]??-1;
 return row[col]??'';
}

// ── Find, sort, select ─────────────────────────────────────────────────────
// Keyed on plain values, which only change when the tab does. The data object
// itself is replaced on every refresh, and must not reset a search in progress.
let query=$state('');
let finding=$state(false);
let open=$state<string|null>(null);
let sortKey=$state<string|null>(null);
let sortDir=$state<1|-1>(1);
$effect(()=>{menuId;untrack(()=>{query='';open=null;sortKey=null;sortDir=1;uploading=false;upMessage=null;picked=null;saveAs='';});});
function sortBy(col:string){if(sortKey===col)sortDir=sortDir===1?-1:1;else{sortKey=col;sortDir=1;}}
const rows=$derived.by(()=>{
 const items=((view?.items??[]) as Row[]).map((row,index)=>({row,index}));
 const q=query.trim().toLowerCase();
 const found=q?items.filter(({row})=>Object.values(row).some(v=>v.toLowerCase().includes(q))):items;
 if(!sortKey)return found;
 const key=sortKey;
 return [...found].sort((a,b)=>{
  const x=raw(a.row,key),y=raw(b.row,key);
  const nx=typeof x==='number'?x:Number(x),ny=typeof y==='number'?y:Number(y);
  const cmp=x!==''&&y!==''&&!isNaN(nx)&&!isNaN(ny)?nx-ny:String(x).localeCompare(String(y),undefined,{numeric:true});
  return cmp*sortDir;
 });
});
const rowKey=(row:Row,i:number)=>row['.id']??String(i);
const selected=$derived(open?((view?.items??[]) as Row[]).find((r,i)=>rowKey(r,i)===open)??null:null);
const itemTitle=(row:Row)=>row.name||row.address||row['dst-address']||row['mac-address']||row.list||row.chain||'Item';

// ── Hotspot uploads (Files window) ─────────────────────────────────────────
// The portal's one write to the router. The panel says exactly what an upload
// will do before it is sent; the server keeps whatever it replaces.
type Capability={enabled:boolean;directory:string|null;types:string[];max_bytes:number};
const files=$derived(data.files as Capability|null);
const uploadDir=$derived(files?.enabled&&files.directory?files.directory:null);
let uploading=$state(false);
let upBusy=$state(false);
let upMessage=$state<{ok:boolean;text:string}|null>(null);
let picked=$state<{name:string;size:number}|null>(null);
let saveAs=$state('');
const target=$derived(uploadDir&&saveAs.trim()?`${uploadDir}/${saveAs.trim().replace(/^\/+/,'')}`:null);
const existing=$derived(target?((view?.items??[]) as Row[]).find(r=>r.name===target)??null:null);
// The pages RouterOS shows customers on their way online.
const customerPage=$derived(/^(login|alogin|status|logout|error|redirect|rlogin|flogin|flogout|radvert)\.html?$/i.test(saveAs.trim()));
function pick(e:Event){const f=(e.currentTarget as HTMLInputElement).files?.[0];picked=f?{name:f.name,size:f.size}:null;if(f)saveAs=f.name;upMessage=null;}
const upload:SubmitFunction=({cancel})=>{
 if(!picked){upMessage={ok:false,text:'Choose a file first.'};cancel();return;}
 if(files&&picked.size>files.max_bytes){upMessage={ok:false,text:`The file is ${Math.ceil(picked.size/1024)} KB; the router accepts at most 60 KB.`};cancel();return;}
 upBusy=true;upMessage=null;
 return async({result,update})=>{
  upBusy=false;
  const d=(result as any).data?.upload;
  if(result.type==='success'){upMessage={ok:true,text:d?.message??'Uploaded.'};picked=null;saveAs='';history=null;await update({reset:true});}
  else if(result.type==='failure')upMessage={ok:false,text:d?.message??'Upload failed.'};
  else if(result.type==='redirect')goto(result.location);
  else upMessage={ok:false,text:'Upload failed.'};
 };
};

// History of a hotspot file: every version the portal saved, newest first.
type Version={id:string;reason:string;size:number;created_at:string;created_by:string|null};
const REASONS:Record<string,string>={BEFORE_UPLOAD:'Replaced by an upload',UPLOADED:'Uploaded',BEFORE_RESTORE:'Replaced by a restore',RESTORED:'Restored'};
let history=$state<{name:string;loading:boolean;items:Version[];error?:string}|null>(null);
let confirming=$state<string|null>(null);
let restoreMessage=$state<{ok:boolean;text:string}|null>(null);
const inHotspot=(row:Row|null)=>!!(row&&files?.directory&&row.type!=='directory'&&row.name?.startsWith(files.directory+'/'));
const when=(iso:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(iso));
async function loadHistory(name:string){
 history={name,loading:true,items:[]};restoreMessage=null;confirming=null;
 try{const r=await fetch('/router/versions?name='+encodeURIComponent(name));if(!r.ok)throw new Error('Could not load the history.');history={name,loading:false,items:(await r.json()).items};}
 catch(e){history={name,loading:false,items:[],error:(e as Error).message};}
}
const selectedName=$derived(selected?.name??null);
$effect(()=>{const n=selectedName;untrack(()=>{if(history&&history.name!==n){history=null;confirming=null;restoreMessage=null;}});});
const restore:SubmitFunction=({formData,cancel})=>{
 const id=String(formData.get('id'));
 // Two clicks: the first arms the button, the second restores.
 if(confirming!==id){confirming=id;cancel();return;}
 confirming=null;
 return async({result,update})=>{
  const d=(result as any).data?.restore;
  restoreMessage={ok:result.type==='success',text:d?.message??(result.type==='success'?'Restored.':'Restore failed.')};
  if(result.type==='success'){const name=history?.name;await update();if(name)loadHistory(name);}
  else if(result.type==='redirect')goto(result.location);
 };
};

// ── Live refresh ───────────────────────────────────────────────────────────
// On by default for lists that change by the second. Paused while the tab is
// hidden, so a forgotten tab is not polling the router all night.
let auto=$state(false);
let refreshing=$state(false);
$effect(()=>{menuId;auto=liveMenu;});
async function refresh(){if(refreshing)return;refreshing=true;try{await invalidate('app:router');}finally{refreshing=false;}}
$effect(()=>{
 if(!auto||isTerminal)return;
 const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},5000);
 return()=>clearInterval(timer);
});

// ── Maximize: the whole WinBox frame over the portal ───────────────────────
let maximized=$state(false);
$effect(()=>{
 if(!maximized)return;
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape')maximized=false;};
 document.addEventListener('keydown',key);
 return()=>document.removeEventListener('keydown',key);
});

const readAt=$derived(view?.read_at?new Intl.DateTimeFormat('en-GB',{timeStyle:'medium',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(view.read_at)):'');
const memPct=$derived(ov?.total_memory&&ov?.free_memory?Math.round((Number(ov.total_memory)-Number(ov.free_memory))/Number(ov.total_memory)*100):null);
const loading=$derived(!!navigating.to&&navigating.to.url.pathname==='/router');
const logTone=(topics:string)=>/critical|error/.test(topics)?'bad':/warning/.test(topics)?'warn':'';

// ── Terminal ───────────────────────────────────────────────────────────────
// Scrollback lives in the page, like a WinBox terminal window: it survives
// switching windows and back, and is gone when the tab closes.
type Line={kind:'cmd'|'out'|'err'|'note';text:string};
let lines=$state<Line[]>([{kind:'note',text:'Read-only terminal. Type help for what it can run. clear empties the screen.'}]);
let command=$state('');
let busy=$state(false);
let past:string[]=[];let pastAt=0;
let screen:HTMLElement|undefined=$state();
let input:HTMLInputElement|undefined=$state();
const prompt=$derived(`[portal@${ov?.identity||'MikroTik'}] >`);
async function toBottom(){await tick();if(screen)screen.scrollTop=screen.scrollHeight;input?.focus();}
const run:SubmitFunction=({formData,cancel})=>{
 const line=String(formData.get('command')??'').trim();
 if(line&&past[past.length-1]!==line)past.push(line);
 pastAt=past.length;command='';
 if(/^(clear|cls)$/i.test(line)){lines=[];cancel();return;}
 lines.push({kind:'cmd',text:`${prompt} ${line}`});
 if(!line){cancel();toBottom();return;}
 busy=true;toBottom();
 return async({result})=>{
  busy=false;
  if(result.type==='success'||result.type==='failure'){const d=result.data as {ok?:boolean;output?:string}|undefined;if(d?.output)lines.push({kind:d.ok?'out':'err',text:d.output});}
  else if(result.type==='redirect')goto(result.location);
  else lines.push({kind:'err',text:'failure: the portal could not run that command'});
  toBottom();
 };
};
function recall(e:KeyboardEvent){
 if(e.key==='ArrowUp'&&pastAt>0){e.preventDefault();command=past[--pastAt];}
 else if(e.key==='ArrowDown'){e.preventDefault();pastAt=Math.min(past.length,pastAt+1);command=past[pastAt]??'';}
 else if(e.key==='l'&&e.ctrlKey){e.preventDefault();lines=[];}
}
</script>

<svelte:head><title>Router · {data.brand}</title></svelte:head>

<div class="wb" class:max={maximized}>
 <header class="wb-title">
  <span class="wb-who">portal@{ov?.identity||'router'}</span>
  <strong class="wb-board">{ov?.model||ov?.board||'Router'}{#if ov?.version}<small>RouterOS {ov.version}</small>{/if}</strong>
  <div class="wb-meta">
   {#if ov?.version}
    <span class="chip" title="CPU load">CPU {ov.cpu_load??'—'}%</span>
    <span class="chip" title="Memory in use">RAM {memPct??'—'}%</span>
    <span class="chip wide" title="Uptime">Up {ov.uptime}</span>
   {/if}
   <span class="chip lock" title="The portal cannot change the router"><Icon name="lock" size={13}/>Read-only</span>
   <button type="button" class="wb-button" aria-pressed={maximized} aria-label={maximized?'Restore':'Maximize'} title={maximized?'Restore (Esc)':'Maximize'} onclick={()=>maximized=!maximized}><Icon name="maximize" size={16}/></button>
  </div>
 </header>
 {#if ov?.error}<div class="wb-alert" role="alert">{ov.error}</div>{/if}

 <div class="wb-body">
  <nav class="wb-nav" aria-label="Router menu">
   <ul>
    {#each nav as entry (entry.label)}
     {#if entry.window}
      {@const w=entry.window}
      <li><a href={href(w.tabs[0].id)} data-sveltekit-noscroll class:current={currentWindow?.id===w.id} aria-current={currentWindow?.id===w.id?'page':undefined}><Icon name={entry.icon} size={18}/><span>{entry.label}</span></a></li>
     {:else}
      <li>
       <button type="button" class="folder" aria-expanded={!!folders[entry.label]} onclick={()=>folders[entry.label]=!folders[entry.label]}><Icon name={entry.icon} size={18}/><span>{entry.label}</span><span class="chev" aria-hidden="true">›</span></button>
       {#if folders[entry.label]}
        <ul class="sub">{#each entry.windows??[] as w (w.id)}<li><a href={href(w.tabs[0].id)} data-sveltekit-noscroll class:current={currentWindow?.id===w.id} aria-current={currentWindow?.id===w.id?'page':undefined}>{w.title}</a></li>{/each}</ul>
       {/if}
      </li>
     {/if}
    {/each}
   </ul>
  </nav>

  <section class="wb-desk">
   <label class="menu-picker"><span class="sr-only">Router window</span>
    <select value={currentWindow?.tabs[0].id??'none'} onchange={e=>goto(href((e.currentTarget as HTMLSelectElement).value),{noScroll:true,keepFocus:true})}>
     <option value="none">Choose a window…</option>
     {#each nav as entry (entry.label)}
      {#if entry.window}<option value={entry.window.tabs[0].id}>{entry.label}</option>
      {:else}<optgroup label={entry.label}>{#each entry.windows??[] as w (w.id)}<option value={w.tabs[0].id}>{w.title}</option>{/each}</optgroup>{/if}
     {/each}
    </select>
   </label>

   {#if !currentWindow}
    <div class="wb-empty"><Icon name="router" size={30}/><p>Open a window from the menu on the left.</p></div>
   {:else}
    <div class="win" aria-busy={loading||refreshing}>
     <div class="win-head">
      <span class="win-title"><Icon name={currentWindow.icon} size={17}/>{currentWindow.title}</span>
      <div class="win-tabs">
       {#if currentWindow.tabs.length>1}
        {#each currentWindow.tabs as t (t.id)}<a href={href(t.id)} data-sveltekit-noscroll class:active={t.id===menuId} aria-current={t.id===menuId?'page':undefined}>{t.label}</a>{/each}
       {/if}
      </div>
      <div class="win-actions">
       {#if !isTerminal&&!currentTab?.single}<button type="button" class:on={finding} aria-pressed={finding} aria-label="Find" title="Find" onclick={()=>{finding=!finding;if(!finding)query='';}}><Icon name="filter" size={16}/></button>{/if}
       {#if !isTerminal}
        <button type="button" class:on={auto} aria-pressed={auto} aria-label="Live refresh" title={auto?'Live: refreshing every 5 seconds':'Live refresh is off'} onclick={()=>auto=!auto}><Icon name="live" size={16}/></button>
        <button type="button" aria-label="Refresh" title="Refresh" onclick={refresh} disabled={refreshing}><span class:spin={refreshing}><Icon name="reverse" size={16}/></span></button>
       {/if}
       <button type="button" aria-label={maximized?'Restore':'Maximize'} title={maximized?'Restore (Esc)':'Maximize'} onclick={()=>maximized=!maximized}><Icon name="maximize" size={16}/></button>
       <a href={href('none')} data-sveltekit-noscroll aria-label="Close window" title="Close"><Icon name="close" size={16}/></a>
      </div>
     </div>

     {#if !isTerminal}
      <div class="win-toolbar">
       {#if menuId==='files'&&uploadDir}
        <span class="rw" title="In this window the portal can put text files into the hotspot folder. Everything else stays read-only."><Icon name="alert" size={14}/>Hotspot uploads on</span>
        <button type="button" class="tool-button" class:on={uploading} aria-pressed={uploading} onclick={()=>{uploading=!uploading;open=null;upMessage=null;}}><Icon name="plus" size={14}/>Upload to {uploadDir}/</button>
       {:else}
        <span class="ro" title="The portal cannot change the router. Changes still go through WinBox."><Icon name="lock" size={14}/>Read-only</span>
        {#if menuId==='files'&&files&&!files.enabled}<span class="muted-note" title="Create the portal-files account on the router and add its username and password to the server to turn uploads on.">Uploads not set up</span>{/if}
       {/if}
       {#if finding}<input type="search" placeholder="Find…" aria-label="Find in this list" bind:value={query}>{/if}
       <span class="spacer"></span>
       {#if view?.items&&!currentTab?.single}<span class="count" title="Selected (total)"><Icon name="check" size={14}/>{selected?1:0} ({query?rows.length+' of '+view.count:view.count}){#if view.truncated} · newest {view.count}{/if}</span>{/if}
       {#if readAt}<span class="stamp">{loading?'loading…':'read '+readAt}</span>{/if}
      </div>
     {/if}

     <div class="win-body" class:split={!!selected||(uploading&&!!uploadDir)}>
      {#if isTerminal}
       <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
       <div class="terminal" onclick={()=>input?.focus()}>
        <div class="screen" bind:this={screen} role="log" aria-live="polite" aria-label="Terminal output">{#each lines as line, i (i)}<pre class={line.kind}>{line.text}</pre>{/each}{#if busy}<pre class="note">…</pre>{/if}</div>
        <form method="POST" action="?/terminal" use:enhance={run} class="command-line">
         <label for="terminal-command" class="prompt">{prompt}</label>
         <input id="terminal-command" name="command" bind:value={command} bind:this={input} onkeydown={recall} autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" disabled={busy}>
        </form>
       </div>
      {:else if view?.error}
       <div class="win-message error">{view.error!==ov?.error?view.error:'The router is not answering.'}</div>
      {:else if currentTab?.single}
       {@const row=(view?.items?.[0]??{}) as Row}
       <dl class="record">
        {#each Object.entries(row).filter(([k])=>!k.startsWith('.')) as [key,value] (key)}<dt>{heading(key)}</dt><dd>{show(key,value)||'—'}</dd>{/each}
       </dl>
      {:else if !rows.length}
       <div class="win-message">{query?'Nothing matches that search.':'No items.'}</div>
      {:else}
       <div class="table-scroll">
        <table class="rtable" class:log={isLog}>
         <thead><tr>
          {#if ordered}<th class="num-col">#</th>{/if}
          <th class="flag-col" title="X disabled · I invalid · D dynamic · R running · S slave"></th>
          {#each columns as col (col)}<th aria-sort={sortKey===col?(sortDir===1?'ascending':'descending'):undefined}><button type="button" class="sort" onclick={()=>sortBy(col)}>{heading(col)}<span class="arrow" aria-hidden="true">{sortKey===col?(sortDir===1?'▲':'▼'):''}</span></button></th>{/each}
         </tr></thead>
         <tbody>
          {#each rows as {row,index} (rowKey(row,index))}
           {@const key=rowKey(row,index)}
           {#if row.comment}<tr class="comment-row"><td colspan={columns.length+(ordered?2:1)}>{row.comment}</td></tr>{/if}
           <!-- The row is clickable for the mouse, the way WinBox opens an item; the button is the keyboard's way in. -->
           <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
           <tr class:disabled={row.disabled==='true'} class:dynamic={row.dynamic==='true'} class:selected={open===key} class={isLog?logTone(row.topics??''):''} onclick={()=>open=open===key?null:key}>
            {#if ordered}<td class="num-col">{index}</td>{/if}
            <td class="flag-col"><button type="button" class="row-toggle" aria-pressed={open===key} aria-label="Show details" onclick={e=>{e.stopPropagation();open=open===key?null:key;}}>{isLog?'':row['.flags']??''}</button></td>
            {#each columns as col, j (col)}
             <td class:rate={col==='tx-rate'||col==='rx-rate'}>{#if j===0&&typeIcon(row)}<span class="type-icon"><Icon name={typeIcon(row)!} size={14}/></span>{/if}{cell(row,col)}</td>
            {/each}
           </tr>
          {/each}
         </tbody>
        </table>
       </div>
       {#if uploading&&uploadDir&&files}
        <aside class="detail" aria-label="Upload a hotspot page">
         <div class="detail-head"><strong>Upload to {uploadDir}/</strong><button type="button" aria-label="Close upload" onclick={()=>uploading=false}><Icon name="close" size={15}/></button></div>
         <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={upload} class="upload-form">
          <label>File<input type="file" name="file" accept={files.types.map(t=>'.'+t).join(',')} onchange={pick}></label>
          <label>Save as<input name="name" bind:value={saveAs} placeholder="login.html" autocomplete="off" spellcheck="false"><small>{uploadDir}/{saveAs||'…'}</small></label>
          {#if picked&&target}
           <p class="impact">{#if existing}Replaces <strong>{target}</strong> ({bytes(Number(existing.size||0))}{existing['last-modified']?', changed '+existing['last-modified']:''}). The current file is saved first and can be put back from its History.{:else}Creates <strong>{target}</strong>.{/if}</p>
           {#if customerPage}<p class="impact warn">Customers see this page when they connect. Open it in a browser and check it before uploading.</p>{/if}
          {/if}
          <button class="small-button" disabled={!picked||upBusy}>{upBusy?'Uploading…':existing?'Replace file':'Upload file'}</button>
         </form>
         {#if upMessage}<p class="result" class:ok={upMessage.ok} role="status">{upMessage.text}</p>{/if}
         <p class="note">{files.types.map(t=>'.'+t).join(' ')} files up to 60 KB, into this folder only. Every upload is recorded with your name.</p>
        </aside>
       {:else if selected}
        <aside class="detail" aria-label="Item details">
         <div class="detail-head"><strong>{itemTitle(selected)}</strong><button type="button" aria-label="Close details" onclick={()=>open=null}><Icon name="close" size={15}/></button></div>
         <dl class="record">{#each Object.entries(selected).filter(([k])=>!k.startsWith('.')||k==='.id') as [key,value] (key)}<dt>{heading(key)}</dt><dd>{show(key,value)||'—'}</dd>{/each}</dl>
         {#if inHotspot(selected)}
          {@const name=selected.name}
          <div class="history">
           <div class="history-head"><strong>History</strong>{#if history?.name!==name}<button type="button" class="link-button" onclick={()=>loadHistory(name)}>Show versions</button>{/if}</div>
           {#if history?.name===name}
            {#if history.loading}<p class="note">Loading…</p>
            {:else if history.error}<p class="result">{history.error}</p>
            {:else if !history.items.length}<p class="note">No versions saved yet. The first upload keeps a copy of the file that is there now.</p>
            {:else}
             <ul>
              {#each history.items as v (v.id)}
               <li>
                <div><span>{REASONS[v.reason]??v.reason}</span><small>{when(v.created_at)} · {bytes(v.size)}{v.created_by?' · '+v.created_by:''}</small></div>
                {#if uploadDir}<form method="POST" action="?/restore" use:enhance={restore}><input type="hidden" name="id" value={v.id}><button class="small-button" class:arm={confirming===v.id}>{confirming===v.id?'Confirm restore':'Restore'}</button></form>{/if}
               </li>
              {/each}
             </ul>
            {/if}
            {#if restoreMessage}<p class="result" class:ok={restoreMessage.ok} role="status">{restoreMessage.text}</p>{/if}
           {/if}
          </div>
         {/if}
        </aside>
       {/if}
      {/if}
     </div>
    </div>
   {/if}
  </section>
 </div>
</div>
<p class="small footnote">Passwords, keys, script bodies and file contents are never sent to the browser, and customer voucher codes show only their last four characters.</p>

<style>
 .wb{background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
 .wb.max{position:fixed;inset:0;z-index:80;border-radius:0;border:0}

 .wb-title{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid var(--line);font-size:.82rem}
 .wb-who{color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .wb-board{color:var(--ink);font-size:.9rem;display:flex;align-items:baseline;gap:8px;white-space:nowrap}
 .wb-board small{color:var(--muted);font-weight:500;font-size:.74rem}
 .wb-meta{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
 .chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
 .chip.lock{color:var(--success);background:var(--success-soft);border-color:transparent;font-weight:650}
 .wb-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--muted);cursor:pointer;min-height:0;padding:0}
 .wb-button:hover{color:var(--ink);background:var(--surface-muted)}
 .wb-alert{padding:9px 14px;background:var(--danger-soft);color:var(--danger);font-size:.82rem;border-bottom:1px solid var(--line)}

 .wb-body{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:560px;flex:1}
 .max .wb-body{min-height:0}
 .wb-nav{border-right:1px solid var(--line);padding:8px 6px;overflow:auto;background:var(--surface)}
 .wb-nav ul{list-style:none;margin:0;padding:0}
 .wb-nav a,.wb-nav .folder{display:flex;align-items:center;gap:9px;width:100%;padding:6px 8px;border-radius:6px;font-size:.84rem;color:var(--ink);text-decoration:none;background:none;border:0;cursor:pointer;text-align:left;min-height:0;font-weight:500}
 .wb-nav a :global(svg),.wb-nav .folder :global(svg){color:var(--primary-text);flex-shrink:0}
 .wb-nav a:hover,.wb-nav .folder:hover{background:var(--surface-muted)}
 .wb-nav a.current{background:var(--primary-soft);color:var(--primary-text);font-weight:650}
 .folder .chev{margin-left:auto;color:var(--muted);transition:transform .15s;font-size:1rem;line-height:1}
 .folder[aria-expanded=true] .chev{transform:rotate(90deg)}
 .wb-nav .sub a{padding:5px 8px 5px 35px;font-size:.8rem}

 .wb-desk{background:var(--background);padding:10px;min-width:0;display:flex;flex-direction:column}
 .menu-picker{display:none}
 .wb-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:.85rem}

 .win{background:var(--surface);border:1px solid color-mix(in srgb,var(--primary) 40%,var(--line));border-radius:8px;display:flex;flex-direction:column;min-height:0;flex:1;overflow:hidden}
 .win-head{display:flex;align-items:center;gap:10px;background:var(--surface-muted);border-bottom:1px solid var(--line);padding:0 6px 0 10px;min-height:40px}
 .win-title{display:flex;align-items:center;gap:7px;font-weight:700;font-size:.86rem;color:var(--ink);white-space:nowrap}
 .win-title :global(svg){color:var(--primary-text)}
 .win-tabs{display:flex;align-items:flex-end;gap:2px;overflow-x:auto;flex:1;align-self:stretch;padding-top:6px;scrollbar-width:thin}
 .win-tabs a{padding:6px 11px;font-size:.8rem;color:var(--muted);text-decoration:none;white-space:nowrap;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0}
 .win-tabs a:hover{color:var(--ink)}
 .win-tabs a.active{background:var(--surface);color:var(--ink);font-weight:650;border-color:var(--line);margin-bottom:-1px;padding-bottom:7px}
 .win-actions{display:flex;align-items:center;gap:2px}
 .win-actions button,.win-actions a{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:6px;background:none;color:var(--muted);cursor:pointer;min-height:0;padding:0}
 .win-actions button:hover,.win-actions a:hover{background:var(--surface);color:var(--ink)}
 .win-actions button.on{color:var(--primary-text);background:var(--primary-soft)}
 .win-actions button:disabled{opacity:.6}
 .spin{display:inline-flex;animation:spin 1s linear infinite}
 @keyframes spin{to{transform:rotate(360deg)}}

 .win-toolbar{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--line);font-size:.78rem;color:var(--muted);flex-wrap:wrap}
 .win-toolbar input[type=search]{width:220px;min-height:30px;padding:4px 10px;font-size:.8rem}
 .ro,.count{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
 .ro{color:var(--success);font-weight:600}
 .count{font-variant-numeric:tabular-nums;color:var(--ink)}
 .spacer{flex:1}
 .stamp{font-variant-numeric:tabular-nums}

 .win-body{display:grid;grid-template-columns:minmax(0,1fr);min-height:0;flex:1}
 .win-body.split{grid-template-columns:minmax(0,1fr) 300px}
 .win[aria-busy=true] .table-scroll{opacity:.75;transition:opacity .2s}
 .win-message{padding:28px 16px;color:var(--muted);font-size:.85rem;text-align:center}
 .win-message.error{color:var(--danger)}

 .table-scroll{overflow:auto;max-height:min(66vh,760px)}
 .max .table-scroll{max-height:none}
 table.rtable{font-size:.8rem;width:100%;border-collapse:separate;border-spacing:0}
 table.rtable th{position:sticky;top:0;z-index:1;background:var(--surface);padding:0;font-size:.76rem;font-weight:500;color:var(--muted);border-bottom:1px solid var(--line);white-space:nowrap;text-align:left}
 .sort{display:flex;align-items:center;gap:4px;width:100%;background:none;border:0;padding:8px 10px;font:inherit;color:inherit;cursor:pointer;min-height:0;text-align:left}
 .sort:hover{color:var(--ink)}
 .arrow{font-size:.6rem}
 table.rtable td{padding:6px 10px;color:var(--ink);white-space:nowrap;cursor:pointer;border-bottom:1px solid var(--surface-muted)}
 table.rtable tbody td:first-child{font-weight:400}
 td.rate{font-variant-numeric:tabular-nums}
 .type-icon{display:inline-flex;vertical-align:-2px;margin-right:6px;color:var(--primary-text)}
 .num-col{width:34px;color:var(--muted)!important;font-variant-numeric:tabular-nums;text-align:right}
 table.rtable th.num-col{padding:8px 10px}
 .flag-col{width:40px;font-family:ui-monospace,monospace;color:var(--muted)!important;font-size:.74rem}
 .row-toggle{background:none;border:0;padding:2px;color:inherit;font:inherit;cursor:pointer;min-height:0;min-width:18px;text-align:left}
 tr.comment-row td{color:var(--muted);font-size:.74rem;padding:5px 10px 1px 50px;border-bottom:0;cursor:default;background:var(--surface)}
 tr.disabled td{color:var(--muted)!important}
 tr.dynamic td{font-style:italic}
 tr.selected td{background:var(--primary-soft)}
 tbody tr:hover td{background:var(--surface-muted)}
 tbody tr.selected:hover td{background:var(--primary-soft)}
 tr.warn td{background:var(--warning-soft)}
 tr.bad td{background:var(--danger-soft)}
 table.log td:last-child{white-space:normal;min-width:260px;overflow-wrap:anywhere}
 table.log td:nth-child(3){white-space:normal;max-width:150px}

 .detail{border-left:1px solid var(--line);overflow:auto;max-height:min(66vh,760px);background:var(--surface)}
 .detail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface)}
 .detail-head strong{font-size:.84rem;overflow-wrap:anywhere}
 .detail-head button{display:inline-flex;border:0;background:none;color:var(--muted);cursor:pointer;padding:4px;min-height:0}
 .record{display:grid;grid-template-columns:minmax(120px,max-content) 1fr;gap:0;margin:0;font-size:.8rem}
 .record dt{color:var(--muted);text-align:right;padding:6px 10px 6px 14px;border-bottom:1px solid var(--surface-muted)}
 .record dd{margin:0;padding:6px 14px 6px 4px;overflow-wrap:anywhere;color:var(--ink);border-bottom:1px solid var(--surface-muted)}
 .detail .record{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}

 /* Hotspot uploads: the one place this page can change the router, so it looks different. */
 .rw{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;color:var(--warning);font-weight:600}
 .tool-button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:6px;padding:4px 10px;font-size:.78rem;cursor:pointer;min-height:0}
 .tool-button:hover,.tool-button.on{background:var(--warning-soft);border-color:var(--warning)}
 .muted-note{color:var(--muted)}
 .upload-form{display:flex;flex-direction:column;gap:10px;padding:12px 14px 4px}
 .upload-form label{margin:0;font-size:.8rem;gap:5px}
 .upload-form label small{color:var(--muted);font-weight:400;overflow-wrap:anywhere}
 .upload-form input{min-height:36px;padding:6px 10px;font-size:.82rem}
 .upload-form .small-button{align-self:flex-start}
 .impact{margin:0;font-size:.78rem;background:var(--surface-muted);border-radius:6px;padding:8px 10px;color:var(--ink)}
 .impact.warn{background:var(--warning-soft);color:var(--warning)}
 .result{margin:8px 14px;font-size:.8rem;color:var(--danger)}
 .result.ok{color:var(--success)}
 .note{margin:8px 14px 12px;font-size:.74rem;color:var(--muted)}
 .history{border-top:1px solid var(--line);margin-top:6px}
 .history-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 4px;font-size:.82rem}
 .link-button{background:none;border:0;color:var(--primary-text);cursor:pointer;font-size:.78rem;padding:0;min-height:0}
 .history ul{list-style:none;margin:0;padding:0 8px 8px}
 .history li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 6px;border-bottom:1px solid var(--surface-muted);font-size:.78rem}
 .history li div{display:flex;flex-direction:column;min-width:0}
 .history li small{color:var(--muted);font-size:.7rem}
 .history .small-button{padding:4px 9px;font-size:.74rem;min-height:0}
 .history .small-button.arm{background:var(--warning-soft);border-color:var(--warning);color:var(--warning)}

 /* The terminal is dark in both themes, as WinBox's is. */
 .terminal{background:#0b1220;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8rem;color:#e5e7eb;cursor:text;display:flex;flex-direction:column;min-height:0}
 .screen{height:min(58vh,560px);overflow:auto}
 .max .screen{height:auto;flex:1}
 .screen pre{margin:0 0 6px;white-space:pre;font:inherit;color:inherit}
 .screen pre.cmd{color:#93c5fd}
 .screen pre.err{color:#fca5a5;white-space:pre-wrap}
 .screen pre.note{color:#94a3b8;white-space:pre-wrap}
 .command-line{display:flex;align-items:center;gap:8px;border-top:1px solid #1f2a3d;padding-top:10px;margin-top:4px}
 .prompt{flex-direction:row;margin:0;font-weight:600;color:#93c5fd;white-space:nowrap;font-size:inherit}
 .command-line input{flex:1;min-width:0;background:transparent;border:0;color:#f8fafc;font:inherit;padding:4px 0;min-height:0;outline:none;caret-color:#93c5fd}
 .command-line input:disabled{background:transparent;opacity:.6}

 .footnote{margin:12px 2px 0;color:var(--muted)}

 @media (max-width:1180px){.win-body.split{grid-template-columns:minmax(0,1fr)}.detail{border-left:0;border-top:1px solid var(--line);max-height:none}.chip.wide{display:none}}
 /* Narrow screens: the menu becomes a picker and the window takes the width. */
 @media (max-width:1000px){
  .wb-body{grid-template-columns:1fr}
  .wb-nav{display:none}
  .menu-picker{display:block;margin:0 0 10px}
  .wb-title{grid-template-columns:1fr auto}
  .wb-who{display:none}
 }
 @media (max-width:640px){.wb-meta .chip:not(.lock){display:none}.win-title{display:none}}
</style>
