<script lang="ts">
  import type { LayoutData } from './$types';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div style="--accent: {data.accentColor}" class="flex min-h-screen bg-base">
  <Sidebar />

  <main class="flex-1 min-w-0 flex flex-col">
    {@render children()}
  </main>
</div>
