<script lang="ts">
import {page} from '$app/state';
import Icon from '$lib/components/Icon.svelte';
let {data,children}=$props();let menuOpen=$state(false);
const links=[['/','Overview','overview'],['/sell','Sell internet','plus'],['/vouchers','Vouchers','ticket'],['/voucher-batches','Voucher batches','batch'],['/packages','Packages','package'],['/sales','Sales','sales'],['/access-grants','Access grants','grants'],['/sessions','Wi-Fi sessions','wifi'],['/reports','Reports','reports'],['/staff','Staff','staff'],['/network','Network','network'],['/settings','Network setup','settings']];
// A detail page such as /network/<id> should keep its section lit in the sidebar.
const isCurrent=(url:string)=>page.url.pathname===url||(url!=='/'&&page.url.pathname.startsWith(url+'/'));
const cashier=['/','/sell','/vouchers','/packages','/sales'];
const current=$derived(links.find(([url])=>url===page.url.pathname)?.[1]||'Workspace');
</script>
<a class="skip-link" href="#main-content">Skip to content</a>
<div class="workspace">
 <aside class="sidebar">
  <div class="sidebar-top"><a class="brand" href="/" onclick={()=>menuOpen=false}><span class="brand-mark"><Icon name="wifi" size={21}/></span><span>{data.brand}</span></a><button class="menu-toggle" aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} aria-controls="workspace-navigation" onclick={()=>menuOpen=!menuOpen}><Icon name={menuOpen?'close':'menu'}/></button></div>
  <div id="workspace-navigation" class="sidebar-body" class:open={menuOpen}>
   <p class="sidebar-label">WORKSPACE</p><nav aria-label="Main navigation">{#each links as [url,label,icon]}{#if data.staff.role==='ADMIN'||cashier.includes(url)}<a href={url} class:current={isCurrent(url)} aria-current={isCurrent(url)?'page':undefined} onclick={()=>menuOpen=false}><Icon name={icon} size={18}/>{label}</a>{/if}{/each}</nav>
   <div class="staff-summary"><span class="avatar">{data.staff.display_name.slice(0,1).toUpperCase()}</span><div><strong>{data.staff.display_name}</strong><span>{data.staff.role==='ADMIN'?'Administrator':'Cashier'}</span></div><form method="POST" action="/logout"><button class="icon-button" aria-label="Sign out" title="Sign out"><Icon name="logout" size={18}/></button></form></div>
  </div>
 </aside>
 <div class="workspace-main">
  <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>{current}</strong></div><div class="topbar-meta"><span class="mode-pill" class:test-mode={data.mode!=='live'}><span class="status-dot"></span>{data.mode==='live'?'Live mode':'Test mode'}</span><span class="currency">TZS · Tanzania</span></div></header>
  {#if data.mode!=='live'}<div class="simulation" role="status"><strong>Portal test mode</strong><span>Sales are real records. {data.networkProvider==='mikrotik'?'The separate RADIUS service may already allow Wi-Fi access. Switch the API and web deployment to live after voucher checks pass.':'Portal internet authorization is simulated.'}</span>{#if data.staff.role==='ADMIN'}<a href="/settings">View setup →</a>{/if}</div>{/if}
  <main id="main-content" class="content" tabindex="-1">{@render children()}</main>
  <footer class="workspace-footer">{data.brand}<span>Prepaid internet, made simple.</span></footer>
 </div>
</div>
