<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PlatformFilter } from '$lib/types';
  import KpiCard from '$lib/components/KpiCard.svelte';
  import SecondaryTile from '$lib/components/SecondaryTile.svelte';
  import DateRangePicker from '$lib/components/DateRangePicker.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import BarChart from '$lib/components/BarChart.svelte';
  import { formatDateTime } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  let syncing = $state(false);
  let syncMessage = $state('');

  // persist dismissed alert IDs in localStorage
  const DISMISSED_KEY = 'meridian:dismissed_alerts';
  function getDismissed(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
  let dismissed = $state(getDismissed());
  function dismissAlert(id: string) {
    dismissed = new Set([...dismissed, id]);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  }
  const visibleAlerts = $derived(data.takedownAlerts.filter((a) => !dismissed.has(a.id)));

  const platforms: { label: string; value: PlatformFilter }[] = [
    { label: 'All stores', value: 'all' },
    { label: 'Shopify', value: 'shopify' },
    { label: 'Etsy', value: 'etsy' }
  ];

  let storeOpen = $state(false);
  let storeDropdown = $state<HTMLDivElement>();

  function selectPlatform(value: PlatformFilter) {
    const url = new URL($page.url);
    if (value === 'all') {
      url.searchParams.delete('platform');
    } else {
      url.searchParams.set('platform', value);
    }
    storeOpen = false;
    goto(url.toString(), { keepFocus: true });
  }

  function handleStoreClickOutside(e: MouseEvent) {
    if (storeDropdown && !storeDropdown.contains(e.target as Node)) {
      storeOpen = false;
    }
  }

  const activePlatformLabel = $derived(
    platforms.find((p) => p.value === data.platform)?.label ?? 'All stores'
  );

  async function syncNow() {
    syncing = true;
    syncMessage = '';
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      syncMessage = json.message;
    } catch {
      syncMessage = 'Request failed';
    } finally {
      syncing = false;
    }
  }

  const { summary } = $derived(data);
</script>

<svelte:document onclick={handleStoreClickOutside} />

<svelte:head>
  <title>Dashboard — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-7xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-text-primary">Overview</h1>
        {#if data.lastSync}
          <p class="text-xs text-text-muted mt-0.5">Last synced {formatDateTime(data.lastSync)}</p>
        {:else}
          <p class="text-xs text-text-muted mt-0.5">Not yet synced</p>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <!-- Store dropdown -->
        <div class="relative" bind:this={storeDropdown}>
          <button
            onclick={() => (storeOpen = !storeOpen)}
            class="btn-outline text-xs inline-flex items-center gap-1.5"
          >
            {activePlatformLabel}
            <svg class="w-3 h-3 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
          {#if storeOpen}
            <div class="absolute right-0 top-full mt-1.5 z-50 w-40 rounded-lg bg-elevated border border-border shadow-lg py-1">
              {#each platforms as p}
                <button
                  onclick={() => selectPlatform(p.value)}
                  class="w-full text-left px-3 py-1.5 text-xs transition-colors duration-100
                    {data.platform === p.value
                      ? 'text-white accent-bg'
                      : 'text-text-secondary hover:text-text-primary hover:bg-base'}"
                >
                  {p.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <DateRangePicker current={data.preset} />

        <button
          onclick={syncNow}
          disabled={syncing}
          class="btn-outline text-xs inline-flex items-center gap-1.5"
        >
          {#if syncing}
            <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" />
            </svg>
            Syncing…
          {:else}
            Sync now
          {/if}
        </button>
      </div>
    </div>

    {#if syncMessage}
      <p class="text-xs text-text-secondary">{syncMessage}</p>
    {/if}

    {#if summary.missingShippingCostCount > 0}
      <div class="rounded-md bg-warning/10 border border-warning/20 px-4 py-2.5 text-xs text-warning">
        {summary.missingShippingCostCount} order{summary.missingShippingCostCount !== 1 ? 's' : ''} missing shipping cost — net profit may be understated
      </div>
    {/if}

    {#each visibleAlerts as alert (alert.id)}
      <div class="rounded-md bg-negative/10 border border-negative/20 px-4 py-2.5 flex items-center justify-between gap-4">
        <p class="text-xs text-negative">
          <a href="/products/{alert.inactiveProductId}" class="font-medium hover:underline">
            {alert.inactiveProductTitle}
          </a>
          <span class="text-negative/70"> on {alert.inactivePlatform.toLowerCase()} appears inactive — </span>
          <a href="/products/{alert.activeProductId}" class="hover:underline">
            {alert.recentOrderCount} recent order{alert.recentOrderCount !== 1 ? 's' : ''}
          </a>
          <span class="text-negative/70"> still coming in via {alert.activePlatform.toLowerCase()}</span>
        </p>
        <button
          onclick={() => dismissAlert(alert.id)}
          class="shrink-0 text-negative/50 hover:text-negative transition-colors duration-150"
          aria-label="Dismiss"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}

    <!-- Primary KPIs -->
    <div class="grid grid-cols-2 gap-4">
      <KpiCard
        label="Gross Profit"
        cents={summary.grossProfitCents}
        sublabel="{summary.ordersCount} orders"
        positive={false}
      />
      <KpiCard
        label="Net Profit"
        cents={summary.netProfitCents}
        sublabel="after fees, shipping, expenses"
      />
    </div>

    <!-- Secondary tiles -->
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <SecondaryTile label="Revenue" cents={summary.grossRevenueCents} />
      <SecondaryTile label="Fees" cents={summary.totalFeesCents} />
      <SecondaryTile
        label="Shipping charged"
        cents={summary.shippingChargedCents}
      />
      <SecondaryTile
        label="Shipping cost"
        cents={summary.shippingCostCents}
        note={summary.missingShippingCostCount > 0 ? `${summary.missingShippingCostCount} unknown` : ''}
      />
      <SecondaryTile label="Taxes" cents={summary.taxesCents} />
      <SecondaryTile label="Expenses" cents={summary.totalExpensesCents} />
      <SecondaryTile label="Subscriptions" cents={summary.subscriptionCostCents} />
      <SecondaryTile label="Payouts" cents={data.payoutsCents} />
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-3 gap-4">
      <div class="col-span-2">
        <LineChart data={data.timeSeries} />
      </div>
      <div>
        <BarChart data={data.costBreakdown} />
      </div>
    </div>

  </div>
</div>
