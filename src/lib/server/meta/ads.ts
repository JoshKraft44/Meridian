import { metaPost, type MetaCredentials } from './api';

// Marketing API writes for ad campaigns. Everything is created PAUSED at the campaign level;
// nothing spends until the campaign is switched on explicitly.
// Kept free of $env so bin/ scripts can use it.

export interface AdAccount {
  creds: MetaCredentials;
  actId: string; // act_123
  pageId: string;
  igUserId: string;
}

export interface Targeting {
  regions: string[]; // Meta region keys (533 = Ontario)
  ageMin: number;
  ageMax: number;
  interests: { id: string; name: string }[];
}

export async function createCampaign(account: AdAccount, name: string): Promise<string> {
  const res = await metaPost<{ id: string }>(`/${account.actId}/campaigns`, account.creds, {
    name,
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: '[]',
    // Budgets live on the ad sets, one per post per platform
    is_adset_budget_sharing_enabled: 'false'
  });
  return res.id;
}

// Ad images have to live in the ad account; Meta returns a hash to reference them by
export async function uploadAdImage(account: AdAccount, imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`couldn't fetch ${imageUrl} (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer()).toString('base64');

  const uploaded = await metaPost<{ images: Record<string, { hash: string }> }>(`/${account.actId}/adimages`, account.creds, {
    bytes
  });
  const first = Object.values(uploaded.images)[0];
  if (!first?.hash) throw new Error('adimages returned no hash');
  return first.hash;
}

function buildTargeting(platform: 'instagram' | 'facebook', t: Targeting) {
  return {
    geo_locations: { regions: t.regions.map((key) => ({ key })), location_types: ['home', 'recent'] },
    age_min: t.ageMin,
    age_max: t.ageMax,
    locales: [1001], // English (All)
    flexible_spec: [{ interests: t.interests }],
    publisher_platforms: [platform],
    ...(platform === 'instagram' ? { instagram_positions: ['stream'] } : { facebook_positions: ['feed'] }),
    // Stay inside the audience above instead of letting Meta widen it
    targeting_automation: { advantage_audience: 0 }
  };
}

export async function createAdSet(
  account: AdAccount,
  opts: {
    name: string;
    campaignId: string;
    platform: 'instagram' | 'facebook';
    lifetimeBudgetCents: number;
    start: Date;
    end: Date;
    targeting: Targeting;
  }
): Promise<string> {
  const targeting = buildTargeting(opts.platform, opts.targeting);

  const res = await metaPost<{ id: string }>(`/${account.actId}/adsets`, account.creds, {
    name: opts.name,
    campaign_id: opts.campaignId,
    lifetime_budget: String(opts.lifetimeBudgetCents),
    start_time: opts.start.toISOString(),
    end_time: opts.end.toISOString(),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LANDING_PAGE_VIEWS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    targeting: JSON.stringify(targeting),
    status: 'ACTIVE'
  });
  return res.id;
}

export async function createLinkCreative(
  account: AdAccount,
  opts: {
    name: string;
    platform: 'instagram' | 'facebook';
    message: string;
    link: string;
    headline: string;
    imageHashes: string[];
    urlTags: string;
  }
): Promise<string> {
  const cta = { type: 'SHOP_NOW', value: { link: opts.link } };

  const linkData =
    opts.imageHashes.length === 1
      ? { message: opts.message, link: opts.link, image_hash: opts.imageHashes[0], name: opts.headline, call_to_action: cta }
      : {
          message: opts.message,
          link: opts.link,
          child_attachments: opts.imageHashes.map((hash) => ({ link: opts.link, image_hash: hash, name: opts.headline, call_to_action: cta })),
          // Keep the photos in the order they were posted
          multi_share_optimized: false,
          multi_share_end_card: false
        };

  const objectStorySpec = {
    page_id: account.pageId,
    ...(opts.platform === 'instagram' ? { instagram_user_id: account.igUserId } : {}),
    link_data: linkData
  };

  const res = await metaPost<{ id: string }>(`/${account.actId}/adcreatives`, account.creds, {
    name: opts.name,
    object_story_spec: JSON.stringify(objectStorySpec),
    url_tags: opts.urlTags
  });
  return res.id;
}

export async function createAd(account: AdAccount, opts: { name: string; adSetId: string; creativeId: string }): Promise<string> {
  const res = await metaPost<{ id: string }>(`/${account.actId}/ads`, account.creds, {
    name: opts.name,
    adset_id: opts.adSetId,
    creative: JSON.stringify({ creative_id: opts.creativeId }),
    status: 'ACTIVE'
  });
  return res.id;
}

// Ad sets keep their budget and schedule; only who sees them changes
export async function updateAdSetTargeting(
  account: AdAccount,
  adSetId: string,
  platform: 'instagram' | 'facebook',
  targeting: Targeting
) {
  await metaPost(`/${adSetId}`, account.creds, { targeting: JSON.stringify(buildTargeting(platform, targeting)) });
}

export async function setCampaignStatus(account: AdAccount, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
  await metaPost(`/${campaignId}`, account.creds, { status });
}
