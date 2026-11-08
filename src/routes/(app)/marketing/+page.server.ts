import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { checkMetaConnection } from '$lib/server/meta/connection';
import { getProfitSummary } from '$lib/server/profit';

const PERIODS = [7, 30, 90];

function sinceDaysAgo(days: number): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  return since;
}

async function loadCampaigns(since: Date) {
  const [campaigns, totals, settings] = await Promise.all([
    db.metaCampaign.findMany({ orderBy: { createdTime: 'desc' } }),
    db.metaCampaignDay.groupBy({
      by: ['campaignId'],
      where: { date: { gte: since } },
      _sum: { spendCents: true, impressions: true, clicks: true, metaPurchases: true, metaPurchaseValueCents: true }
    }),
    db.settings.findUnique({ where: { id: 'singleton' }, select: { metaLastSyncedAt: true, metaLastSyncError: true } })
  ]);

  const byCampaign = new Map(totals.map((t) => [t.campaignId, t._sum]));

  return {
    campaigns: campaigns.map((c) => {
      const t = byCampaign.get(c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudgetCents: c.dailyBudgetCents,
        spendCents: t?.spendCents ?? 0,
        impressions: t?.impressions ?? 0,
        clicks: t?.clicks ?? 0,
        metaPurchases: t?.metaPurchases ?? 0,
        metaPurchaseValueCents: t?.metaPurchaseValueCents ?? 0
      };
    }),
    lastSyncedAt: settings?.metaLastSyncedAt?.toISOString() ?? null,
    lastSyncError: settings?.metaLastSyncError ?? null
  };
}

// Meta ads drive website sales, so this compares against Shopify only.
// Meta's attributed numbers are kept separate from what Shopify actually recorded.
async function loadAdsVsShopify(since: Date) {
  const settings = await db.settings.findUnique({ where: { id: 'singleton' }, select: { excludeTaxesFromGross: true } });
  const [shopify, meta] = await Promise.all([
    getProfitSummary(since, new Date(), settings?.excludeTaxesFromGross ?? false, 'shopify'),
    db.metaCampaignDay.aggregate({
      where: { date: { gte: since } },
      _sum: { spendCents: true, clicks: true, metaPurchases: true, metaPurchaseValueCents: true }
    })
  ]);

  return {
    spendCents: meta._sum.spendCents ?? 0,
    clicks: meta._sum.clicks ?? 0,
    metaPurchases: meta._sum.metaPurchases ?? 0,
    metaPurchaseValueCents: meta._sum.metaPurchaseValueCents ?? 0,
    shopifyOrders: shopify.ordersCount,
    shopifyRevenueCents: shopify.grossProfitCents,
    shopifyNetCents: shopify.netProfitCents,
    missingShippingCostCount: shopify.missingShippingCostCount
  };
}

export const load: PageServerLoad = async ({ url }) => {
  const token = env.META_ACCESS_TOKEN;
  if (!token) {
    return { configured: false as const, adAccountId: env.META_AD_ACCOUNT_ID ?? null };
  }

  const requested = parseInt(url.searchParams.get('days') ?? '30');
  const days = PERIODS.includes(requested) ? requested : 30;
  const since = sinceDaysAgo(days);

  const [report, campaignData, adsVsShopify] = await Promise.all([
    checkMetaConnection({
      token,
      appId: env.META_APP_ID,
      appSecret: env.META_SECRET,
      adAccountId: env.META_AD_ACCOUNT_ID
    }),
    loadCampaigns(since),
    loadAdsVsShopify(since)
  ]);

  return {
    configured: true as const,
    hasAppCredentials: Boolean(env.META_APP_ID && env.META_SECRET),
    report,
    days,
    periods: PERIODS,
    adsVsShopify,
    ...campaignData,
    checkedAt: new Date().toISOString()
  };
};
