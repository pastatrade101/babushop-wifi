<script lang="ts">
import {page} from '$app/state';
import {afterNavigate} from '$app/navigation';
import {untrack} from 'svelte';
import Icon from '$lib/components/Icon.svelte';
import ThemeToggle from '$lib/components/ThemeToggle.svelte';
let {data,children}=$props();let menuOpen=$state(false);

// Grouped so a long menu reads as a few areas of work rather than one list.
// Overview stands alone; every other group is a dropdown.
type Link=[string,string,string];
const groups:{id:string;label:string;links:Link[]}[]=[
 {id:'home',label:'',links:[['/','Overview','overview']]},
 {id:'selling',label:'Selling',links:[['/sell','Sell internet','plus'],['/vouchers','Vouchers','ticket'],['/voucher-batches','Voucher batches','batch'],['/packages','Packages','package']]},
 {id:'money',label:'Money',links:[['/sales','Sales','sales'],['/payments','Mobile payments','payment'],['/revenue','Revenue','money'],['/reports','Reports','reports']]},
 {id:'access',label:'Wi-Fi access',links:[['/access-grants','Access grants','grants'],['/sessions','Wi-Fi sessions','wifi']]},
 {id:'network',label:'Network',links:[['/network','Network','network'],['/router','Router','router'],['/settings','Network setup','settings']]},
 {id:'admin',label:'Administration',links:[['/staff','Staff','staff']]},
];
const cashier=['/','/sell','/vouchers','/packages','/sales','/payments'];
// A detail page such as /network/<id> should keep its section lit in the sidebar.
const isCurrent=(url:string)=>page.url.pathname===url||(url!=='/'&&page.url.pathname.startsWith(url+'/'));
const visible=$derived(groups.map(g=>({...g,links:g.links.filter(([url])=>data.staff.role==='ADMIN'||cashier.includes(url))})).filter(g=>g.links.length));
const current=$derived(groups.flatMap(g=>g.links).find(([url])=>isCurrent(url))?.[1]||'Workspace');
const groupOf=()=>groups.find(g=>g.links.some(([url])=>isCurrent(url)))?.id;

// The group holding the current page starts open, including on the server
// render, so the active link is never hidden behind a closed dropdown.
let open=$state<Record<string,boolean>>({[groupOf()??'']:true});
$effect(()=>{const id=groupOf();if(id&&!open[id])open[id]=true;});

// Desktop only: a narrow icon rail. The choice is a cookie so the server
// renders it the right way round on the next visit.
// Seeded from the server's value once, synchronously, so the server render
// already matches; after that the toggle owns it.
let collapsed=$state(untrack(()=>data.navCollapsed));
function toggleNav(){
 collapsed=!collapsed;
 try{document.cookie='wifi-nav='+(collapsed?'collapsed':'expanded')+'; path=/; max-age=31536000; samesite=lax';}catch{/* cookies blocked: still toggles for this visit */}
}

// Account menu: the signed-in email stands in for a display name.
const accountName=$derived(data.email||data.staff.display_name);
const roleLabel=$derived(data.staff.role==='ADMIN'?'Administrator':'Cashier');
let userOpen=$state(false);let userMenu:HTMLElement|undefined=$state();
$effect(()=>{
 if(!userOpen)return;
 const outside=(e:MouseEvent)=>{if(userMenu&&!userMenu.contains(e.target as Node))userOpen=false;};
 const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')userOpen=false;};
 document.addEventListener('click',outside);document.addEventListener('keydown',escape);
 return()=>{document.removeEventListener('click',outside);document.removeEventListener('keydown',escape);};
});
afterNavigate(()=>{userOpen=false;menuOpen=false;moreOpen=false;searchOpen=false;});

// ── Phone: an app shell ──────────────────────────────────────────────────────
// Below 800px the sidebar and the desktop top bar give way to a slim app bar
// (logo, page name, search), a bottom tab bar for the five places a cashier
// goes most, and a "More" sheet holding everything else, the theme and the
// account. The desktop markup stays; CSS decides which shows.
const tabs:[string,string,string,boolean][]=[['/','Home','overview',false],['/vouchers','Vouchers','ticket',false],['/sell','Sell','plus',true],['/sales','Sales','sales',false]];
const onTab=$derived(tabs.some(([url])=>isCurrent(url)));
let moreOpen=$state(false);let searchOpen=$state(false);
let sheet:HTMLElement|undefined=$state();
$effect(()=>{
 if(!moreOpen)return;
 // The page behind a sheet should not scroll, and Escape should close it.
 const previous=document.body.style.overflow;document.body.style.overflow='hidden';
 const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')moreOpen=false;};
 document.addEventListener('keydown',escape);sheet?.focus();
 return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape);};
});
const focusOnMount=(node:HTMLElement)=>{node.focus();};

// Tables become stacked cards on a phone. Each cell needs its column's name to
// show beside it, so label them from the header row -- and again whenever a
// page swaps its rows, which a MutationObserver catches.
function labelTables(root:ParentNode){
 for(const table of root.querySelectorAll('.table-wrap table')){
  const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent?.trim()??'');
  for(const row of table.querySelectorAll('tbody tr'))[...row.children].forEach((cell,i)=>{
   if(cell instanceof HTMLElement&&cell.dataset.label===undefined)cell.dataset.label=(cell as HTMLTableCellElement).colSpan>1?'':heads[i]??'';
  });
 }
}
$effect(()=>{
 const main=document.getElementById('main-content');if(!main)return;
 labelTables(main);
 const observer=new MutationObserver(()=>labelTables(main));
 observer.observe(main,{childList:true,subtree:true});
 return()=>observer.disconnect();
});
</script>
<a class="skip-link" href="#main-content">Skip to content</a>
<div class="workspace" class:nav-collapsed={collapsed}>
 <aside class="sidebar">
  <div class="sidebar-top"><a class="brand" href="/" title={collapsed?data.brand:undefined}><span class="brand-mark"><img src="/logo.webp" alt="" width="38" height="38"></span><span>{data.brand}</span></a><button class="menu-toggle" aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} aria-controls="workspace-navigation" onclick={()=>menuOpen=!menuOpen}><Icon name={menuOpen?'close':'menu'}/></button></div>
  <div id="workspace-navigation" class="sidebar-body" class:open={menuOpen}>
   <p class="sidebar-label">WORKSPACE</p>
   <nav aria-label="Main navigation">
    {#each visible as group (group.id)}
     <div class="nav-group">
      {#if group.label}
       <button type="button" class="nav-group-toggle" aria-label={group.label} aria-expanded={!!open[group.id]} aria-controls={'nav-'+group.id} onclick={()=>open[group.id]=!open[group.id]}><span>{group.label}</span><Icon name="chevron" size={16}/></button>
      {/if}
      <div class="nav-group-items" class:closed={!!group.label&&!open[group.id]} id={'nav-'+group.id}>
       {#each group.links as [url,label,icon]}<a href={url} class:current={isCurrent(url)} aria-current={isCurrent(url)?'page':undefined} title={collapsed?label:undefined} aria-label={collapsed?label:undefined}><Icon name={icon} size={18}/><span class="nav-label">{label}</span></a>{/each}
      </div>
     </div>
    {/each}
   </nav>
  </div>
 </aside>
 <div class="workspace-main">
  <header class="topbar">
   <div class="m-appbar-start"><a href="/" class="m-logo" aria-label={data.brand+' home'}><img src="/logo.webp" alt="" width="32" height="32"></a><span class="m-title">{current}</span></div>
   <div class="topbar-start">
    <button type="button" class="nav-collapse" aria-label={collapsed?'Expand navigation':'Collapse navigation'} aria-pressed={collapsed} title={collapsed?'Expand navigation':'Collapse navigation'} onclick={toggleNav}><Icon name={collapsed?'menu':'panel'} size={19}/></button>
    <form class="workspace-search" method="GET" action="/vouchers" role="search"><Icon name="search" size={20}/><input name="q" aria-label="Search vouchers" placeholder="Search vouchers…"><button type="submit" class="icon-button" aria-label="Search"><Icon name="arrow" size={17}/></button></form>
   </div>
   <div class="topbar-meta">
    <ThemeToggle/>
    <span class="mode-pill" class:test-mode={data.mode!=='live'}><span class="status-dot"></span>{data.mode==='live'?'Live mode':'Test mode'}</span>
    <div class="user-menu" bind:this={userMenu}>
     <button type="button" class="user-trigger" aria-label={'Account menu: '+accountName+', '+roleLabel} aria-haspopup="menu" aria-expanded={userOpen} aria-controls="account-menu" onclick={()=>userOpen=!userOpen}>
      <span class="user-avatar" aria-hidden="true">{accountName.slice(0,1).toUpperCase()}</span>
      <span class="user-text"><strong>{accountName}</strong><small>{roleLabel}</small></span>
      <span class="user-chevron"><Icon name="chevron" size={16}/></span>
     </button>
     {#if userOpen}
      <div class="user-popover" id="account-menu" role="menu">
       <div class="user-popover-head"><span class="user-avatar" aria-hidden="true">{accountName.slice(0,1).toUpperCase()}</span><div><strong>{accountName}</strong><span>{roleLabel}</span></div></div>
       <form method="POST" action="/logout"><button class="user-signout" role="menuitem"><Icon name="logout" size={18}/>Sign out</button></form>
      </div>
     {/if}
    </div>
   </div>
   <button type="button" class="m-icon-button" aria-label="Search vouchers" aria-expanded={searchOpen} aria-controls="m-search" onclick={()=>searchOpen=!searchOpen}><Icon name={searchOpen?'close':'search'} size={20}/></button>
  </header>
  {#if searchOpen}
   <form class="m-search" id="m-search" method="GET" action="/vouchers" role="search"><input name="q" type="search" aria-label="Search vouchers" placeholder="Search vouchers…" use:focusOnMount><button class="button">Search</button></form>
  {/if}
  {#if data.mode!=='live'}<div class="simulation" role="status"><strong>Portal test mode</strong><span>Sales are real records. {data.networkProvider==='mikrotik'?'The separate RADIUS service may already allow Wi-Fi access. Switch the API and web deployment to live after voucher checks pass.':'Portal internet authorization is simulated.'}</span>{#if data.staff.role==='ADMIN'}<a href="/settings">View setup →</a>{/if}</div>{/if}
  <main id="main-content" class="content" tabindex="-1"><div class="breadcrumb no-print"><a href="/">Workspace</a><span>/</span><strong>{current}</strong></div>{@render children()}</main>
  <footer class="workspace-footer">{data.brand}<span>Prepaid internet, made simple.</span></footer>
 </div>

 <nav class="m-tabbar" aria-label="Quick navigation">
  {#each tabs as [url,label,icon,accent] (url)}
   <a href={url} class:current={isCurrent(url)} class:accent aria-current={isCurrent(url)?'page':undefined}><span class="m-tab-icon"><Icon name={icon} size={21}/></span><span>{label}</span></a>
  {/each}
  <button type="button" class:current={!onTab} aria-expanded={moreOpen} aria-controls="m-more" onclick={()=>moreOpen=true}><span class="m-tab-icon"><Icon name="menu" size={21}/></span><span>More</span></button>
 </nav>

 {#if moreOpen}
  <button type="button" class="m-backdrop" aria-label="Close menu" tabindex="-1" onclick={()=>moreOpen=false}></button>
  <div class="m-sheet" id="m-more" role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1" bind:this={sheet}>
   <div class="m-grab" aria-hidden="true"></div>
   <div class="m-account">
    <span class="user-avatar" aria-hidden="true">{accountName.slice(0,1).toUpperCase()}</span>
    <div><strong>{accountName}</strong><span>{roleLabel} · {data.mode==='live'?'Live mode':'Test mode'}</span></div>
    <button type="button" class="m-icon-button" aria-label="Close menu" onclick={()=>moreOpen=false}><Icon name="close" size={18}/></button>
   </div>
   <!-- Home is already a tab; everything else is here, grouped as in the sidebar. -->
   {#each visible.filter(g=>g.id!=='home') as group (group.id)}
    {#if group.label}<p class="m-group">{group.label}</p>{/if}
    <div class="m-tiles">
     {#each group.links as [url,label,icon] (url)}<a href={url} class:current={isCurrent(url)} aria-current={isCurrent(url)?'page':undefined}><span class="m-tile-icon"><Icon name={icon} size={20}/></span><span>{label}</span></a>{/each}
    </div>
   {/each}
   <div class="m-sheet-foot">
    <ThemeToggle/>
    <form method="POST" action="/logout"><button class="m-signout"><Icon name="logout" size={18}/>Sign out</button></form>
   </div>
  </div>
 {/if}
</div>
