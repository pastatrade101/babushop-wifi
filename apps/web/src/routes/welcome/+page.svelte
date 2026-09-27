<script lang="ts">
import Icon from '$lib/components/Icon.svelte';
let {data,form}=$props();
let busy=$state(false);
</script>
<svelte:head><title>Set up your account · {data.brand}</title><meta name="robots" content="noindex"></svelte:head>
<main class="portal-wrap">
 <div class="portal-brand brand"><span class="brand-mark"><img src="/logo.webp" alt="" width="38" height="38"></span>{data.brand}</div>
 <section class="portal-card"><div class="portal-body">
  {#if !data.token}
   <p class="eyebrow">STAFF ACCOUNT</p><h1>This link is incomplete.</h1>
   <p>Open the invite email again and use the button in it. If the email is gone, ask your administrator to send a new invite.</p>
   <a class="button secondary full" href="/login">Go to sign in</a>
  {:else if form?.expired}
   <p class="eyebrow">STAFF ACCOUNT</p><h1>This link can't be used.</h1>
   <p class="notice error" role="alert">{form.error}</p>
   <a class="button secondary full" href="/login">Go to sign in</a>
  {:else}
   <p class="eyebrow">WELCOME</p><h1>Choose your password.</h1>
   <p>This is the password you'll use to sign in to {data.brand}. Pick one only you know.</p>
   {#if form?.error}<p class="notice error" role="alert">{form.error}</p>{/if}
   <form method="POST" onsubmit={()=>busy=true}>
    <input type="hidden" name="token_hash" value={data.token}>
    <label>New password<input name="password" type="password" autocomplete="new-password" minlength={data.min} maxlength="200" required placeholder={`At least ${data.min} characters`}></label>
    <label>Type it again<input name="confirm" type="password" autocomplete="new-password" minlength={data.min} maxlength="200" required placeholder="Same password"></label>
    <button class="button full" disabled={busy}>{busy?'Saving…':'Save password and sign in'} <Icon name="arrow" size={18}/></button>
   </form>
   <p class="small muted"><Icon name="lock" size={13}/> The link in your email works once. After this you sign in with your email and this password.</p>
  {/if}
 </div></section>
 <p class="portal-footer">Simple access. Your time, your connection.</p>
</main>
