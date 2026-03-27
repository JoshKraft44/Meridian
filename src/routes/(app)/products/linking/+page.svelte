<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';

  let { data }: { data: PageData } = $props();

  let showAddForm = $state(false);
</script>

<svelte:head>
  <title>Link Products — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-5xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center gap-4">
      <a href="/products" class="text-text-muted hover:text-text-primary transition-colors duration-150">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </a>
      <h1 class="text-xl font-semibold text-text-primary">Link Products</h1>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <div class="card p-4">
        <p class="text-2xl font-semibold text-text-primary tabular-nums">{data.linkedCount}</p>
        <p class="text-xs text-text-muted mt-1">Linked</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-semibold text-text-primary tabular-nums">{data.shopifyCount}</p>
        <p class="text-xs text-text-muted mt-1">Shopify products</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-semibold text-text-primary tabular-nums">{data.etsyCount}</p>
        <p class="text-xs text-text-muted mt-1">Etsy products</p>
      </div>
    </div>

    <!-- Add Etsy product (interim) -->
    <div class="card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Add Etsy product</p>
        <button
          onclick={() => showAddForm = !showAddForm}
          class="text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          {showAddForm ? 'Hide' : 'Show'}
        </button>
      </div>
      <p class="text-xs text-text-muted">Manually add Etsy listings until API access is available. These will be matched by listing ID when Etsy syncs.</p>

      {#if showAddForm}
        <form
          method="POST"
          action="?/addEtsyProduct"
          use:enhance={() => {
            return async ({ update }) => {
              await update();
              showAddForm = false;
            };
          }}
          class="grid grid-cols-2 gap-3 pt-2"
        >
          <div>
            <label for="title" class="block text-xs text-text-muted mb-1">Title *</label>
            <input
              id="title"
              name="title"
              type="text"
              required
              class="w-full px-3 py-1.5 text-sm bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
              placeholder="Product title"
            />
          </div>
          <div>
            <label for="listingId" class="block text-xs text-text-muted mb-1">Etsy listing ID *</label>
            <input
              id="listingId"
              name="listingId"
              type="text"
              required
              class="w-full px-3 py-1.5 text-sm bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
              placeholder="e.g. 1234567890"
            />
          </div>
          <div>
            <label for="sku" class="block text-xs text-text-muted mb-1">SKU</label>
            <input
              id="sku"
              name="sku"
              type="text"
              class="w-full px-3 py-1.5 text-sm bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
              placeholder="For auto-matching"
            />
          </div>
          <div>
            <label for="imageUrl" class="block text-xs text-text-muted mb-1">Image URL</label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              class="w-full px-3 py-1.5 text-sm bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
              placeholder="https://..."
            />
          </div>
          <div class="col-span-2">
            <button
              type="submit"
              class="px-4 py-1.5 rounded-md text-xs font-medium text-white accent-bg hover:opacity-90 transition-opacity duration-150"
            >
              Add product
            </button>
          </div>
        </form>
      {/if}
    </div>

    <!-- SKU auto-matches -->
    <div class="space-y-3">
      <p class="text-xs font-medium text-text-muted uppercase tracking-widest">
        Auto-match suggestions ({data.skuMatches.length})
      </p>

      {#if data.skuMatches.length > 0}
        <div class="space-y-3">
          {#each data.skuMatches as match}
            <div class="card p-4">
              <div class="flex items-center gap-4">
                <!-- Shopify side -->
                <div class="flex-1 flex items-center gap-3 min-w-0">
                  {#if match.shopify.thumbnail}
                    <img src={match.shopify.thumbnail} alt="" class="w-10 h-10 rounded object-cover bg-elevated shrink-0" />
                  {:else}
                    <div class="w-10 h-10 rounded bg-elevated shrink-0"></div>
                  {/if}
                  <div class="min-w-0">
                    <p class="text-sm text-text-primary truncate">{match.shopify.title}</p>
                    <p class="text-xs text-text-muted">Shopify · SKU: {match.shopify.sku}</p>
                  </div>
                </div>

                <!-- Arrow -->
                <svg class="w-5 h-5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>

                <!-- Etsy side -->
                <div class="flex-1 flex items-center gap-3 min-w-0">
                  {#if match.etsy.thumbnail}
                    <img src={match.etsy.thumbnail} alt="" class="w-10 h-10 rounded object-cover bg-elevated shrink-0" />
                  {:else}
                    <div class="w-10 h-10 rounded bg-elevated shrink-0"></div>
                  {/if}
                  <div class="min-w-0">
                    <p class="text-sm text-text-primary truncate">{match.etsy.title}</p>
                    <p class="text-xs text-text-muted">Etsy · SKU: {match.etsy.sku}</p>
                  </div>
                </div>

                <!-- Confirm button -->
                <form method="POST" action="?/confirmMatch" use:enhance class="shrink-0">
                  <input type="hidden" name="shopifyId" value={match.shopify.id} />
                  <input type="hidden" name="etsyId" value={match.etsy.id} />
                  <button
                    type="submit"
                    class="px-3 py-1.5 rounded-md text-xs font-medium text-positive bg-positive/10 hover:bg-positive/20 transition-colors duration-150"
                  >
                    Confirm
                  </button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="card py-8 text-center">
          <p class="text-sm text-text-muted">No SKU matches found. Add Etsy products with matching SKUs to see suggestions.</p>
        </div>
      {/if}
    </div>

  </div>
</div>
