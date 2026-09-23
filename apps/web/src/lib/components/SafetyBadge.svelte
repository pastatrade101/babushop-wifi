<script lang="ts">
// Three levels, so the page never leaves an administrator guessing what a button
// will do. READ ONLY acts immediately; CONTROLLED CHANGE needs a confirmation;
// DANGEROUS is never wired to a button at all and says where to go instead.
type Level='read'|'controlled'|'dangerous';
let {level='read',label=''}=$props<{level?:Level;label?:string}>();
const copy:Record<string,string>={read:'READ ONLY',controlled:'CONTROLLED CHANGE',dangerous:'MANUAL ONLY'};
</script>

<span class="safety {level}">{label||copy[level]}</span>

<style>
 .safety{display:inline-block;border-radius:6px;padding:4px 9px;font-size:.62rem;letter-spacing:.07em;font-weight:700;white-space:nowrap}
 .read{background:var(--success-soft);border:1px solid var(--line);color:var(--success)}
 .controlled{background:var(--warning-soft);border:1px solid var(--line);color:var(--warning)}
 .dangerous{background:var(--danger-soft);border:1px solid var(--line);color:var(--danger)}
</style>
