<script lang="ts">
import {enhance} from '$app/forms';
import {tick,untrack} from 'svelte';
import Icon from '$lib/components/Icon.svelte';
import {openModal,closeModal} from '$lib/modal';
let {data,form}=$props();

type User={phone:string;online:boolean;name:string|null;note:string|null;sms_opt_out:boolean;purchases:number;spent_tzs:number;attempts:number;last_at:string|null;first_at:string|null;network:string|null;added_at:string|null};
const users=$derived((data.items??[]) as User[]);
const pretty=(p:string)=>'0'+p.slice(3,6)+' '+p.slice(6,9)+' '+p.slice(9);
const money=(n:number)=>'TZS '+new Intl.NumberFormat('en-TZ').format(Math.round(n||0));
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(iso)):'—';
const NETWORKS:Record<string,string>={vodacom:'M-Pesa',airtel:'Airtel',tigo:'Mixx',halopesa:'HaloPesa',azampesa:'AzamPesa',cash:'Cash'};

// Ticked people. Anyone marked "no SMS" can be ticked but is skipped when sending.
let chosen=$state<Set<string>>(new Set());
const toggle=(p:string)=>{const next=new Set(chosen);if(next.has(p))next.delete(p);else next.add(p);chosen=next;};
const allShown=$derived(users.length>0&&users.every(u=>chosen.has(u.phone)));
const toggleAll=()=>{chosen=allShown?new Set():new Set(users.map(u=>u.phone));};
const reachable=$derived(users.filter(u=>chosen.has(u.phone)&&!u.sms_opt_out).length);

// Edit / add pop-up.
let editDialog:HTMLDialogElement|undefined=$state();
let editing=$state<{phone:string;name:string;note:string;sms_opt_out:boolean;isNew:boolean}>({phone:'',name:'',note:'',sms_opt_out:false,isNew:true});
let saving=$state(false);let editProblem=$state<string|null>(null);
async function openEdit(u:User|null){
 editing=u?{phone:pretty(u.phone),name:u.name??'',note:u.note??'',sms_opt_out:u.sms_opt_out,isNew:false}:{phone:'',name:'',note:'',sms_opt_out:false,isNew:true};
 editProblem=null;await tick();openModal(editDialog);
 (editDialog?.querySelector(u?'input[name=name]':'input[name=phone]') as HTMLInputElement|null)?.focus();
}
const submitEdit=()=>{saving=true;editProblem=null;return async({result,update}:{result:any;update:(o?:{reset?:boolean})=>Promise<void>})=>{
 saving=false;if(result.type==='failure'){editProblem=result.data?.error??'Could not save.';return;}
 closeModal(editDialog);await update({reset:false});
};};

// SMS pop-up, with the same length rules MoSMS bills by.
let smsDialog:HTMLDialogElement|undefined=$state();
// The message starts with the shop's name once; later edits are the admin's own.
const greeting=()=>`${untrack(()=>data.brand)??'JIACHIE WIFI'}: `;
let message=$state(greeting());
let sending=$state(false);let smsProblem=$state<string|null>(null);
const GSM=/^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;
const count=$derived.by(()=>{const plain=GSM.test(message),n=[...message.trim()].length;const segs=n===0?0:n<=(plain?160:70)?1:Math.ceil(n/(plain?153:67));return {plain,n,segs};});
async function openSms(){smsProblem=null;await tick();openModal(smsDialog);(smsDialog?.querySelector('textarea') as HTMLTextAreaElement|null)?.focus();}
const submitSms=()=>{sending=true;smsProblem=null;return async({result,update}:{result:any;update:(o?:{reset?:boolean})=>Promise<void>})=>{
 sending=false;if(result.type==='failure'){smsProblem=result.data?.error??'Could not send.';return;}
 closeModal(smsDialog);chosen=new Set();message=greeting();await update({reset:false});
};};
</script>

<svelte:head><title>Wi-Fi users · {data.brand}</title></svelte:head>

<div class="page-heading">
 <div><p class="eyebrow">CUSTOMERS</p><h1>Wi-Fi users</h1>
  <p>Everyone who bought, or tried to buy, by phone number. Give them names, keep notes, and send an SMS for a follow-up or an offer.</p></div>
 <div class="heading-actions">
  <button type="button" class="button secondary" onclick={()=>openEdit(null)}><Icon name="plus" size={16}/>Add user</button>
  <button type="button" class="button" disabled={!reachable||!data.sms.enabled} onclick={openSms} title={data.sms.enabled?'':'Add MOSMS_TOKEN on the server to send SMS'}><Icon name="payment" size={16}/>Send SMS{#if chosen.size}{` (${reachable})`}{/if}</button>
 </div>
</div>

{#if form?.message}<div class="notice" role="status">{form.message}</div>{/if}
{#if form?.error&&!editProblem&&!smsProblem}<div class="notice error" role="alert">{form.error}</div>{/if}

<section class="panel list-panel">
 <div class="filters">
  <form method="GET" class="search" role="search">
   <input type="hidden" name="filter" value={data.filter}>
   <span class="search-box"><Icon name="search" size={18}/><input name="q" type="search" value={data.q} placeholder="Search name, note or phone" aria-label="Search users" autocomplete="off"></span>
   <button class="button secondary">Search</button>
  </form>
  <nav class="tabs" aria-label="Which users">
   {#each [['all','Everyone'],['online','Connected'],['bought','Bought'],['tried','Tried']] as [key,label] (key)}
    <a href={'?'+new URLSearchParams({filter:key,...(data.q?{q:data.q}:{})})} class:on={data.filter===key} aria-current={data.filter===key?'page':undefined} data-sveltekit-noscroll>{#if key==='online'}<span class="live-dot" aria-hidden="true"></span>{/if}{label}<span class="count">{data.counts?.[key]??0}</span></a>
   {/each}
  </nav>
 </div>
 {#if data.q}<p class="searching">Results for “<strong>{data.q}</strong>” · <a href={'?'+new URLSearchParams({filter:data.filter})} data-sveltekit-noscroll>Clear search</a></p>{/if}
 <p class="small muted sms-line">{users.length} user{users.length===1?'':'s'} shown{#if chosen.size}{` · ${chosen.size} ticked`}{/if} · {#if data.sms.enabled}SMS credits left: <strong>{data.sms.balance??'unknown'}</strong>{:else}SMS is not set up{/if}</p>

 {#if !users.length}
  <div class="empty">
   {#if data.q}<p>No one matches “{data.q}”.</p><a class="button secondary" href={'?'+new URLSearchParams({filter:data.filter})}>Clear search</a>
   {:else if data.filter==='tried'}<p>Everyone who started a payment also finished one. Nobody to follow up here.</p>
   {:else if data.filter==='online'}<p>No buyer is online right now. People on a free offer, VIP devices and cash vouchers without a number are not listed here.</p>
   {:else}<p>No users yet. Everyone who pays by phone appears here by themselves; add others with <strong>Add user</strong>.</p>{/if}
  </div>
 {:else}
  <div class="select-all"><label class="check"><input type="checkbox" checked={allShown} onchange={toggleAll}>Tick everyone shown</label></div>
  <ul class="users">
   {#each users as u (u.phone)}
    <li class:ticked={chosen.has(u.phone)}>
     <input type="checkbox" class="tick" checked={chosen.has(u.phone)} onchange={()=>toggle(u.phone)} aria-label={'Tick '+(u.name??pretty(u.phone))}>
     <div class="who">
      <div class="who-line"><strong>{u.name??'No name yet'}</strong>{#if u.online}<span class="pill online"><span class="live-dot" aria-hidden="true"></span>Online now</span>{/if}{#if u.purchases}<span class="pill bought">Bought {u.purchases}×</span>{:else if u.attempts}<span class="pill tried">Tried {u.attempts}×</span>{/if}{#if u.sms_opt_out}<span class="pill off">No SMS</span>{/if}</div>
      <p class="small"><a href={'tel:+'+u.phone}>{pretty(u.phone)}</a>{#if u.network}{' · '}{NETWORKS[u.network]??u.network}{/if}{#if u.purchases}{' · '}{money(u.spent_tzs)}{/if}{' · last '}{when(u.last_at??u.added_at)}</p>
      {#if u.note}<p class="small note">{u.note}</p>{/if}
     </div>
     <button type="button" class="act" onclick={()=>openEdit(u)}><Icon name="settings" size={15}/>{u.name?'Edit':'Add name'}</button>
    </li>
   {/each}
  </ul>
 {/if}
</section>

{#if data.campaigns?.length}
 <section class="panel">
  <h2>Recent SMS</h2>
  <ul class="campaigns">
   {#each data.campaigns as c (c.id)}
    <li><p>{c.text}</p><p class="small muted">{when(c.created_at)} · {c.recipients} recipient{c.recipients===1?'':'s'} · {c.sent} sent{#if c.failed}{` · ${c.failed} failed`}{/if}{#if c.sent_by}{` · by ${c.sent_by}`}{/if}</p></li>
   {/each}
  </ul>
 </section>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="pop" bind:this={editDialog} onclick={e=>{if(e.target===editDialog)closeModal(editDialog);}} aria-labelledby="edit-title">
 <form method="POST" action="?/save" use:enhance={submitEdit}>
  <div class="pop-head"><h2 id="edit-title">{editing.isNew?'Add user':'Edit user'}</h2><button type="button" class="icon-close" aria-label="Close" onclick={()=>closeModal(editDialog)}><Icon name="close" size={18}/></button></div>
  {#if editProblem}<div class="notice error" role="alert">{editProblem}</div>{/if}
  <label class="field">Phone number<input name="phone" required inputmode="tel" placeholder="0752 093 014" value={editing.phone} readonly={!editing.isNew}></label>
  <label class="field">Name<input name="name" maxlength="80" placeholder="Their name" value={editing.name}></label>
  <label class="field">Note <span class="optional">optional</span><input name="note" maxlength="300" placeholder="e.g. student, buys weekly" value={editing.note}></label>
  <label class="check"><input type="checkbox" name="sms_opt_out" checked={editing.sms_opt_out}>No SMS: they asked not to be texted</label>
  <div class="pop-actions"><button type="button" class="button secondary" onclick={()=>closeModal(editDialog)}>Cancel</button><button class="button" disabled={saving}>{saving?'Saving…':'Save'}</button></div>
 </form>
</dialog>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="pop" bind:this={smsDialog} onclick={e=>{if(e.target===smsDialog)closeModal(smsDialog);}} aria-labelledby="sms-title">
 <form method="POST" action="?/sms" use:enhance={submitSms}>
  <div class="pop-head"><h2 id="sms-title">Send SMS to {reachable} user{reachable===1?'':'s'}</h2><button type="button" class="icon-close" aria-label="Close" onclick={()=>closeModal(smsDialog)}><Icon name="close" size={18}/></button></div>
  {#if smsProblem}<div class="notice error" role="alert">{smsProblem}</div>{/if}
  <input type="hidden" name="phones" value={JSON.stringify([...chosen])}>
  <label class="field">Message<textarea name="text" rows="5" maxlength="480" bind:value={message} placeholder="JIACHIE WIFI: …"></textarea></label>
  <p class="counter" class:over={count.segs>3}>{count.n} characters · {count.segs} SMS each{#if !count.plain}{' · has special characters, so 70 per SMS'}{/if} · about {count.segs*reachable} credit{count.segs*reachable===1?'':'s'}{#if data.sms.balance!==null}{` of ${data.sms.balance}`}{/if}</p>
  <p class="hint">Sent from your MoSMS account. Start with the shop's name so people know who it is from. People marked "No SMS" are skipped.</p>
  <div class="pop-actions"><button type="button" class="button secondary" onclick={()=>closeModal(smsDialog)}>Cancel</button><button class="button" disabled={sending||!count.n||count.segs>3}>{sending?'Sending…':`Send to ${reachable}`}</button></div>
 </form>
</dialog>

<style>
 .heading-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
 .heading-actions .button{margin:0;height:42px}
 .panel{margin-bottom:18px}
 .panel h2{margin:0 0 12px;font-size:1.05rem}
 /* Search on the left, the three views on the right: one height, one edge. */
 .filters{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;margin:0 0 12px}
 .search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin:0}
 .search-box{position:relative;display:block;min-width:0}
 .search-box :global(svg){position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
 .search-box input{display:block;width:100%;height:44px;min-height:44px;margin:0;padding:0 12px 0 40px;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font:inherit;font-size:.92rem}
 .search-box input:focus{border-color:var(--primary);outline:2px solid color-mix(in srgb,var(--primary) 25%,transparent);outline-offset:0}
 .search .button{margin:0;height:44px;padding:0 18px}
 .tabs{display:inline-flex;align-items:stretch;height:44px;padding:4px;gap:4px;border:1px solid var(--line);border-radius:12px;background:var(--surface-muted);box-sizing:border-box}
 .tabs a{display:inline-flex;align-items:center;gap:7px;padding:0 14px;border-radius:8px;color:var(--muted);font-size:.86rem;font-weight:600;text-decoration:none;white-space:nowrap}
 .tabs a:hover{color:var(--ink)}
 .tabs a.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
 .count{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 6px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:.72rem;font-weight:700;font-variant-numeric:tabular-nums;box-sizing:border-box}
 .tabs a.on .count{background:var(--primary-soft);color:var(--primary-text)}
 .live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 3px color-mix(in srgb,var(--success) 22%,transparent);flex-shrink:0}
 .pill.online{gap:6px;align-items:center;background:var(--success-soft);color:var(--success)}
 .searching{margin:-2px 0 8px;font-size:.86rem;color:var(--ink)}
 .searching a{color:var(--primary-text);font-weight:600}
 .sms-line{margin:0 0 8px}
 .select-all{padding:6px 0 8px;border-bottom:1px solid var(--line)}
 .check{display:flex;flex-direction:row;align-items:center;gap:9px;margin:0;font-size:.86rem;font-weight:500}
 .check input,.tick{width:18px;height:18px;min-height:0;margin:0;padding:0;flex-shrink:0}
 .users{list-style:none;margin:0;padding:0}
 .users li{display:flex;align-items:center;gap:12px;padding:12px 6px;border-bottom:1px solid var(--line);border-radius:8px}
 .users li.ticked{background:var(--primary-soft)}
 .who{flex:1;min-width:0}
 .who-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
 .who p{margin:3px 0 0;color:var(--muted)}
 .who a{color:var(--ink);font-variant-numeric:tabular-nums;text-decoration:none}
 .note{color:var(--ink)!important}
 .pill{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700}
 .pill.bought{background:var(--success-soft);color:var(--success)}.pill.tried{background:var(--warning-soft);color:var(--warning)}.pill.off{background:var(--surface-muted);color:var(--muted)}
 .act{display:inline-flex;align-items:center;gap:6px;height:36px;margin:0;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0}
 .act:hover{background:var(--surface-muted)}
 .empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px 12px;text-align:center;color:var(--muted)}
 .empty p{margin:0}
 .empty .button{margin:0}
 .campaigns{list-style:none;margin:0;padding:0}
 .campaigns li{padding:10px 0;border-top:1px solid var(--line)}.campaigns li:first-child{border-top:0}
 .campaigns p{margin:0;white-space:pre-wrap}.campaigns p+p{margin-top:4px}
 .pop{margin:auto;width:min(500px,calc(100% - 24px));max-height:calc(100vh - 24px);padding:0;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.25)}
 .pop::backdrop{background:rgba(15,23,42,.45)}
 .pop form{display:flex;flex-direction:column;gap:14px;padding:22px}
 .pop-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.pop-head h2{margin:0;font-size:1.15rem}
 .icon-close{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--muted);cursor:pointer}
 .field{display:flex;flex-direction:column;gap:6px;margin:0;font-size:.82rem;font-weight:600}
 .field input{height:42px;min-height:42px;margin:0;padding:0 12px;box-sizing:border-box}
 .field input[readonly]{background:var(--surface-muted);color:var(--muted)}
 .field textarea{margin:0;padding:10px 12px;font:inherit;font-size:.92rem;line-height:1.45;resize:vertical;min-height:110px}
 .optional{font-weight:400;color:var(--muted)}
 .counter{margin:-6px 0 0;font-size:.78rem;color:var(--muted)}.counter.over{color:var(--danger);font-weight:600}
 .hint{margin:-4px 0 0;font-size:.78rem;color:var(--muted)}
 .pop-actions{display:flex;justify-content:flex-end;gap:10px}.pop-actions .button{margin:0;height:42px}
 .pop .notice{margin:0}
 @media (max-width:640px){.heading-actions{width:100%}.heading-actions .button{flex:1}.filters{grid-template-columns:1fr}.tabs{display:grid;grid-template-columns:repeat(2,1fr);height:auto;width:100%}.tabs a{height:36px}.tabs a{justify-content:center;padding:0 6px}.users li{flex-wrap:wrap;align-items:flex-start}.users li .tick{margin-top:3px}.who{flex:1 1 calc(100% - 40px)}.users li .act{margin-left:30px}.pop-actions .button{flex:1}}
</style>
