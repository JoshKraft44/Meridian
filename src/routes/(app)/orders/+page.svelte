<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PlatformFilter } from '$lib/types';
  import { formatCents, formatDateShort } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  const platforms: { label: string; value: PlatformFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Shopify', value: 'shopify' },
    { label: 'Etsy', value: 'etsy' }
  ];

  function selectPlatform(value: PlatformFilter) {
    const url = new URL($page.url);
    if (value === 'all') {
      url.searchParams.delete('platform');
    } else {
      url.searchParams.set('platform', value);
    }
    url.searchParams.delete('page');
    goto(url.toString(), { keepFocus: true });
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

  function statusBadge(status: string) {
    switch (status) {
      case 'CLOSED': return 'bg-positive/10 text-positive';
      case 'REFUNDED': return 'bg-negative/10 text-negative';
      case 'CANCELLED': return 'bg-text-muted/10 text-text-muted';
      default: return 'bg-warning/10 text-warning';
    }
  }

  function netProfit(o: typeof data.orders[0]) {
    return o.grossRevenueCents - o.totalFeesCents - (o.shippingCostCents ?? 0) - o.totalRefundsCents;
  }
</script>

<svelte:head>
  <title>Orders — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-7xl mx-auto space-y-6">

    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-text-primary">Orders</h1>
        <p class="text-xs text-text-muted mt-0.5">{data.total} total</p>
      </div>

      <div class="flex items-center gap-1.5">
        {#each platforms as p}
          <button
            onclick={() => selectPlatform(p.value)}
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              {data.platform === p.value
                ? 'text-white accent-bg'
                : 'text-text-secondary bg-elevated border border-border hover:border-border-hover hover:text-text-primary'}"
          >
            {p.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th class="text-left px-4 py-3 font-medium">Order</th>
            <th class="text-left px-4 py-3 font-medium">Date</th>
            <th class="text-left px-4 py-3 font-medium">Platform</th>
            <th class="text-left px-4 py-3 font-medium">Status</th>
            <th class="text-right px-4 py-3 font-medium">Revenue</th>
            <th class="text-right px-4 py-3 font-medium">Fees</th>
            <th class="text-right px-4 py-3 font-medium">Shipping</th>
            <th class="text-right px-4 py-3 font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {#each data.orders as order}
            <tr
              onclick={() => goto(`/orders/${order.id}`)}
              class="border-b border-border/50 hover:bg-elevated/50 transition-colors duration-150 cursor-pointer"
            >
              <td class="px-4 py-3 text-text-primary font-medium">
                {order.orderName ?? `#${order.platformOrderId}`}
              </td>
              <td class="px-4 py-3 text-text-secondary">
                {formatDateShort(order.orderDate)}
              </td>
              <td class="px-4 py-3">
                <span class="text-xs text-text-muted">{order.platform}</span>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusBadge(order.status)}">
                  {order.status.toLowerCase()}
                </span>
              </td>
              <td class="px-4 py-3 text-right text-text-primary tabular-nums">
                {formatCents(order.grossRevenueCents)}
              </td>
              <td class="px-4 py-3 text-right text-text-secondary tabular-nums">
                {formatCents(order.totalFeesCents)}
              </td>
              <td class="px-4 py-3 text-right tabular-nums"
                class:text-text-secondary={order.shippingCostCents !== null}
                class:text-warning={order.shippingCostCents === null}
              >
                {order.shippingCostCents !== null ? formatCents(order.shippingCostCents) : '—'}
              </td>
              <td class="px-4 py-3 text-right font-medium tabular-nums"
                class:text-positive={netProfit(order) >= 0}
                class:text-negative={netProfit(order) < 0}
              >
                {formatCents(netProfit(order))}
              </td>
            </tr>
          {/each}

          {#if data.orders.length === 0}
            <tr>
              <td colspan="8" class="px-4 py-12 text-center text-text-muted text-sm">
                No orders found
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

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
