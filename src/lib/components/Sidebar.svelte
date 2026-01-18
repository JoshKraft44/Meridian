<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';

  const nav = [
    { label: 'Dashboard', href: '/', icon: 'grid' },
    { label: 'Orders', href: '/orders', icon: 'list' },
    { label: 'Expenses', href: '/expenses', icon: 'receipt' },
    { label: 'Settings', href: '/settings', icon: 'settings' }
  ];

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(href);
  }
</script>

<aside class="w-56 shrink-0 flex flex-col border-r border-border bg-surface">
  <div class="px-5 py-5 border-b border-border">
    <span class="text-base font-semibold text-text-primary tracking-tight">Meridian</span>
    <span class="block text-xs text-text-muted mt-0.5">Antler Addiction</span>
  </div>

  <nav class="flex-1 px-3 py-4 space-y-0.5">
    {#each nav as item}
      <a
        href={item.href}
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 group
          {isActive(item.href)
            ? 'text-text-primary bg-elevated'
            : 'text-text-secondary hover:text-text-primary hover:bg-elevated'}"
      >
        <span
          class="w-1.5 h-1.5 rounded-full transition-all duration-150
            {isActive(item.href) ? 'accent-bg' : 'bg-transparent group-hover:bg-border-hover'}"
        ></span>
        {item.label}
        {#if isActive(item.href)}
          <span class="ml-auto w-1 h-4 rounded-full accent-bg opacity-80"></span>
        {/if}
      </a>
    {/each}
  </nav>

  <div class="px-3 pb-4 border-t border-border pt-3">
    <form method="POST" action="/api/auth/logout" use:enhance>
      <button
        type="submit"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-text-muted hover:text-text-secondary hover:bg-elevated transition-all duration-150"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </form>
  </div>
</aside>
