<script lang="ts">
  import { page } from '$app/stores';

  let { children }: { children: import('svelte').Snippet } = $props();

  const tabs = [
    { label: 'Overview', href: '/marketing' },
    { label: 'Posts', href: '/marketing/posts' },
    { label: 'Library', href: '/marketing/library' }
  ];

  function isActive(href: string) {
    return href === '/marketing' ? $page.url.pathname === href : $page.url.pathname.startsWith(href);
  }
</script>

<div class="flex-1 flex flex-col min-h-0">
  <header class="px-8 pt-6 border-b border-border">
    <h1 class="text-xl font-semibold text-text-primary">Marketing</h1>
    <nav class="flex gap-5 mt-4">
      {#each tabs as tab}
        <a
          href={tab.href}
          class="pb-2.5 text-sm border-b-2 -mb-px transition-colors duration-150
            {isActive(tab.href)
              ? 'text-text-primary border-[var(--accent)]'
              : 'text-text-muted border-transparent hover:text-text-secondary'}"
        >
          {tab.label}
        </a>
      {/each}
    </nav>
  </header>

  {@render children()}
</div>
