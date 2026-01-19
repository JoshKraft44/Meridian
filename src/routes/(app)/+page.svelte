<script lang="ts">
  import type { PageData } from './$types';
  import KpiCard from '$lib/components/KpiCard.svelte';
  import SecondaryTile from '$lib/components/SecondaryTile.svelte';
  import DateRangePicker from '$lib/components/DateRangePicker.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import BarChart from '$lib/components/BarChart.svelte';
  import { formatDateTime } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  let syncing = $state(false);
  let syncMessage = $state('');

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

      <div class="flex items-center gap-3">
        <DateRangePicker current={data.preset} />
        <button
          onclick={syncNow}
          disabled={syncing}
          class="btn-outline text-xs"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
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
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">
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
      <SecondaryTile label="Payouts" cents={data.payoutsCents} />
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-3 gap-4">
      <div class="col-span-2">
        <LineChart data={data.timeSeries} />
      </div>
      <div>
        <BarChart data={data.feeBreakdown} />
      </div>
    </div>

  </div>
</div>
