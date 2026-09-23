<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
import SafetyBadge from '$lib/components/SafetyBadge.svelte';
import {enhance} from '$app/forms';
let {data,form}=$props();
let busy=$state('');
let copied=$state(false);

const dash=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
const date=(value:string)=>value?new Intl.DateTimeFormat('en-TZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(value)):'—';

const status=$derived(data.status);
const ap=$derived(status?.access_point??null);
const apRow=$derived(data.devices.items.find((device:any)=>ap&&device.mac_address===ap.macAddress)??null);
const probe=$derived(form?.probe??null);
const plan=$derived(form?.plan?.plan??data.plans.items[0]?.plan??null);
const approved=$derived(data.devices.items.filter((device:any)=>device.approved_for_management));

// Plain English for every verdict, including the two the evidence cannot yet separate.
const verdicts:Record<string,{title:string;tone:'good'|'warn'|'bad';detail:string}>={
 REACHABLE:{title:'Reachable',tone:'good',detail:'The device answered.'},
 ICMP_BLOCKED_BY_ROUTER_FIREWALL:{title:'Untested — the reply is blocked',tone:'warn',detail:'The router cannot receive the answer, so nothing has been learned about the device itself.'},
 NO_ICMP_REPLY_DEVICE_UP:{title:'Up, but silent to ping',tone:'warn',detail:'It answered at layer 2 but not to ICMP.'},
 OFFLINE:{title:'Offline',tone:'bad',detail:'Nothing has answered for this device.'},
 INDETERMINATE:{title:'Inconclusive',tone:'warn',detail:'The evidence does not separate a silent device from a filtered path.'},
};
const portWords:Record<string,string>={OPEN:'open',REFUSED:'refused',TIMEOUT:'no answer',NO_ROUTE:'not sent',NOT_ATTEMPTED:'not sent',ERROR:'error'};

async function copyUrl(value:string){try{await navigator.clipboard.writeText(value);copied=true;}catch{copied=false;}}
</script>

<svelte:head><title>{data.site.name} · Network · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div>
  <p class="eyebrow"><a href="/network">Network infrastructure</a></p>
  <h1>{data.site.name}</h1>
  <p>Read-only view of the equipment behind this router. Last discovery {data.site.last_discovered_at?date(data.site.last_discovered_at):'never'}.</p>
 </div>
 <SafetyBadge level="read"/>
</div>

{#if form?.message}<div class="notice">{form.message}</div>{/if}
{#if form?.error}<div class="notice error">{form.error}</div>{/if}
{#if data.statusError}<div class="notice error">The router could not be read: {data.statusError}</div>{/if}

<!-- ── ROUTER ────────────────────────────────────────────────────────────── -->
<section class="panel">
 <div class="card-head">
  <div><h2>Router</h2><p class="small">What the router reports about itself. These are GET requests on a read-only account.</p></div>
  <form method="post" use:enhance={()=>{busy='discover';return async({update})=>{await update();busy='';};}}>
   <input type="hidden" name="op" value="discover"/>
   <button class="small-button" disabled={busy==='discover'}>{busy==='discover'?'Reading…':'Run discovery'}</button>
  </form>
 </div>
 <dl class="details">
  <dt>Status</dt><dd>{status?.router?.online?'Online':'Not answering'}</dd>
  <dt>RouterOS</dt><dd>{dash(status?.router?.version)} {status?.router?.wireguard_capable?'· WireGuard supported':'· WireGuard requires RouterOS 7. Manual migration required.'}</dd>
  <dt>Model</dt><dd>{dash(status?.router?.board)}</dd>
  <dt>Identity</dt><dd>{dash(status?.router?.identity)}</dd>
  <dt>Uptime</dt><dd>{dash(status?.router?.uptime)}</dd>
  <dt>Networks served</dt><dd>{status?.lan_cidrs?.join(' · ')||data.site.lan_cidrs.join(' · ')||'—'}</dd>
  {#if status?.hotspot}
   <dt>Customer hotspot</dt><dd>{status.hotspot.name} on {status.hotspot.interface} — {status.hotspot.enabled&&status.hotspot.valid?'running':'stopped'}, {status.hotspot.active_sessions} active session{status.hotspot.active_sessions===1?'':'s'}</dd>
  {/if}
  {#if status?.router?.device_mode}
   <dt>Device mode</dt><dd>{status.router.device_mode}{status.router.device_mode_restrictions.length?` — ${status.router.device_mode_restrictions.join(', ')} are disabled on this router, so probes run from the server instead of the router.`:''}</dd>
  {/if}
 </dl>
</section>

<!-- ── REMOTE ACCESS ─────────────────────────────────────────────────────── -->
<section class="panel">
 <div class="card-head"><div><h2>Remote access</h2><p class="small">The permanent tunnel the router dials out to this server.</p></div><SafetyBadge level="read"/></div>
 {#if status?.tunnel}
  <dl class="details">
   <dt>Interface</dt><dd>{status.tunnel.interface}</dd>
   <dt>Handshake</dt><dd>{status.tunnel.online?`${status.tunnel.last_handshake} ago`:'Never'}</dd>
   <dt>Direction</dt><dd>{status.tunnel.endpoint?`The router dials ${status.tunnel.endpoint}, so it works behind CGNAT.`:'No endpoint configured on the router side.'}</dd>
   <dt>Carries</dt><dd>{status.tunnel.allowed_address}{status.tunnel.carries_lan?'':' — tunnel addresses only. No route into the site LAN yet, which is what the Phase 5 plan below adds.'}</dd>
   <dt>Traffic</dt><dd>{dash(status.tunnel.rx)} in · {dash(status.tunnel.tx)} out</dd>
  </dl>
 {:else}
  <div class="empty"><h2>No tunnel found</h2><p>The router has no WireGuard peer on this interface.</p></div>
 {/if}
</section>

<!-- ── ACCESS POINT ──────────────────────────────────────────────────────── -->
<section class="panel">
 <div class="card-head"><div><h2>Access point</h2><p class="small">Found by MAC address in the router's own DHCP leases and ARP table. Nothing is scanned.</p></div><SafetyBadge level="read"/></div>
 {#if ap}
  <div class="device-hero">
   <span class="action-icon"><Icon name="wifi" size={21}/></span>
   <div>
    <strong>{dash(ap.model??'Access point')}</strong>
    <p class="small">{dash(ap.vendor)} · {ap.macAddress} · seen on {dash(ap.interface)}</p>
   </div>
   <div class="ip">{dash(ap.ipAddress)}</div>
  </div>

  {#if probe}
   {@const view=verdicts[probe.verdict]}
   <div class="verdict {view.tone}">
    <strong>{view.title}</strong>
    <p>{view.detail}</p>
    <dl class="details compact">
     <dt>ICMP</dt><dd>{probe.icmp.ran?`${probe.icmp.received} of ${probe.icmp.sent} replies · ${probe.icmp.lossPercent}% loss${probe.icmp.averageRttMs!==null?` · ${probe.icmp.averageRttMs} ms`:''}`:probe.icmp.detail}</dd>
     <dt>ARP</dt><dd>{probe.arp.present?(probe.arp.complete?'Complete — the device answered at layer 2':'Present but incomplete'):'No entry'}</dd>
     <dt>DHCP lease</dt><dd>{dash(probe.dhcp.status)}</dd>
     {#each probe.ports as port}<dt>TCP {port.port}</dt><dd>{portWords[port.state]} — {port.detail}</dd>{/each}
    </dl>
    <ul class="reasons">{#each probe.reasons as reason}<li>{reason}</li>{/each}</ul>
   </div>
  {:else if status?.reply_path?.blocksReplies}
   <div class="verdict warn">
    <strong>Ping from the router will not prove anything yet</strong>
    <p>{status.reply_path.explanation}</p>
   </div>
  {/if}

  <div class="row-actions">
   {#if apRow}
    <form method="post" use:enhance={()=>{busy='probe';return async({update})=>{await update();busy='';};}}>
     <input type="hidden" name="op" value="probe"/><input type="hidden" name="device_id" value={apRow.id}/>
     <button class="small-button" disabled={busy==='probe'}>{busy==='probe'?'Testing…':'Run diagnostics'}</button>
    </form>
   {/if}
   {#if probe?.managementProtocol&&status?.tunnel?.carries_lan}
    <a class="small-button" href="{probe.managementProtocol}://{ap.ipAddress}" target="_blank" rel="noreferrer noopener">Open management interface<Icon name="arrow" size={15}/></a>
   {:else}
    <button class="small-button" disabled title="Connect the admin VPN and apply the Phase 5 plan first">Open management interface</button>
   {/if}
  </div>
  <p class="small footnote">The management page is never proxied through this portal. The button opens the private address directly, which only works once your own machine is on the admin VPN.</p>
 {:else}
  <div class="empty"><span><Icon name="wifi" size={38}/></span><h2>Access point not found</h2><p>The router has no lease or ARP entry for it. Run discovery, and check the access point is powered and cabled.</p></div>
 {/if}
</section>

<!-- ── DEVICES ───────────────────────────────────────────────────────────── -->
<section class="panel list-panel">
 <div class="card-head"><div><h2>Discovered devices</h2><p class="small">Merged from DHCP leases and ARP. Approving a device is what makes it contactable — discovery alone never opens a path.</p></div><SafetyBadge level="controlled" label="APPROVAL"/></div>
 {#if data.devices.items.length}
  <div class="table-wrap">
   <table>
    <thead><tr><th>Address</th><th>MAC</th><th>Name</th><th>Interface</th><th>Source</th><th>Last seen</th><th>Management</th></tr></thead>
    <tbody>
     {#each data.devices.items as device (device.id)}
      <tr>
       <td>{dash(device.ip_address)}</td>
       <td>{device.mac_address}</td>
       <td>{dash(device.hostname??device.model)}</td>
       <td>{dash(device.interface)}</td>
       <td><span class="badge">{device.source}</span></td>
       <td>{device.last_seen_at?date(device.last_seen_at):'—'}</td>
       <td>
        <form method="post" use:enhance>
         <input type="hidden" name="op" value="approve"/><input type="hidden" name="device_id" value={device.id}/>
         <label class="checkbox approve"><input type="checkbox" name="approved" checked={device.approved_for_management} onchange={(e:any)=>e.currentTarget.form.requestSubmit()}/><span>{device.approved_for_management?'Approved':'Not approved'}</span></label>
        </form>
       </td>
      </tr>
     {/each}
    </tbody>
   </table>
  </div>
 {:else}
  <div class="empty"><h2>Nothing discovered yet</h2><p>Run discovery to read the router's leases and ARP table.</p></div>
 {/if}
</section>

<!-- ── PHASE 5 DRY RUN ───────────────────────────────────────────────────── -->
<section class="panel">
 <div class="card-head">
  <div><h2>Management path — dry run</h2><p class="small">A plan, not a change. Nothing here has been applied and this page has no button that would apply it.</p></div>
  <SafetyBadge level="dangerous" label="APPLY IS MANUAL"/>
 </div>

 {#if !approved.length}
  <div class="notice">Approve the device you intend to reach, above, and a plan can be generated for it.</div>
 {/if}
 <form method="post" use:enhance={()=>{busy='plan';return async({update})=>{await update();busy='';};}}>
  <input type="hidden" name="op" value="plan"/>
  <button class="small-button" disabled={busy==='plan'||!approved.length}>{busy==='plan'?'Planning…':'Generate dry run'}</button>
 </form>

 {#if plan}
  <div class="plan">
   <p class="small">Generated {date(plan.generatedAt)} · architecture {plan.architecture} · digest {plan.digest.slice(0,16)}…</p>
   <p class="small marker">Every object this run creates is marked <code>{plan.marker}</code>. Rollback matches that whole marker, so it cannot reach another run's rules.</p>

   <h3>Preflight</h3>
   <p class="small">Host facts the portal cannot read for itself: this process runs in its own network namespace, so the server's routing table, forwarding flag and WireGuard state have to be captured on the host.</p>
   <div class="table-wrap">
    <table>
     <thead><tr><th>Check</th><th>Expected</th><th>Observed</th><th>Status</th></tr></thead>
     <tbody>{#each plan.preflight as item}
      <tr>
       <td>{item.description}<br/><code class="cmd">{item.command}</code></td>
       <td>{item.expected}</td>
       <td>{item.observed ?? '—'}</td>
       <td><span class="pf {item.status.toLowerCase()}">{item.status.replace('_',' ')}</span><br/><span class="small">{item.note}</span></td>
      </tr>
     {/each}</tbody>
    </table>
   </div>

   {#each plan.guarantees as guarantee}
    <p class="guarantee {guarantee.startsWith('REFUSED')?'bad':'good'}"><Icon name={guarantee.startsWith('REFUSED')?'alert':'check'} size={16}/>{guarantee}</p>
   {/each}

   {#if plan.blockers.length}
    <div class="notice error"><strong>Blocked.</strong><ul>{#each plan.blockers as blocker}<li>{blocker}</li>{/each}</ul></div>
   {/if}

   <h3>Creates ({plan.creates.length})</h3>
   {#each plan.creates as action}
    <article class="action">
     <header><span class="badge">{action.target}</span><strong>{action.summary}</strong></header>
     <p class="small">{action.why}</p>
     <p class="step-label">Runtime</p><pre>{action.command}</pre>
     {#if action.persistent}<p class="step-label">Persistent</p><pre>{action.persistent}</pre>{/if}
     {#if action.rest}<p class="small rest">REST: {action.rest.method} /rest/{action.rest.path} {JSON.stringify(action.rest.body)}</p>{/if}
     <p class="step-label">Rollback</p><pre>{action.rollback}</pre>
    </article>
   {/each}

   {#if plan.changes.length}
    <h3>Modifies ({plan.changes.length})</h3>
    {#each plan.changes as action}
     <article class="action modify">
      <header><span class="badge warning">{action.target}</span><strong>{action.summary}</strong></header>
      <p class="small">{action.why}</p>
      <p class="step-label">Runtime</p><pre>{action.command}</pre>
      {#if action.persistent}<p class="step-label">Persistent</p><pre>{action.persistent}</pre>{/if}
      <p class="small">Existing object: <code>{action.affectsExisting}</code></p>
      <p class="step-label">Rollback</p><pre>{action.rollback}</pre>
     </article>
    {/each}
   {/if}

   <h3>Existing objects affected ({plan.existingObjectsAffected.length})</h3>
   {#if plan.existingObjectsAffected.length}
    <div class="table-wrap">
     <table>
      <thead><tr><th>Id</th><th>Chain</th><th>Action</th><th>Comment</th><th>Effect</th></tr></thead>
      <tbody>{#each plan.existingObjectsAffected as object}<tr><td>{object.id}</td><td>{object.chain}</td><td>{object.action}</td><td>{object.comment}</td><td>{object.effect}</td></tr>{/each}</tbody>
     </table>
    </div>
   {:else}<p class="small">None.</p>{/if}

   {#if plan.warnings.length}
    <h3>Warnings</h3>
    <ul class="reasons">{#each plan.warnings as warning}<li>{warning}</li>{/each}</ul>
   {/if}

   <details class="setup-details">
    <summary>Before state, after state, health checks and rollback</summary>
    <h4>Before</h4><pre>{JSON.stringify(plan.beforeState,null,1)}</pre>
    <h4>Expected after</h4><pre>{JSON.stringify(plan.expectedAfterState,null,1)}</pre>
    <h4>Health checks</h4>
    <ol class="steps">{#each plan.healthChecks as check}<li><strong>{check.description}</strong><p>{check.how}</p></li>{/each}</ol>
    <h4>Rollback</h4><pre>{plan.rollback.join('\n')}</pre>
   </details>
  </div>
 {/if}
</section>

<!-- ── OMADA ─────────────────────────────────────────────────────────────── -->
<section class="panel">
 <div class="card-head"><div><h2>Omada cloud bootstrap</h2><p class="small">The portal stores the controller URL and shows the steps. It never signs in to the access point or automates its pages.</p></div><SafetyBadge level="controlled"/></div>

 <div class="notice error adoption">
  <strong>This access point is serving customers right now.</strong>
  <p>Adoption may reprovision it and can interrupt Wi-Fi. Before adopting, write down the current SSID, security mode, Wi-Fi password, VLAN, management IP configuration and radio settings, and create them in Omada Central first. Do not factory reset the access point remotely.</p>
 </div>

 <form method="post" use:enhance class="inline-form">
  <input type="hidden" name="op" value="omada"/>
  <label>Omada site / inform URL<input name="url" type="url" value={data.site.omada_inform_url??''} placeholder="https://euw1-api-omada-central.tplinkcloud.com/..."/></label>
  <button class="small-button">Save</button>
 </form>
 {#if data.site.omada_inform_url}
  <p class="row-actions"><button class="small-button" onclick={()=>copyUrl(data.site.omada_inform_url)}>{copied?'Copied':'Copy URL'}</button></p>
 {/if}

 <ol class="steps">
  <li><strong>Connect the admin VPN</strong><p>Your own machine needs a route to the private address. The portal never proxies it.</p></li>
  <li><strong>Open the access point at its private address</strong><p>{ap?dash(ap.ipAddress):'Discover the access point first'}</p></li>
  <li><strong>Log in to the access point</strong></li>
  <li><strong>System Tools → Controller Settings → Cloud-Based Controller Management</strong></li>
  <li><strong>Enable cloud-based controller management</strong></li>
  <li><strong>Paste the Omada site URL into Inform URL / IP Address</strong></li>
  <li><strong>Save</strong></li>
  <li><strong>Open Omada Central and wait for the device to appear as PENDING</strong></li>
  <li><strong>Adopt the device</strong></li>
  <li><strong>Wait for CONNECTED</strong><p>Once the root access point is connected, mesh is configured in Omada Central, not here. This page stays useful for diagnostics and recovery.</p></li>
 </ol>
</section>

<!-- ── AUDIT ─────────────────────────────────────────────────────────────── -->
<section class="panel list-panel">
 <div class="card-head"><div><h2>Infrastructure audit</h2><p class="small">Append-only. These records cannot be edited or deleted, including by this application.</p></div></div>
 {#if data.audit.items.length}
  <div class="table-wrap">
   <table>
    <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
    <tbody>{#each data.audit.items as entry (entry.id)}
     <tr><td>{date(entry.created_at)}</td><td>{dash(entry.actor)}</td><td>{entry.action.replace('NETWORK_','').replaceAll('_',' ').toLowerCase()}</td><td class="detail">{JSON.stringify(entry.details)}</td></tr>
    {/each}</tbody>
   </table>
  </div>
 {:else}<div class="empty"><h2>Nothing recorded yet</h2><p>Discovery, diagnostics and planning all write here.</p></div>{/if}
</section>

<style>
 .small{font-size:.8125rem;color:var(--muted)}
 .footnote{margin-top:12px}
 .eyebrow a{color:var(--primary-text)}
 .details.compact dt,.details.compact dd{padding:7px 0}
 .device-hero{display:flex;align-items:center;gap:14px;background:var(--surface-muted);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
 .device-hero>div:nth-child(2){flex:1;min-width:0}
 .device-hero strong{font-size:1.02rem}
 .device-hero .ip{font-size:1.5rem;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
 .verdict{border-radius:11px;padding:16px 18px;margin-bottom:16px;border:1px solid}
 .verdict.good{background:var(--success-soft);border-color:var(--line)}
 .verdict.warn{background:var(--warning-soft);border-color:var(--line)}
 .verdict.bad{background:var(--danger-soft);border-color:var(--line)}
 .verdict p{font-size:.8rem;margin:5px 0 0}
 .reasons{margin:10px 0 0;padding-left:18px;font-size:.8125rem;color:var(--muted)}
 .reasons li{margin-bottom:5px}
 .approve{margin:0;font-weight:500;font-size:.75rem}
 .plan{margin-top:18px}
 .plan h3{font-size:.95rem;margin:22px 0 10px}
 .plan h4{font-size:.82rem;margin:16px 0 6px}
 .guarantee{display:flex;align-items:start;gap:9px;font-size:.79rem;margin:7px 0}
 .guarantee.good{color:var(--success)}
 .guarantee.bad{color:var(--danger)}
 .action{border:1px solid var(--line);border-radius:10px;padding:15px;margin-bottom:12px}
 .action.modify{border-color:var(--line);background:var(--warning-soft)}
 .action header{display:flex;align-items:center;gap:10px;margin-bottom:7px;flex-wrap:wrap}
 .action header strong{font-size:.86rem}
 .rest{font-family:ui-monospace,monospace;overflow-wrap:anywhere}
 .step-label{font-size:.63rem;letter-spacing:.09em;font-weight:700;color:var(--muted);margin:12px 0 5px}
 .marker code{background:var(--surface-muted);padding:2px 5px;border-radius:4px}
 .cmd{font-size:.68rem;color:var(--muted)}
 .pf{display:inline-block;border-radius:5px;padding:3px 7px;font-size:.62rem;font-weight:700;letter-spacing:.05em}
 .pf.pass{background:var(--success-soft);color:var(--success)}
 .pf.action_required{background:var(--warning-soft);color:var(--warning)}
 .pf.unverified{background:var(--danger-soft);color:var(--danger)}
 pre{background:var(--surface-muted);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;font-size:.73rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
 code{font-size:.73rem;overflow-wrap:anywhere}
 .adoption p{font-size:.8rem;margin:6px 0 0}
 td.detail{font-size:.7rem;color:var(--muted);overflow-wrap:anywhere;max-width:380px}
@media(max-width:560px){.device-hero{flex-wrap:wrap}.device-hero .ip{width:100%;font-size:1.25rem}.card-head{flex-wrap:wrap}.small{overflow-wrap:anywhere}}
</style>
