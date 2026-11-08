// Runs scheduled/published posts as Meta ads. Creates one campaign (PAUSED) with an
// Instagram and a Facebook ad set per post, starting when the post goes live.
//   npm run ads:boost -- create plan.json     build everything paused, print what was made
//   npm run ads:boost -- activate <campaignId> start spending
//
// plan.json: { campaignId?, campaignName, link, regions, ageMin, ageMax,
//              audiences: { name: [{ id, name }] },
//              posts: [{ groupId, slug, audiences: [names], instagram: { budgetCents, days }, facebook: { budgetCents, days } }] }

import { readFile } from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { metaGet } from '../src/lib/server/meta/api.ts';
import { createCampaign, uploadAdImage, createAdSet, createLinkCreative, createAd, setCampaignStatus, type AdAccount } from '../src/lib/server/meta/ads.ts';
import { igSafeUrl } from '../src/lib/creatives.ts';
import { formatDateTime } from '../src/lib/utils.ts';

interface Plan {
  campaignId?: string; // reuse an existing (paused) campaign instead of making a new one
  campaignName: string;
  link: string;
  regions: string[];
  ageMin: number;
  ageMax: number;
  audiences: Record<string, { id: string; name: string }[]>;
  posts: {
    groupId: string;
    slug: string;
    audiences: string[];
    instagram: { budgetCents: number; days: number };
    facebook: { budgetCents: number; days: number };
  }[];
}

const db = new PrismaClient();

async function loadAccount(): Promise<AdAccount> {
  const creds = { token: process.env.META_ACCESS_TOKEN ?? '', appSecret: process.env.META_SECRET };
  const pages = await metaGet<{ data: { id: string; instagram_business_account?: { id: string } }[] }>('/me/accounts', creds, {
    fields: 'id,instagram_business_account'
  });
  const page = pages.data[0];
  if (!page?.instagram_business_account) throw new Error('No Page with a linked Instagram account');
  return {
    creds,
    actId: `act_${(process.env.META_AD_ACCOUNT_ID ?? '').replace(/^act_/, '')}`,
    pageId: page.id,
    igUserId: page.instagram_business_account.id
  };
}

// Hashtags help organic reach but just look noisy in an ad
function adCopy(caption: string): string {
  return caption
    .split('\n')
    .filter((line) => !/^\s*(#\w+\s*)+$/.test(line))
    .join('\n')
    .replace(/(\s#\w+)+\s*$/, '')
    .trim();
}

async function create(file: string) {
  const plan: Plan = JSON.parse(await readFile(file, 'utf8'));
  const account = await loadAccount();
  const imageHashes = new Map<string, string>();

  const campaignId = plan.campaignId ?? (await createCampaign(account, plan.campaignName));
  console.log(`campaign ${campaignId} (PAUSED) ${plan.campaignName}`);

  for (const p of plan.posts) {
    const post = await db.socialPost.findFirst({
      where: { groupId: p.groupId, status: { in: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] } },
      include: { media: { orderBy: { position: 'asc' }, include: { creative: true } } }
    });
    if (!post) throw new Error(`no scheduled/published post for ${p.groupId}`);
    if (post.media.some((m) => m.creative.kind !== 'IMAGE')) throw new Error(`${p.slug}: video ads not supported yet`);

    const hashes: string[] = [];
    for (const m of post.media) {
      const url = igSafeUrl(m.creative);
      if (!imageHashes.has(url)) imageHashes.set(url, await uploadAdImage(account, url));
      hashes.push(imageHashes.get(url)!);
    }

    const interests = p.audiences.flatMap((a) => plan.audiences[a] ?? []);
    const uniqueInterests = [...new Map(interests.map((i) => [i.id, i])).values()];
    const goLive = new Date(Math.max(post.scheduledFor?.getTime() ?? 0, Date.now() + 10 * 60_000));

    for (const platform of ['instagram', 'facebook'] as const) {
      const budget = p[platform];
      const end = new Date(goLive.getTime() + budget.days * 24 * 60 * 60_000);
      const label = `${p.slug} · ${platform === 'instagram' ? 'IG' : 'FB'}`;

      const adSetId = await createAdSet(account, {
        name: label,
        campaignId,
        platform,
        lifetimeBudgetCents: budget.budgetCents,
        start: goLive,
        end,
        targeting: { regions: plan.regions, ageMin: plan.ageMin, ageMax: plan.ageMax, interests: uniqueInterests }
      });
      const creativeId = await createLinkCreative(account, {
        name: label,
        platform,
        message: adCopy(post.caption),
        link: plan.link,
        headline: 'Antler Addiction',
        imageHashes: hashes,
        urlTags: `utm_source=${platform}&utm_medium=paid_social&utm_campaign=launch_nov26&utm_content=${p.slug}`
      });
      const adId = await createAd(account, { name: label, adSetId, creativeId });

      console.log(
        `  ${label.padEnd(26)} $${(budget.budgetCents / 100).toFixed(2)} ${formatDateTime(goLive)} → ${formatDateTime(end)}  adset ${adSetId} ad ${adId}`
      );
    }
  }

  console.log(`\nNothing is spending yet. Start with: npm run ads:boost -- activate ${campaignId}`);
}

async function activate(campaignId: string) {
  const account = await loadAccount();
  await setCampaignStatus(account, campaignId, 'ACTIVE');
  const c = await metaGet<{ name: string; status: string; effective_status: string }>(`/${campaignId}`, account.creds, {
    fields: 'name,status,effective_status'
  });
  console.log(`${c.name}: ${c.status} (${c.effective_status})`);
}

const [cmd, arg] = process.argv.slice(2);
const run =
  cmd === 'create' && arg ? create(arg)
  : cmd === 'activate' && arg ? activate(arg)
  : Promise.reject(new Error('usage: ads:boost create <plan.json> | activate <campaignId>'));

run
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
