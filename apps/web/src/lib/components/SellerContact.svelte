<script lang="ts">
// English by default; the Swahili buying screens pass their own wording.
let {label='Contact the seller to buy credits',callLabel='Call the seller on 0758342054 to buy credits'}=$props<{label?:string;callLabel?:string}>();
</script>
<div class="seller-contact"><span>{label}</span><a href="tel:+255758342054" aria-label={callLabel}>0758342054 <span aria-hidden="true">↗</span></a></div>
<style>
.seller-contact{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px 12px;padding:12px 14px;margin-top:18px;border:1px solid var(--line);border-radius:10px;background:var(--primary-soft);color:var(--muted);font-size:12px}
a{display:inline-flex;align-items:center;gap:8px;min-height:36px;font-size:15px;font-weight:700;color:var(--primary-text);white-space:nowrap;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid var(--primary);outline-offset:3px;border-radius:4px}a span{font-size:13px}
</style>
