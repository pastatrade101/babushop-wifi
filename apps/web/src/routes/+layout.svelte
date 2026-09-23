<script lang="ts">
import '../app.css';
import {page} from '$app/state';
import ThemeToggle from '$lib/components/ThemeToggle.svelte';
let {children}=$props();
</script>
{#if !page.route.id?.startsWith('/(staff)')}<div class="public-theme no-print"><ThemeToggle/></div>{/if}
{@render children()}
