<script lang="ts">
import {onMount} from 'svelte';
import Icon from './Icon.svelte';
let preference=$state('system');
let ready=$state(false);
onMount(()=>{
 const sync=()=>{try{const saved=localStorage.getItem('wifi-theme');preference=saved==='dark'||saved==='light'?saved:'system';}catch{preference='system';}};
 sync();ready=true;window.addEventListener('storage',sync);
 return()=>window.removeEventListener('storage',sync);
});
function change(event:Event){
 preference=(event.currentTarget as HTMLSelectElement).value;
 try{localStorage.setItem('wifi-theme',preference);}catch{
  const theme=preference==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;
  document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;
  return;
 }
 window.dispatchEvent(new Event('wifi-theme-change'));
}
</script>
<label class="theme-picker"><Icon name={preference==='dark'?'moon':preference==='light'?'sun':'monitor'} size={18}/><span class="sr-only">Color theme</span><select aria-label="Color theme" value={preference} onchange={change} disabled={!ready}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
