<script lang="ts">
import {enhance} from '$app/forms';
import Icon from '$lib/components/Icon.svelte';
let {data,form}=$props();
type Offer={id:string;name:string;starts_at:string;ends_at:string;daily_start:string|null;daily_end:string|null;download_mbps:number;upload_mbps:number;enabled:boolean;state:'ON'|'WAITING'|'ENDED'|'OFF';until:string|null;next:string|null;logins:number;devices:number};
const offers=$derived((data.offers??[]) as Offer[]);
const fmt=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'});
const when=(iso:string|null)=>iso?fmt.format(new Date(iso)):'—';
/** An instant as the value a datetime-local input shows in Dar es Salaam. */
const local=(iso:string)=>new Date(new Date(iso).getTime()+3*3600_000).toISOString().slice(0,16);
const STATE:Record<Offer['state'],string>={ON:'On now',WAITING:'Scheduled',ENDED:'Ended',OFF:'Switched off'};

// The form: a new offer, or the one being edited. A failed save keeps what was typed.
let editing=$state<Offer|null>(null);
let daily=$state(false);
// What was typed into a save that failed, shown again only on the same form
// (the same offer, or the new-offer form) and dropped once the admin moves on.
let moved=$state(false);
const values=$derived(!moved&&(form as any)?.values&&((form as any).id??'')===(editing?.id??'')?(form as any).values:null);
function startNew(){editing=null;daily=false;moved=true;}
function edit(o:Offer){editing=o;daily=!!o.daily_start;moved=true;document.getElementById('offer-form')?.scrollIntoView({behavior:'smooth'});}
const now=new Date();
const defaultStart=local(new Date(Math.ceil(now.getTime()/3600_000)*3600_000).toISOString());
const defaultEnd=local(new Date(Math.ceil(now.getTime()/3600_000)*3600_000+7*86400_000).toISOString());
let saving=$state(false);
</script>

<svelte:head><title>Free offer · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div><p class="eyebrow">MARKETING</p><h1>Free Wi-Fi offer</h1>
  <p>Choose when anyone on the shop Wi-Fi can go online free with one tap. The sign-in page that pops up on their phone shows the offer while it runs; outside it, only your packages.</p></div>
</div>

{#if form?.error}<div class="notice error" role="alert">{form.error}</div>{/if}
{#if form?.message}<div class="notice" role="status">{form.message}</div>{/if}

<section class="panel offer-form" id="offer-form">
 <div class="form-head"><h2>{editing?'Edit offer':'New offer'}</h2>{#if editing}<button type="button" class="button secondary" onclick={startNew}>New offer instead</button>{/if}</div>
 {#key editing?.id??'new'}
 <form method="POST" action="?/save" use:enhance={()=>{saving=true;moved=false;return async({result,update})=>{saving=false;await update({reset:false});if(result.type==='success')startNew();};}}>
  <input type="hidden" name="id" value={editing?.id??''}>
  <label>Name customers see<input name="name" maxlength="80" required placeholder="Wi-Fi bure wiki hii" value={values?.name??editing?.name??''}></label>
  <div class="row">
   <label>Starts<input type="datetime-local" name="starts_at" required value={values?.starts_at?local(values.starts_at):editing?local(editing.starts_at):defaultStart}></label>
   <label>Ends<input type="datetime-local" name="ends_at" required value={values?.ends_at?local(values.ends_at):editing?local(editing.ends_at):defaultEnd}></label>
  </div>
  <label class="check"><input type="checkbox" name="daily" bind:checked={daily}>Only between these hours each day</label>
  {#if daily}
   <div class="row">
    <label>From<input type="time" name="daily_start" required value={values?.daily_start??editing?.daily_start??'14:00'}></label>
    <label>To<input type="time" name="daily_end" required value={values?.daily_end??editing?.daily_end??'17:00'}></label>
   </div>
   <p class="small muted">Hours may run past midnight, for example 22:00 to 02:00.</p>
  {/if}
  <div class="row">
   <label>Download speed · Mbps<input type="number" name="download_mbps" min="1" max="10000" required value={values?.download_mbps??editing?.download_mbps??2}></label>
   <label>Upload speed · Mbps<input type="number" name="upload_mbps" min="1" max="10000" required value={values?.upload_mbps??editing?.upload_mbps??1}></label>
  </div>
  <p class="small muted">A slower free speed leaves a reason to buy a package.</p>
  <label class="check"><input type="checkbox" name="enabled" checked={values?values.enabled:editing?editing.enabled:true}>Switched on</label>
  <div class="actions"><button class="button" disabled={saving}>{saving?'Saving…':editing?'Save offer':'Create offer'}</button></div>
 </form>
 {/key}
 <p class="small muted">Times are Tanzanian time. A free session ends when the offer's time ends, and a phone can sign in again for free while it is still on.</p>
</section>

<section class="panel">
 <h2>Offers</h2>
 {#if !offers.length}
  <p class="muted">No offers yet. Create one above.</p>
 {:else}
  <ul class="offer-list">
   {#each offers as o (o.id)}
    <li>
     <div class="offer-main">
      <div class="offer-title"><strong>{o.name}</strong><span class="badge state-{o.state.toLowerCase()}">{STATE[o.state]}</span></div>
      <p class="small">{when(o.starts_at)} to {when(o.ends_at)}{#if o.daily_start} · daily {o.daily_start}–{o.daily_end}{/if} · {o.download_mbps}/{o.upload_mbps} Mbps</p>
      <p class="small muted">{#if o.state==='ON'}Free until {when(o.until)}.{:else if o.state==='WAITING'}Next on {when(o.next)}.{/if} {o.devices} device{o.devices===1?'':'s'}, {o.logins} free sign-in{o.logins===1?'':'s'}.</p>
     </div>
     <div class="offer-actions">
      <button type="button" class="button secondary" onclick={()=>edit(o)}><Icon name="settings" size={16}/>Edit</button>
      <form method="POST" action="?/toggle" use:enhance><input type="hidden" name="id" value={o.id}><button class="button secondary">{o.enabled?'Switch off':'Switch on'}</button></form>
     </div>
    </li>
   {/each}
  </ul>
 {/if}
</section>

<style>
 .offer-form form{display:flex;flex-direction:column;gap:4px}
 .form-head,.offer-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
 .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
 .check{flex-direction:row;align-items:center;gap:8px;font-weight:500}
 .check input{width:auto;min-height:0}
 .actions{display:flex;gap:10px}
 .offer-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
 .offer-list li{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--line)}
 .offer-list li:first-child{border-top:0}
 .offer-list p{margin:4px 0 0}
 .offer-actions{display:flex;gap:8px;flex-shrink:0}
 .offer-actions form{margin:0}
 .badge.state-on{background:var(--success-soft,#e7f6ee);color:var(--success,#168753)}
 .badge.state-waiting{background:var(--primary-soft);color:var(--primary-text)}
 .badge.state-ended,.badge.state-off{background:var(--surface-muted);color:var(--muted)}
 @media (max-width:640px){.row{grid-template-columns:1fr}.offer-list li{flex-direction:column;align-items:stretch}.offer-actions{justify-content:flex-start}}
</style>
