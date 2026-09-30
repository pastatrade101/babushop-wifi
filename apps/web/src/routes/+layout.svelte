<script lang="ts">
import '../app.css';
import {page} from '$app/state';
import ThemeToggle from '$lib/components/ThemeToggle.svelte';
let {children}=$props();
</script>
<!-- The customer's buying pages carry the One Network design with its own colours, so no theme toggle there. -->
{#if !page.route.id?.startsWith('/(staff)')&&!page.route.id?.startsWith('/buy')}<div class="public-theme no-print"><ThemeToggle/></div>{/if}
{@render children()}
