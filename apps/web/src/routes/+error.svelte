<script lang="ts">import {page} from '$app/state';</script>
<main class="portal-wrap"><section class="panel"><p class="eyebrow">{page.data?.brand??'JIACHIE WIFI'}</p><h1>We couldn’t open this page</h1><p>{page.error?.message||'Please try again.'}</p><a class="button" href="/">Return to dashboard</a></section></main>
