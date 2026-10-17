<script lang="ts">
import {enhance} from '$app/forms';
import {tick} from 'svelte';
import Icon from '$lib/components/Icon.svelte';
import {openModal,closeModal} from '$lib/modal';
let {data,form}=$props();

type Device={id:string;mac:string;name:string;note:string|null;enabled:boolean;on_router:boolean;sync_error:string|null;created_at:string};
type Candidate={mac:string;address:string;host_name:string|null;signed_in_as:string|null;bypassed:boolean;vip:boolean;idle:string};
const devices=$derived((data.devices??[]) as Device[]);
const candidates=$derived(((data.candidates??[]) as Candidate[]).filter(c=>!c.vip));
const when=(iso:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(iso));
const status=(d:Device)=>!d.enabled?{label:'Switched off',tone:'off'}:d.on_router?{label:'Free access on',tone:'on'}:{label:'Not on router yet',tone:'warn'};

// The add pop-up, optionally filled in from a phone on the Wi-Fi now.
let dialog:HTMLDialogElement|undefined=$state();
let mac=$state('');let name=$state('');let note=$state('');
let saving=$state(false);let problem=$state<string|null>(null);
async function openAdd(prefill?:Candidate){
 mac=prefill?.mac??'';name=prefill?.host_name??'';note='';problem=null;
 await tick();openModal(dialog);
 (dialog?.querySelector(prefill?'input[name=name]':'input[name=mac]') as HTMLInputElement|null)?.focus();
}
const submitAdd=()=>{saving=true;problem=null;return async({result,update}:{result:any;update:(o?:{reset?:boolean})=>Promise<void>})=>{
 saving=false;
 if(result.type==='failure'){problem=result.data?.error??'Could not add the device.';return;}
 closeModal(dialog);await update({reset:true});
};};
// Remove asks twice: the first tap arms the button.
let arming=$state<string|null>(null);
</script>

<svelte:head><title>VIP devices · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div><p class="eyebrow">NETWORK</p><h1>VIP devices</h1>
  <p>Phones that go online free, without the sign-in page: yours, family, staff. The router lets each one through by its Wi-Fi address.</p></div>
 <div class="heading-actions">
  <form method="POST" action="?/sync" use:enhance><button class="button secondary"><Icon name="reverse" size={16}/>Sync with router</button></form>
  <button type="button" class="button" onclick={()=>openAdd()}><Icon name="plus" size={18}/>Add VIP device</button>
 </div>
</div>

{#if form?.message}<div class="notice" role="status">{form.message}</div>{/if}
{#if form?.warning}<div class="notice warning" role="status">{form.warning}</div>{/if}
{#if form?.error&&!problem}<div class="notice error" role="alert">{form.error}</div>{/if}

<section class="panel">
 <h2>VIP list</h2>
 {#if !devices.length}
  <p class="muted">No VIP devices yet. Add one by its Wi-Fi address, or pick a phone from those on the Wi-Fi now below.</p>
 {:else}
  <ul class="vip-list">
   {#each devices as d (d.id)}
    {@const s=status(d)}
    <li>
     <span class="vip-icon tone-{s.tone}" aria-hidden="true"><Icon name="key" size={18}/></span>
     <div class="vip-main">
      <div class="vip-title"><strong>{d.name}</strong><span class="pill {s.tone}">{s.label}</span></div>
      <p class="small"><code>{d.mac}</code> · added {when(d.created_at)}{#if d.note} · {d.note}{/if}</p>
      {#if d.enabled&&d.sync_error}<p class="small warn-text">{d.sync_error}</p>{/if}
     </div>
     <div class="vip-actions" role="group" aria-label={'Actions for '+d.name}>
      <form method="POST" action="?/toggle" use:enhance><input type="hidden" name="id" value={d.id}><button class="act">{d.enabled?'Switch off':'Switch on'}</button></form>
      <form method="POST" action="?/remove" use:enhance={({cancel})=>{if(arming!==d.id){arming=d.id;cancel();return;}arming=null;return async({update})=>{await update();};}}><input type="hidden" name="id" value={d.id}><button class="act danger" class:armed={arming===d.id}>{arming===d.id?'Confirm remove':'Remove'}</button></form>
     </div>
    </li>
   {/each}
  </ul>
 {/if}
</section>

<section class="panel">
 <div class="panel-head"><h2>Phones on the Wi-Fi now</h2><span class="small muted">From the router, when this page opened</span></div>
 {#if data.candidatesError}
  <p class="muted">{data.candidatesError}</p>
 {:else if !candidates.length}
  <p class="muted">No other phones are on the Wi-Fi right now. Join it with the phone you want to add, then reload this page.</p>
 {:else}
  <ul class="vip-list">
   {#each candidates as c (c.mac)}
    <li>
     <span class="vip-icon tone-off" aria-hidden="true"><Icon name="wifi" size={18}/></span>
     <div class="vip-main">
      <div class="vip-title"><strong>{c.host_name??'Unnamed device'}</strong>{#if c.signed_in_as}<span class="pill off">Signed in · {c.signed_in_as}</span>{:else if c.bypassed}<span class="pill off">Bypassed in WinBox</span>{/if}</div>
      <p class="small"><code>{c.mac}</code> · {c.address}{#if c.idle} · idle {c.idle}{/if}</p>
     </div>
     <div class="vip-actions"><button type="button" class="act" onclick={()=>openAdd(c)}><Icon name="plus" size={15}/>Make VIP</button></div>
    </li>
   {/each}
  </ul>
 {/if}
 <p class="small muted hint">A phone's Wi-Fi address must stay the same for this network. iPhone: Settings › Wi-Fi › (i) › Private Wi-Fi Address set to Fixed, not Rotating. Android: keep "Use randomised MAC" as it is after adding; changing it gives the phone a new address.</p>
</section>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="vip-dialog" bind:this={dialog} onclick={e=>{if(e.target===dialog)closeModal(dialog);}} aria-labelledby="vip-dialog-title">
 <form method="POST" action="?/add" use:enhance={submitAdd}>
  <div class="dialog-head"><h2 id="vip-dialog-title">Add VIP device</h2><button type="button" class="icon-close" aria-label="Close" onclick={()=>closeModal(dialog)}><Icon name="close" size={18}/></button></div>
  {#if problem}<div class="notice error" role="alert">{problem}</div>{/if}
  <label class="field">Wi-Fi address (MAC)<input name="mac" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6E:7E:F2:CA:66:74" bind:value={mac}></label>
  <label class="field">Name<input name="name" required maxlength="60" placeholder="Owner phone" bind:value={name}></label>
  <label class="field">Note <span class="optional">optional</span><input name="note" maxlength="200" placeholder="Whose phone, and why" bind:value={note}></label>
  <p class="hint">It goes online free straight away, with no sign-in, until you switch it off or remove it.</p>
  <div class="dialog-actions"><button type="button" class="button secondary" onclick={()=>closeModal(dialog)}>Cancel</button><button class="button" disabled={saving}>{saving?'Adding…':'Add device'}</button></div>
 </form>
</dialog>

<style>
 .heading-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
 .heading-actions form{margin:0}.heading-actions .button{margin:0;height:42px}
 .panel{margin-bottom:18px}
 .panel h2{margin:0 0 12px;font-size:1.05rem}
 .panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
 .vip-list{list-style:none;margin:0;padding:0}
 .vip-list li{display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px solid var(--line)}
 .vip-list li:first-child{border-top:0}
 .vip-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;flex-shrink:0;background:var(--surface-muted);color:var(--muted)}
 .vip-icon.tone-on{background:var(--success-soft);color:var(--success)}.vip-icon.tone-warn{background:var(--warning-soft);color:var(--warning)}
 .vip-main{flex:1;min-width:0}
 .vip-main p{margin:3px 0 0;color:var(--muted)}
 .vip-main code{font-size:.82rem;color:var(--ink)}
 .vip-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
 .pill{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:.7rem;font-weight:700}
 .pill.on{background:var(--success-soft);color:var(--success)}.pill.warn{background:var(--warning-soft);color:var(--warning)}.pill.off{background:var(--surface-muted);color:var(--muted)}
 .warn-text{color:var(--warning)!important}
 .vip-actions{display:flex;gap:8px;flex-shrink:0}
 .vip-actions form{margin:0;display:flex}
 .act{display:inline-flex;align-items:center;gap:6px;height:36px;margin:0;padding:0 13px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap}
 .act:hover{background:var(--surface-muted)}
 .act.danger{color:var(--danger)}.act.armed{background:var(--danger);border-color:var(--danger);color:#fff}
 .hint{margin:12px 0 0}
 .vip-dialog{margin:auto;width:min(480px,calc(100% - 24px));max-height:calc(100vh - 24px);padding:0;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.25)}
 .vip-dialog::backdrop{background:rgba(15,23,42,.45)}
 .vip-dialog form{display:flex;flex-direction:column;gap:14px;padding:22px}
 .dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.dialog-head h2{margin:0;font-size:1.2rem}
 .icon-close{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--muted);cursor:pointer}
 .field{display:flex;flex-direction:column;gap:6px;margin:0;font-size:.82rem;font-weight:600}
 .field input{height:42px;min-height:42px;margin:0;padding:0 12px;box-sizing:border-box}
 .optional{font-weight:400;color:var(--muted)}
 .vip-dialog .hint{margin:-4px 0 0;font-size:.78rem;color:var(--muted)}
 .dialog-actions{display:flex;justify-content:flex-end;gap:10px}.dialog-actions .button{margin:0;height:42px}
 .vip-dialog .notice{margin:0}
 @media (max-width:640px){.vip-list li{flex-wrap:wrap}.vip-actions{width:100%;padding-left:52px}.heading-actions{width:100%}.heading-actions .button,.heading-actions form{flex:1}.heading-actions form .button{width:100%}.dialog-actions .button{flex:1}}
</style>
