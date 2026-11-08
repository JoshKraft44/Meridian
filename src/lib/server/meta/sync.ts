import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { metaGetPages, MetaApiError, type MetaCredentials } from './api';
import { normalizeAdAccountId } from './connection';

const BACKFILL_DAYS = 3 * 365; // Meta keeps ~37 months of insights
const RESTATE_DAYS = 28; // attribution keeps shifting for this long, so re-pull it every run
const WINDOW_DAYS = 90;

interface CampaignRow {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string; // minor units
  lifetime_budget?: string;
  created_time?: string;
}

interface ActionStat {
  action_type: string;
  value: string;
}

interface InsightRow {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: ActionStat[];
  action_values?: ActionStat[];
}

// Meta reports the same purchase under several action types. Take the first match so nothing is double counted.
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

function pickPurchase(stats: ActionStat[] | undefined): number {
  if (!stats) return 0;
  for (const type of PURCHASE_TYPES) {
    const hit = stats.find((s) => s.action_type === type);
    if (hit) return parseFloat(hit.value);
  }
  return 0;
}

function dollarsToCents(value: string | undefined): number {
  return value ? Math.round(parseFloat(value) * 100) : 0;
}

function todayInEdmonton(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function syncCampaigns(actId: string, creds: MetaCredentials): Promise<number> {
  let count = 0;

  for await (const batch of metaGetPages<CampaignRow>(`/${actId}/campaigns`, creds, {
    fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time',
    limit: '100'
  })) {
    for (const c of batch) {
      const data = {
        name: c.name,
        objective: c.objective ?? null,
        status: c.status ?? null,
        effectiveStatus: c.effective_status ?? null,
        dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget) : null,
        lifetimeBudgetCents: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
        createdTime: c.created_time ? new Date(c.created_time) : null
      };
      await db.metaCampaign.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
      count++;
    }
  }

  return count;
}

async function syncInsights(actId: string, creds: MetaCredentials): Promise<number> {
  const today = todayInEdmonton();
  const hasHistory = (await db.metaCampaignDay.count()) > 0;
  let since = addDays(today, -(hasHistory ? RESTATE_DAYS : BACKFILL_DAYS));
  let rows = 0;

  while (since <= today) {
    const until = [addDays(since, WINDOW_DAYS - 1), today].sort()[0];

    for await (const batch of metaGetPages<InsightRow>(`/${actId}/insights`, creds, {
      level: 'campaign',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,actions,action_values',
      limit: '500'
    })) {
      for (const r of batch) {
        // Archived/deleted campaigns don't come back from /campaigns but still have insights
        await db.metaCampaign.upsert({
          where: { id: r.campaign_id },
          create: { id: r.campaign_id, name: r.campaign_name },
          update: {}
        });

        const date = new Date(`${r.date_start}T00:00:00Z`);
        const data = {
          spendCents: dollarsToCents(r.spend),
          impressions: parseInt(r.impressions ?? '0'),
          clicks: parseInt(r.clicks ?? '0'),
          reach: parseInt(r.reach ?? '0'),
          metaPurchases: Math.round(pickPurchase(r.actions)),
          metaPurchaseValueCents: Math.round(pickPurchase(r.action_values) * 100)
        };

        await db.metaCampaignDay.upsert({
          where: { campaignId_date: { campaignId: r.campaign_id, date } },
          create: { campaignId: r.campaign_id, date, ...data },
          update: data
        });
        rows++;
      }
    }

    since = addDays(until, 1);
  }

  return rows;
}

export async function runMetaSync(): Promise<void> {
  const token = env.META_ACCESS_TOKEN;
  const adAccountId = env.META_AD_ACCOUNT_ID;
  if (!token || !adAccountId) return;

  const creds: MetaCredentials = { token, appSecret: env.META_SECRET };
  const actId = `act_${normalizeAdAccountId(adAccountId)}`;

  try {
    const campaigns = await syncCampaigns(actId, creds);
    const days = await syncInsights(actId, creds);

    await db.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', metaLastSyncedAt: new Date() },
      update: { metaLastSyncedAt: new Date(), metaLastSyncError: null }
    });
    console.log(`[meta] sync complete: ${campaigns} campaigns, ${days} campaign-days`);
  } catch (err) {
    const message = err instanceof MetaApiError ? `[${err.kind}] ${err.message}` : String(err);
    console.error('[meta] sync failed:', message);

    await db.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', metaLastSyncError: message },
      update: { metaLastSyncError: message }
    });
  }
}
