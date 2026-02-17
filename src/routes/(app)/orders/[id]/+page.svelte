<script lang="ts">
  import type { PageData } from './$types';
  import { formatCents, formatDateShort, formatDateTime } from '$lib/utils';
  import ImageLightbox from '$lib/components/ImageLightbox.svelte';

  let { data }: { data: PageData } = $props();
  const order = data.order;
  const productData = data.productDataMap;

  let lightboxImages: { src: string; alt: string | null }[] = $state([]);
  let lightboxOpen = $state(false);

  function openLightbox(platformProductId: string) {
    const pd = productData[platformProductId];
    if (!pd || pd.images.length === 0) return;
    lightboxImages = pd.images;
    lightboxOpen = true;
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'CLOSED': return 'bg-positive/10 text-positive';
      case 'REFUNDED': return 'bg-negative/10 text-negative';
      case 'CANCELLED': return 'bg-text-muted/10 text-text-muted';
      default: return 'bg-warning/10 text-warning';
    }
  }

  function fulfillmentBadge(status: string | null) {
    switch (status) {
      case 'fulfilled': return 'bg-positive/10 text-positive';
      case 'partial': return 'bg-warning/10 text-warning';
      default: return 'bg-text-muted/10 text-text-muted';
    }
  }

  const totalFees = order.feeLines.reduce((s, f) => s + f.amountCents, 0);
  const totalRefunds = order.refunds.reduce((s, r) => s + r.amountCents, 0);
  const netProfit = order.grossRevenueCents - totalFees - (order.shippingCostCents ?? 0) - totalRefunds;

  const feesByType = order.feeLines.reduce<Record<string, number>>((acc, f) => {
    const label = f.type.replace(/_/g, ' ').toLowerCase();
    acc[label] = (acc[label] ?? 0) + f.amountCents;
    return acc;
  }, {});

  const hasShippingAddress = order.shippingAddress1 || order.shippingCity;
  const discounts = (order.discountCodes ?? []) as { code: string; amount: string; type: string }[];
</script>

<svelte:head>
  <title>{order.orderName ?? `#${order.platformOrderId}`} — Meridian</title>
</svelte:head>

{#if lightboxOpen}
  <ImageLightbox images={lightboxImages} onclose={() => lightboxOpen = false} />
{/if}

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-6xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center gap-4">
      <a href="/orders" class="text-text-muted hover:text-text-primary transition-colors duration-150">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </a>
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-semibold text-text-primary">
          {order.orderName ?? `#${order.platformOrderId}`}
        </h1>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusBadge(order.status)}">
          {order.status.toLowerCase()}
        </span>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium {fulfillmentBadge(order.fulfillmentStatus)}">
          {order.fulfillmentStatus ?? 'unfulfilled'}
        </span>
      </div>
      <span class="text-sm text-text-muted ml-auto">{formatDateTime(order.orderDate)}</span>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Left column (2/3) -->
      <div class="lg:col-span-2 space-y-6">

        <!-- Line items -->
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Items</p>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border/50 text-xs text-text-muted uppercase tracking-wider">
                <th class="text-left px-4 py-2 font-medium">Product</th>
                <th class="text-left px-4 py-2 font-medium">SKU</th>
                <th class="text-right px-4 py-2 font-medium">Qty</th>
                <th class="text-right px-4 py-2 font-medium">Price</th>
                <th class="text-right px-4 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each order.lineItems as item}
                {@const pd = item.platformProductId ? productData[item.platformProductId] : null}
                <tr class="border-b border-border/30">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      {#if pd?.thumbnail}
                        <button
                          onclick={() => openLightbox(item.platformProductId!)}
                          class="w-10 h-10 rounded object-cover bg-elevated flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-white/20 transition-all duration-150 cursor-pointer"
                        >
                          <img
                            src={pd.thumbnail}
                            alt={item.title}
                            class="w-full h-full object-cover"
                          />
                        </button>
                      {:else}
                        <div class="w-10 h-10 rounded bg-elevated flex-shrink-0"></div>
                      {/if}
                      <div>
                        {#if pd}
                          <a
                            href="/products/{pd.productId}"
                            class="text-text-primary hover:accent-text transition-colors duration-150"
                          >
                            {item.title}
                          </a>
                        {:else}
                          <span class="text-text-primary">{item.title}</span>
                        {/if}
                        {#if item.variantTitle}
                          <span class="text-text-muted text-xs ml-1">/ {item.variantTitle}</span>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-text-muted text-xs">{item.sku ?? '—'}</td>
                  <td class="px-4 py-3 text-right text-text-secondary tabular-nums">{item.quantity}</td>
                  <td class="px-4 py-3 text-right text-text-secondary tabular-nums">{formatCents(item.priceCents)}</td>
                  <td class="px-4 py-3 text-right text-text-primary tabular-nums font-medium">
                    {formatCents(item.priceCents * item.quantity)}
                  </td>
                </tr>
              {/each}

              {#if order.lineItems.length === 0}
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-text-muted text-sm">
                    No line items synced yet
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>

        <!-- Payment summary -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Payment</p>

          <div class="space-y-2 text-sm">
            {#if order.subtotalPriceCents != null}
              <div class="flex justify-between">
                <span class="text-text-secondary">Subtotal</span>
                <span class="text-text-primary tabular-nums">{formatCents(order.subtotalPriceCents)}</span>
              </div>
            {/if}

            {#if discounts.length > 0}
              {#each discounts as d}
                <div class="flex justify-between">
                  <span class="text-text-secondary">Discount <span class="text-xs text-text-muted">({d.code})</span></span>
                  <span class="text-positive tabular-nums">-{formatCents(Math.round(parseFloat(d.amount) * 100))}</span>
                </div>
              {/each}
            {:else if order.totalDiscountsCents && order.totalDiscountsCents > 0}
              <div class="flex justify-between">
                <span class="text-text-secondary">Discounts</span>
                <span class="text-positive tabular-nums">-{formatCents(order.totalDiscountsCents)}</span>
              </div>
            {/if}

            <div class="flex justify-between">
              <span class="text-text-secondary">Shipping charged</span>
              <span class="text-text-primary tabular-nums">{formatCents(order.shippingChargedCents)}</span>
            </div>

            <div class="flex justify-between">
              <span class="text-text-secondary">Tax</span>
              <span class="text-text-primary tabular-nums">{formatCents(order.taxesCents)}</span>
            </div>

            <div class="flex justify-between pt-2 border-t border-border/50 font-medium">
              <span class="text-text-primary">Total</span>
              <span class="text-text-primary tabular-nums">{formatCents(order.grossRevenueCents)}</span>
            </div>

            {#if order.paymentGateway}
              <div class="text-xs text-text-muted pt-1">
                Paid via {order.paymentGateway}
              </div>
            {/if}
          </div>
        </div>

        <!-- Profit breakdown -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Profit breakdown</p>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-text-secondary">Gross revenue</span>
              <span class="text-text-primary tabular-nums">{formatCents(order.grossRevenueCents)}</span>
            </div>

            {#each Object.entries(feesByType) as [type, cents]}
              <div class="flex justify-between">
                <span class="text-text-secondary capitalize">{type}</span>
                <span class="text-negative tabular-nums">-{formatCents(cents)}</span>
              </div>
            {/each}

            <div class="flex justify-between"
              class:text-text-secondary={order.shippingCostCents !== null}
              class:text-warning={order.shippingCostCents === null}
            >
              <span>Shipping cost</span>
              <span class="tabular-nums">
                {order.shippingCostCents !== null ? `-${formatCents(order.shippingCostCents)}` : 'unknown'}
              </span>
            </div>

            {#if totalRefunds > 0}
              {#each order.refunds as refund}
                <div class="flex justify-between">
                  <span class="text-text-secondary">Refund ({formatDateShort(refund.refundDate)})</span>
                  <span class="text-negative tabular-nums">-{formatCents(refund.amountCents)}</span>
                </div>
              {/each}
            {/if}

            <div class="flex justify-between pt-2 border-t border-border/50 font-medium">
              <span class="text-text-primary">Net profit</span>
              <span class="tabular-nums" class:text-positive={netProfit >= 0} class:text-negative={netProfit < 0}>
                {formatCents(netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right column (1/3) -->
      <div class="space-y-6">

        <!-- Customer -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Customer</p>
          {#if order.customerName || order.customerEmail}
            <div class="space-y-1 text-sm">
              {#if order.customerName}
                <p class="text-text-primary font-medium">{order.customerName}</p>
              {/if}
              {#if order.customerEmail}
                <p class="text-text-secondary">{order.customerEmail}</p>
              {/if}
              {#if order.customerPhone}
                <p class="text-text-muted">{order.customerPhone}</p>
              {/if}
            </div>
          {:else}
            <p class="text-sm text-text-muted">No customer info</p>
          {/if}
        </div>

        <!-- Shipping address -->
        {#if hasShippingAddress}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Shipping address</p>
            <div class="text-sm text-text-secondary space-y-0.5">
              {#if order.shippingName}<p>{order.shippingName}</p>{/if}
              {#if order.shippingAddress1}<p>{order.shippingAddress1}</p>{/if}
              {#if order.shippingAddress2}<p>{order.shippingAddress2}</p>{/if}
              <p>
                {[order.shippingCity, order.shippingProvinceCode, order.shippingZip]
                  .filter(Boolean).join(', ')}
              </p>
              {#if order.shippingCountry}<p>{order.shippingCountry}</p>{/if}
            </div>
          </div>
        {/if}

        <!-- Notes -->
        {#if order.note}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Notes</p>
            <p class="text-sm text-text-secondary">{order.note}</p>
          </div>
        {/if}

        <!-- Tags -->
        {#if order.tags}
          <div class="card p-4 space-y-3">
            <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Tags</p>
            <div class="flex flex-wrap gap-1.5">
              {#each order.tags.split(',').map(t => t.trim()).filter(Boolean) as tag}
                <span class="text-xs px-2 py-0.5 rounded-full bg-elevated text-text-secondary border border-border">
                  {tag}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Order info -->
        <div class="card p-4 space-y-3">
          <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Details</p>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-text-muted">Platform</span>
              <span class="text-text-secondary">{order.platform}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Order ID</span>
              <span class="text-text-secondary">{order.platformOrderId}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Date</span>
              <span class="text-text-secondary">{formatDateTime(order.orderDate)}</span>
            </div>
            {#if order.cancelledAt}
              <div class="flex justify-between">
                <span class="text-text-muted">Cancelled</span>
                <span class="text-negative">{formatDateTime(order.cancelledAt)}</span>
              </div>
            {/if}
            {#if order.cancelReason}
              <div class="flex justify-between">
                <span class="text-text-muted">Reason</span>
                <span class="text-text-secondary capitalize">{order.cancelReason}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
