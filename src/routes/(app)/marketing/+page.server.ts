import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { checkMetaConnection } from '$lib/server/meta/connection';

async function loadCampaigns() {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

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

export const load: PageServerLoad = async () => {
  const token = env.META_ACCESS_TOKEN;
  if (!token) {
    return { configured: false as const, adAccountId: env.META_AD_ACCOUNT_ID ?? null };
  }

  const [report, campaignData] = await Promise.all([
    checkMetaConnection({
      token,
      appId: env.META_APP_ID,
      appSecret: env.META_SECRET,
      adAccountId: env.META_AD_ACCOUNT_ID
    }),
    loadCampaigns()
  ]);

  return {
    configured: true as const,
    hasAppCredentials: Boolean(env.META_APP_ID && env.META_SECRET),
    report,
    ...campaignData,
    checkedAt: new Date().toISOString()
  };
};
