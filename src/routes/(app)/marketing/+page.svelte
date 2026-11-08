<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { formatCents, formatDateTime } from '$lib/utils';

  let { data }: { data: PageData } = $props();
  let refreshing = $state(false);

  async function recheck() {
    refreshing = true;
    await invalidateAll();
    refreshing = false;
  }

  const AD_STATUS: Record<number, string> = {
    1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending risk review',
    8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed'
  };

  function expiryLabel(expiresAt: number): string {
    if (expiresAt === 0) return 'Never expires';
    return `Expires ${formatDateTime(new Date(expiresAt * 1000))}`;
  }
</script>

<svelte:head>
  <title>Marketing — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-3xl mx-auto space-y-6">

    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-text-primary">Marketing</h1>
        <p class="text-xs text-text-muted mt-1">Meta connection check</p>
      </div>
      {#if data.configured}
        <button class="btn-outline text-xs" onclick={recheck} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Re-check'}
        </button>
      {/if}
    </div>

    {#if !data.configured}
      <section class="card p-5 space-y-3">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-text-muted"></span>
          <span class="text-sm text-text-secondary">No Meta token configured</span>
        </div>
        <p class="text-xs text-text-muted leading-relaxed">
          Set <code class="text-text-secondary">META_ACCESS_TOKEN</code> (system user token) and
          <code class="text-text-secondary">META_AD_ACCOUNT_ID</code> in the environment, then restart the server.
        </p>
      </section>
    {:else}
      {@const r = data.report}

      <!-- Token -->
      <section class="card p-5 space-y-3">
        <h2 class="text-sm font-semibold text-text-primary">Access token</h2>

        {#if r.tokenInfo.ok && r.tokenInfo.data}
          {@const t = r.tokenInfo.data}
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full {t.is_valid ? 'bg-positive' : 'bg-negative'}"></span>
            <span class="text-sm text-text-primary">{t.is_valid ? 'Valid' : 'Invalid'}</span>
            <span class="text-xs text-text-muted">· {t.type} · {t.application ?? t.app_id}</span>
          </div>
          {#if t.is_valid}
            <p class="text-xs {t.expires_at === 0 ? 'text-text-muted' : 'text-warning'}">{expiryLabel(t.expires_at)}</p>
          {:else if t.error}
            <p class="text-xs text-negative">{t.error.message}</p>
          {/if}
        {:else if r.me.ok}
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-positive"></span>
            <span class="text-sm text-text-primary">Token works</span>
          </div>
          {#if !data.hasAppCredentials}
            <p class="text-xs text-text-muted">Add META_APP_ID + META_SECRET to see token type and expiry.</p>
          {:else if !r.tokenInfo.ok}
            <p class="text-xs text-warning">debug_token failed: {r.tokenInfo.error.message}</p>
          {/if}
        {/if}

        {#if r.me.ok}
          <p class="text-xs text-text-muted">Acting as <span class="text-text-secondary">{r.me.data.name}</span> ({r.me.data.id})</p>
        {:else}
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-negative"></span>
            <span class="text-sm text-negative">{r.me.error.message}</span>
          </div>
        {/if}
      </section>

      <!-- Permissions -->
      <section class="card p-5 space-y-3">
        <h2 class="text-sm font-semibold text-text-primary">Permissions</h2>
        {#if r.scopes === null}
          <p class="text-xs text-text-muted">Couldn't read the token's scopes.</p>
        {:else}
          <div class="divide-y divide-border">
            {#each r.capabilities as cap}
              <div class="flex items-center justify-between py-2">
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full {cap.granted ? 'bg-positive' : 'bg-warning'}"></span>
                  <span class="text-sm text-text-secondary">{cap.label}</span>
                </div>
                <span class="text-xs {cap.granted ? 'text-text-muted' : 'text-warning'}">
                  {cap.granted ? cap.scopes.join(', ') : `missing ${cap.missing.join(', ')}`}
                </span>
              </div>
            {/each}
          </div>
          <details class="text-xs text-text-muted">
            <summary class="cursor-pointer hover:text-text-secondary transition-colors duration-150">All granted scopes ({r.scopes.length})</summary>
            <p class="mt-2 leading-relaxed">{r.scopes.join(', ')}</p>
          </details>
        {/if}
      </section>

      <!-- Pages + Instagram -->
      <section class="card p-5 space-y-3">
        <h2 class="text-sm font-semibold text-text-primary">Pages & Instagram</h2>
        {#if !r.pages.ok}
          <p class="text-xs text-negative">{r.pages.error.message}</p>
        {:else if r.pages.data.length === 0}
          <p class="text-xs text-warning">No Pages visible to this token. Check the system user's Page assignment.</p>
        {:else}
          {#each r.pages.data as page}
            <div class="rounded-md border border-border p-3 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-sm text-text-primary">{page.name}</span>
                <span class="text-xs text-text-muted">Page {page.id}</span>
              </div>
              {#if page.instagram_business_account}
                {@const ig = page.instagram_business_account}
                <p class="text-xs text-text-secondary">
                  @{ig.username ?? '—'}
                  <span class="text-text-muted">· IG {ig.id}
                    {#if ig.followers_count !== undefined}· {ig.followers_count} followers{/if}
                    {#if ig.media_count !== undefined}· {ig.media_count} posts{/if}
                  </span>
                </p>
              {:else}
                <p class="text-xs text-warning">No Instagram business account visible on this Page</p>
              {/if}
              {#if page.tasks?.length}
                <p class="text-xs text-text-muted">Tasks: {page.tasks.join(', ')}</p>
              {/if}
            </div>
          {/each}
        {/if}
      </section>

      <!-- Ad account -->
      <section class="card p-5 space-y-3">
        <h2 class="text-sm font-semibold text-text-primary">Ad account</h2>
        {#if !r.adAccount}
          <p class="text-xs text-text-muted">Set META_AD_ACCOUNT_ID to check the ad account.</p>
        {:else if !r.adAccount.ok}
          <p class="text-xs text-negative">{r.adAccount.error.message}</p>
        {:else}
          {@const acct = r.adAccount.data}
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full {acct.account_status === 1 ? 'bg-positive' : 'bg-warning'}"></span>
            <span class="text-sm text-text-primary">{acct.name}</span>
            <span class="text-xs text-text-muted">· {AD_STATUS[acct.account_status] ?? acct.account_status} · {acct.id}</span>
          </div>
          <p class="text-xs text-text-muted">
            {acct.currency} · {acct.timezone_name}
            {#if acct.business}· {acct.business.name}{/if}
          </p>
          {#if acct.currency !== 'CAD'}
            <p class="text-xs text-warning">Account currency is {acct.currency}; Meridian reports in CAD.</p>
          {/if}
          {#if acct.timezone_name !== 'America/Edmonton'}
            <p class="text-xs text-text-muted">Account timezone differs from America/Edmonton; daily insights will be bucketed in {acct.timezone_name}.</p>
          {/if}

          {#if r.adSpend7d?.ok}
            <div class="grid grid-cols-3 gap-3 pt-2">
              <div>
                <p class="text-xs text-text-muted">Spend (7d)</p>
                <p class="text-sm text-text-primary">{formatCents(r.adSpend7d.data.spendCents)}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted">Impressions</p>
                <p class="text-sm text-text-primary">{r.adSpend7d.data.impressions.toLocaleString('en-CA')}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted">Clicks</p>
                <p class="text-sm text-text-primary">{r.adSpend7d.data.clicks.toLocaleString('en-CA')}</p>
              </div>
            </div>
          {:else if r.adSpend7d}
            <p class="text-xs text-negative">Insights: {r.adSpend7d.error.message}</p>
          {/if}

          {#if r.pixels?.ok}
            {#if r.pixels.data.length === 0}
              <p class="text-xs text-warning">No Pixel linked. Meta can't attribute purchases to ads.</p>
            {/if}
            {#each r.pixels.data as px}
              <p class="text-xs text-text-muted pt-1">
                <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 {px.last_fired_time ? 'bg-positive' : 'bg-warning'}"></span>
                Pixel {px.name} · {px.last_fired_time ? `last fired ${formatDateTime(px.last_fired_time)}` : 'never fired'}
              </p>
            {/each}
          {:else if r.pixels}
            <p class="text-xs text-negative">Pixels: {r.pixels.error.message}</p>
          {/if}
        {/if}
      </section>

      <!-- Campaigns -->
      <section class="card p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-text-primary">Campaigns <span class="text-text-muted font-normal">· last 30 days</span></h2>
          <span class="text-xs text-text-muted">
            {data.lastSyncedAt ? `Synced ${formatDateTime(data.lastSyncedAt)}` : 'Not synced yet'}
          </span>
        </div>

        {#if data.lastSyncError}
          <p class="text-xs text-negative">Last sync failed: {data.lastSyncError}</p>
        {/if}

        {#if data.campaigns.length === 0}
          <p class="text-xs text-text-muted">No campaigns on the ad account yet.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-text-muted text-left">
                  <th class="font-normal py-2">Campaign</th>
                  <th class="font-normal py-2 text-right">Spend</th>
                  <th class="font-normal py-2 text-right">Clicks</th>
                  <th class="font-normal py-2 text-right">CPC</th>
                  <th class="font-normal py-2 text-right" title="Reported by Meta, not confirmed by Shopify">Meta purchases</th>
                  <th class="font-normal py-2 text-right" title="Meta-attributed purchase value ÷ spend">Meta ROAS</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                {#each data.campaigns as c}
                  <tr>
                    <td class="py-2">
                      <span class="text-text-primary">{c.name}</span>
                      <span class="block text-xs {c.effectiveStatus === 'ACTIVE' ? 'text-positive' : 'text-text-muted'}">
                        {(c.effectiveStatus ?? c.status ?? '—').toLowerCase().replace(/_/g, ' ')}
                        {#if c.dailyBudgetCents}· {formatCents(c.dailyBudgetCents)}/day{/if}
                      </span>
                    </td>
                    <td class="py-2 text-right text-text-secondary">{formatCents(c.spendCents)}</td>
                    <td class="py-2 text-right text-text-secondary">{c.clicks.toLocaleString('en-CA')}</td>
                    <td class="py-2 text-right text-text-secondary">{c.clicks ? formatCents(Math.round(c.spendCents / c.clicks)) : '—'}</td>
                    <td class="py-2 text-right text-text-secondary">{c.metaPurchases}</td>
                    <td class="py-2 text-right text-text-secondary">{c.spendCents ? (c.metaPurchaseValueCents / c.spendCents).toFixed(2) + '×' : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="text-xs text-text-muted">Purchases and ROAS are Meta's own attribution. Shopify-confirmed numbers come later.</p>
        {/if}
      </section>

      <p class="text-xs text-text-muted">Checked {formatDateTime(data.checkedAt)}</p>
    {/if}

  </div>
</div>
