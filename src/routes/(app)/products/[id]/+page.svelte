<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { formatCents, formatDateShort } from '$lib/utils';
  import ImageLightbox from '$lib/components/ImageLightbox.svelte';

  let { data }: { data: PageData } = $props();
  const product = data.product;

  let lightboxOpen = $state(false);

  function statusBadge(status: string) {
    switch (status) {
      case 'CLOSED': return 'bg-positive/10 text-positive';
      case 'REFUNDED': return 'bg-negative/10 text-negative';
      case 'CANCELLED': return 'bg-text-muted/10 text-text-muted';
      default: return 'bg-warning/10 text-warning';
    }
  }

  function platformBadge(platform: string) {
    return platform === 'SHOPIFY'
      ? 'bg-[#96bf48]/10 text-[#96bf48]'
      : 'bg-[#f56400]/10 text-[#f56400]';
  }

  function externalUrl(platform: string, platformProductId: string): string | null {
    if (platform === 'SHOPIFY' && data.shopDomain) {
      return `https://${data.shopDomain}/admin/products/${platformProductId}`;
    }
    if (platform === 'ETSY') {
      return `https://www.etsy.com/listing/${platformProductId}`;
    }
    return null;
  }

  const extUrl = externalUrl(product.platform, product.platformProductId);
  const linkedExtUrl = data.linked
    ? externalUrl(data.linked.platform, data.linked.platformProductId)
    : null;

  const hasDimensions = product.weightGrams || product.lengthCm || product.widthCm || product.heightCm;
</script>

<svelte:head>
  <title>{product.title} — Meridian</title>
</svelte:head>

{#if lightboxOpen}
  <ImageLightbox
    images={product.images.map((img) => ({ src: img.src, alt: img.alt }))}
    onclose={() => lightboxOpen = false}
  />
{/if}

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-6xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center gap-4">
      <a href="/products" class="text-text-muted hover:text-text-primary transition-colors duration-150">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </a>
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-semibold text-text-primary">{product.title}</h1>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium {platformBadge(product.platform)}">
          {product.platform}
        </span>
        {#if product.status}
          <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-elevated text-text-muted capitalize">
            {product.status}
          </span>
        {/if}
      </div>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Left column (2/3) -->
      <div class="lg:col-span-2 space-y-6">

        <!-- Images -->
        {#if product.images.length > 0}
          <div class="card overflow-hidden">
            <div class="px-4 py-3 border-b border-border">
              <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Images</p>
            </div>
            <div class="p-4">
              <div class="grid grid-cols-3 md:grid-cols-4 gap-3">
                {#each product.images as img, i}
                  <button
                    onclick={() => lightboxOpen = true}
                    class="aspect-square rounded-md overflow-hidden bg-elevated hover:ring-2 hover:ring-white/20 transition-all duration-150 cursor-pointer"
                  >
                    <img src={img.src} alt={img.alt ?? product.title} class="w-full h-full object-cover" />
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Description -->
        {#if product.description}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Description</p>
            <p class="text-sm text-text-secondary whitespace-pre-wrap">{product.description}</p>
          </div>
        {/if}

        <!-- Recent orders -->
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Recent orders</p>
          </div>
          {#if data.recentOrders.length > 0}
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50 text-xs text-text-muted uppercase tracking-wider">
                  <th class="text-left px-4 py-2 font-medium">Order</th>
                  <th class="text-left px-4 py-2 font-medium">Date</th>
                  <th class="text-left px-4 py-2 font-medium">Status</th>
                  <th class="text-right px-4 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {#each data.recentOrders as order}
                  <tr
                    onclick={() => goto(`/orders/${order.id}`)}
                    class="border-b border-border/30 hover:bg-elevated/50 transition-colors duration-150 cursor-pointer"
                  >
                    <td class="px-4 py-2.5 text-text-primary font-medium">
                      {order.orderName ?? `#${order.id}`}
                    </td>
                    <td class="px-4 py-2.5 text-text-secondary">
                      {formatDateShort(order.orderDate)}
                    </td>
                    <td class="px-4 py-2.5">
                      <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusBadge(order.status)}">
                        {order.status.toLowerCase()}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right text-text-primary tabular-nums">
                      {formatCents(order.grossRevenueCents)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <div class="px-4 py-8 text-center text-text-muted text-sm">
              No orders yet
            </div>
          {/if}
        </div>
      </div>

      <!-- Right column (1/3) -->
      <div class="space-y-6">

        <!-- Details -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Details</p>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-text-muted">Platform</span>
              <span class="text-text-secondary">{product.platform}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-text-muted shrink-0">Listing ID</span>
              {#if extUrl}
                <a href={extUrl} target="_blank" rel="noopener" class="text-text-secondary hover:accent-text transition-colors duration-150 truncate">
                  {product.platformProductId}
                  <svg class="w-3 h-3 inline ml-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              {:else}
                <span class="text-text-secondary truncate">{product.platformProductId}</span>
              {/if}
            </div>
            {#if product.sku}
              <div class="flex justify-between">
                <span class="text-text-muted">SKU</span>
                <span class="text-text-secondary">{product.sku}</span>
              </div>
            {/if}
            {#if product.priceCents != null}
              <div class="flex justify-between">
                <span class="text-text-muted">Price</span>
                <span class="text-text-primary tabular-nums font-medium">{formatCents(product.priceCents)}</span>
              </div>
            {/if}
            {#if product.vendor}
              <div class="flex justify-between">
                <span class="text-text-muted">Vendor</span>
                <span class="text-text-secondary">{product.vendor}</span>
              </div>
            {/if}
            {#if product.productType}
              <div class="flex justify-between">
                <span class="text-text-muted">Type</span>
                <span class="text-text-secondary">{product.productType}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Tags -->
        {#if product.tags}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Tags</p>
            <div class="flex flex-wrap gap-1.5">
              {#each product.tags.split(',').map(t => t.trim()).filter(Boolean) as tag}
                <span class="text-xs px-2 py-0.5 rounded-full bg-elevated text-text-secondary border border-border">
                  {tag}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Dimensions -->
        {#if hasDimensions}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Dimensions</p>
            <div class="space-y-2 text-sm">
              {#if product.weightGrams}
                <div class="flex justify-between">
                  <span class="text-text-muted">Weight</span>
                  <span class="text-text-secondary">{product.weightGrams}g</span>
                </div>
              {/if}
              {#if product.lengthCm || product.widthCm || product.heightCm}
                <div class="flex justify-between">
                  <span class="text-text-muted">Size</span>
                  <span class="text-text-secondary">
                    {[product.lengthCm, product.widthCm, product.heightCm].filter(Boolean).join(' × ')} cm
                  </span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Linked product -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Linked product</p>
          {#if data.linked}
            <button
              onclick={() => goto(`/products/${data.linked!.id}`)}
              class="w-full flex items-center gap-3 p-2 -m-2 rounded-md hover:bg-elevated transition-colors duration-150 cursor-pointer"
            >
              {#if data.linked.thumbnail}
                <img
                  src={data.linked.thumbnail}
                  alt={data.linked.title}
                  class="w-10 h-10 rounded object-cover bg-elevated shrink-0"
                />
              {:else}
                <div class="w-10 h-10 rounded bg-elevated shrink-0"></div>
              {/if}
              <div class="text-left min-w-0">
                <p class="text-sm text-text-primary truncate">{data.linked.title}</p>
                <span class="text-[10px] font-medium {platformBadge(data.linked.platform)}">{data.linked.platform}</span>
              </div>
            </button>
            <div class="flex items-center justify-between mt-1">
              {#if linkedExtUrl}
                <a
                  href={linkedExtUrl}
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors duration-150"
                >
                  View on {data.linked.platform.toLowerCase()}
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              {:else}
                <span></span>
              {/if}
              <form method="POST" action="?/unlink" use:enhance>
                <button type="submit" class="text-xs text-negative/70 hover:text-negative transition-colors duration-150">
                  Unlink
                </button>
              </form>
            </div>
          {:else}
            <p class="text-sm text-text-muted">Not linked to another platform</p>
            <a
              href="/products/linking"
              class="inline-block text-xs accent-text hover:underline"
            >
              Manage links
            </a>
          {/if}
        </div>
      </div>
    </div>

  </div>
</div>
