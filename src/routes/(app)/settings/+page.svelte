<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { formatDateTime } from '$lib/utils';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Settings — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-2xl mx-auto space-y-8">

    <h1 class="text-xl font-semibold text-text-primary">Settings</h1>

    {#if form?.saved}
      <div class="rounded-md bg-positive/10 border border-positive/20 px-4 py-2.5 text-xs text-positive">
        Settings saved
      </div>
    {/if}

    <section class="card p-5 space-y-4">
      <h2 class="text-sm font-semibold text-text-primary">Shopify Connection</h2>

      {#if data.connection}
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-positive"></span>
            <span class="text-sm text-text-primary">{data.connection.shop}</span>
          </div>
          <p class="text-xs text-text-muted">
            Connected {formatDateTime(data.connection.connectedAt)}
          </p>
          {#if data.lastSync?.finishedAt}
            <p class="text-xs text-text-muted">
              Last sync: {formatDateTime(data.lastSync.finishedAt)}
              — {data.lastSync.ordersUpserted} orders, {data.lastSync.payoutsSynced} payouts
            </p>
          {/if}
        </div>

        <div class="flex gap-3 pt-2">
          <a href="/api/shopify/install" class="btn-outline text-xs">Re-authorize</a>
          <form method="POST" action="?/disconnect" use:enhance>
            <button type="submit" class="text-xs text-negative hover:text-negative/80 transition-colors">
              Disconnect
            </button>
          </form>
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-text-muted"></span>
          <span class="text-sm text-text-secondary">Not connected</span>
        </div>
        <a href="/api/shopify/install" class="btn-outline text-xs inline-block mt-2">
          Connect Shopify
        </a>
      {/if}
    </section>

    <form method="POST" action="?/updateSettings" use:enhance class="card p-5 space-y-5">
      <h2 class="text-sm font-semibold text-text-primary">Dashboard</h2>

      <div class="space-y-1">
        <label for="accentColor" class="text-xs text-text-secondary">Accent color</label>
        <div class="flex items-center gap-3">
          <input
            type="color"
            id="accentColor"
            name="accentColor"
            value={data.settings.accentColor}
            class="w-8 h-8 rounded border border-border cursor-pointer"
          />
          <span class="text-xs text-text-muted">{data.settings.accentColor}</span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input
          type="checkbox"
          id="excludeTaxes"
          name="excludeTaxes"
          checked={data.settings.excludeTaxesFromGross}
          class="rounded border-border"
        />
        <label for="excludeTaxes" class="text-xs text-text-secondary">
          Exclude taxes from gross profit
        </label>
      </div>

      {#if form?.error}
        <p class="text-xs text-negative">{form.error}</p>
      {/if}

      <button type="submit" class="btn-outline text-xs">Save</button>
    </form>

  </div>
</div>
