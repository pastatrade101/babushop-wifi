<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import SafetyBadge from '$lib/components/SafetyBadge.svelte';
let {data}=$props();
const dash=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
</script>

<svelte:head><title>Network infrastructure · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div>
  <h1>Network infrastructure</h1>
  <p>Secure remote access to the equipment behind each router. Everything on this page reads the router; nothing changes it.</p>
 </div>
 <SafetyBadge level="read"/>
</div>

{#if !data.sites.items.length}
 <div class="empty">
  <span><Icon name="network" size={38}/></span>
  <h2>No network site yet</h2>
  <p>A site appears here once the portal has a router to read. Check the router credentials under Network setup.</p>
 </div>
{/if}

{#each data.sites.items as site (site.id)}
 {@const live=data.statuses[site.id]}
 {@const status=live?.status}
 {@const ap=status?.access_point}
 <article class="panel site-card">
  <div class="card-head">
   <div>
    <h2>{site.name}</h2>
    <p class="small">{dash(status?.router?.identity??site.router_identity)} · {site.lan_cidrs.length} network{site.lan_cidrs.length===1?'':'s'} · {site.device_count} device{site.device_count===1?'':'s'} known</p>
   </div>
   <a class="small-button" href="/network/{site.id}">Open<Icon name="arrow" size={15}/></a>
  </div>

  {#if live?.error}
   <div class="notice error">Could not read the router: {live.error}</div>
  {/if}

  <div class="metrics">
   <article>
    <span class="metric-heading">Router<Icon name="settings" size={16}/></span>
    <strong class="state">{status?.router?.online?'Online':'Offline'}</strong>
    <small>RouterOS {dash(status?.router?.version??site.router_os)}{status?.router?.uptime?` · up ${status.router.uptime}`:''}</small>
   </article>
   <article>
    <span class="metric-heading">Management tunnel<Icon name="network" size={16}/></span>
    <strong class="state">{status?.tunnel?.online?'Online':status?.tunnel?'Idle':'Not configured'}</strong>
    <small>{status?.tunnel?`handshake ${dash(status.tunnel.last_handshake)} ago`:'No WireGuard peer found'}</small>
   </article>
   <article>
    <span class="metric-heading">Access point<Icon name="wifi" size={16}/></span>
    <strong class="state">{ap?dash(ap.ipAddress):'Not found'}</strong>
    <small>{ap?`${dash(ap.model??ap.vendor)} · ${ap.macAddress}`:'Not in the router’s leases or ARP'}</small>
   </article>
   <article>
    <span class="metric-heading">Omada<Icon name="check" size={16}/></span>
    <strong class="state">{site.omada_inform_url?'URL saved':'Not set'}</strong>
    <small>{site.omada_inform_url?'Ready for adoption from the controller':'Add the controller site URL to begin'}</small>
   </article>
  </div>

  {#if status?.hotspot}
   <p class="policy-strip"><Icon name="grants" size={17}/><span><strong>Customer hotspot {status.hotspot.enabled&&status.hotspot.valid?'running':'not running'}.</strong> {status.hotspot.name} on {status.hotspot.interface} · {status.hotspot.active_sessions} active session{status.hotspot.active_sessions===1?'':'s'}. Reading the router does not interrupt it.</span></p>
  {/if}
 </article>
{/each}

<style>
 .site-card .metrics{margin-bottom:0}
 .state{font-size:1.28rem;letter-spacing:-.03em}
 .small{font-size:.78rem;color:#7b8b7e}
</style>
