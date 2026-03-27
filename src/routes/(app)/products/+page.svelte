<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PlatformFilter } from '$lib/types';
  import { formatCents } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  let searchInput = $state(data.search);
  let searchTimeout: ReturnType<typeof setTimeout>;

  const platforms: { label: string; value: PlatformFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Shopify', value: 'shopify' },
    { label: 'Etsy', value: 'etsy' }
  ];

  const linkFilters: { label: string; value: string | null }[] = [
    { label: 'All', value: null },
    { label: 'Linked', value: 'yes' },
    { label: 'Unlinked', value: 'no' }
  ];

  function updateParam(key: string, value: string | null) {
    const url = new URL($page.url);
    if (!value) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
    url.searchParams.delete('page');
    goto(url.toString(), { keepFocus: true });
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      updateParam('q', searchInput || null);
    }, 300);
  }

  function goToPage(p: number) {
    const url = new URL($page.url);
    if (p <= 1) {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', p.toString());
    }
    goto(url.toString());
  }

  function platformBadge(platform: string) {
    return platform === 'SHOPIFY'
      ? 'bg-[#96bf48]/10 text-[#96bf48]'
      : 'bg-[#f56400]/10 text-[#f56400]';
  }
</script>

<svelte:head>
  <title>Products — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-7xl mx-auto space-y-6">

    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-text-primary">Products</h1>
        <p class="text-xs text-text-muted mt-0.5">{data.total} total</p>
      </div>

      <a
        href="/products/linking"
        class="px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary bg-elevated border border-border hover:border-border-hover hover:text-text-primary transition-all duration-150"
      >
        Manage links
      </a>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4 flex-wrap">
      <input
        type="text"
        bind:value={searchInput}
        oninput={onSearchInput}
        placeholder="Search by title, SKU, or listing ID…"
        class="flex-1 min-w-[200px] max-w-sm px-3 py-1.5 text-sm bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover transition-colors duration-150"
      />

      <div class="flex items-center gap-1.5">
        {#each platforms as p}
          <button
            onclick={() => updateParam('platform', p.value === 'all' ? null : p.value)}
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              {data.platform === p.value
                ? 'text-white accent-bg'
                : 'text-text-secondary bg-elevated border border-border hover:border-border-hover hover:text-text-primary'}"
          >
            {p.label}
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-1.5">
        {#each linkFilters as f}
          <button
            onclick={() => updateParam('linked', f.value)}
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              {data.linked === f.value
                ? 'text-white accent-bg'
                : 'text-text-secondary bg-elevated border border-border hover:border-border-hover hover:text-text-primary'}"
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Product grid -->
    {#if data.products.length > 0}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {#each data.products as product}
          <button
            onclick={() => goto(`/products/${product.id}`)}
            class="card card-hover p-0 overflow-hidden text-left cursor-pointer"
          >
            <div class="aspect-square bg-elevated relative">
              {#if product.thumbnail}
                <img
                  src={product.thumbnail}
                  alt={product.title}
                  class="w-full h-full object-cover"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-text-muted">
                  <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              {/if}

              <!-- Platform badge -->
              <span class="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded font-medium {platformBadge(product.platform)}">
                {product.platform}
              </span>

              <!-- Linked indicator -->
              {#if product.linkedTo}
                <span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-positive" title="Linked to {product.linkedTo.title}"></span>
              {/if}
            </div>

            <div class="p-3 space-y-1">
              <p class="text-sm text-text-primary font-medium truncate">{product.title}</p>
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-text-muted truncate">{product.sku ?? '—'}</span>
                {#if product.priceCents != null}
                  <span class="text-xs text-text-secondary tabular-nums">{formatCents(product.priceCents)}</span>
                {/if}
              </div>
              {#if product.status}
                <span class="text-[10px] text-text-muted capitalize">{product.status}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="card py-16 text-center">
        <p class="text-sm text-text-muted">No products found</p>
      </div>
    {/if}

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex items-center justify-center gap-2">
        <button
          onclick={() => goToPage(data.page - 1)}
          disabled={data.page <= 1}
          class="btn-outline text-xs disabled:opacity-30"
        >
          Previous
        </button>
        <span class="text-xs text-text-muted">
          Page {data.page} of {data.totalPages}
        </span>
        <button
          onclick={() => goToPage(data.page + 1)}
          disabled={data.page >= data.totalPages}
          class="btn-outline text-xs disabled:opacity-30"
        >
          Next
        </button>
      </div>
    {/if}

  </div>
</div>
