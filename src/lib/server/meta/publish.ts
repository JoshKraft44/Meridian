import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { metaGet, metaPost, MetaApiError, type MetaCredentials } from './api';
import type { Creative, SocialPost } from '@prisma/client';

type PostWithMedia = SocialPost & { media: { position: number; creative: Creative }[] };

interface Accounts {
  pageId: string;
  pageToken: string;
  igUserId: string | null;
}

let cachedAccounts: { value: Accounts; at: number } | null = null;

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 20 * 60_000;

function systemCreds(): MetaCredentials {
  if (!env.META_ACCESS_TOKEN) throw new Error('META_ACCESS_TOKEN not set');
  return { token: env.META_ACCESS_TOKEN, appSecret: env.META_SECRET };
}

// Page publishing needs the Page's own token, which /me/accounts hands out to the system user.
async function getAccounts(): Promise<Accounts> {
  if (cachedAccounts && Date.now() - cachedAccounts.at < 60 * 60_000) return cachedAccounts.value;

  const res = await metaGet<{
    data: { id: string; access_token: string; instagram_business_account?: { id: string } }[];
  }>('/me/accounts', systemCreds(), { fields: 'id,access_token,instagram_business_account' });

  const page = res.data[0];
  if (!page) throw new Error('No Facebook Page visible to the token');

  const value = { pageId: page.id, pageToken: page.access_token, igUserId: page.instagram_business_account?.id ?? null };
  cachedAccounts = { value, at: Date.now() };
  return value;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// IG builds a container from the media URL first; video processing can take a few minutes.
async function waitForContainer(id: string, creds: MetaCredentials, isVideo: boolean) {
  const deadline = Date.now() + (isVideo ? 10 * 60_000 : 2 * 60_000);

  while (Date.now() < deadline) {
    const c = await metaGet<{ status_code: string; status?: string }>(`/${id}`, creds, { fields: 'status_code,status' });
    if (c.status_code === 'FINISHED') return;
    if (c.status_code === 'ERROR' || c.status_code === 'EXPIRED') {
      throw new Error(`Instagram couldn't process the media: ${c.status ?? c.status_code}`);
    }
    await sleep(isVideo ? 5000 : 2000);
  }
  throw new Error('Timed out waiting for Instagram to process the media');
}

// Instagram fetches photos from Meridian's own /media route rather than Shopify's CDN.
function igImageUrl(c: Creative): string {
  return `${env.PUBLIC_APP_URL}/media/${c.id}.jpg`;
}

// The CDN builds resized/cropped variants on first request, which can be slow enough for
// Instagram's fetcher to give up. Requesting them first means Instagram gets a cached copy.
async function warmImages(urls: string[]) {
  await Promise.all(urls.map((url) => fetch(url).then((r) => r.arrayBuffer()).catch(() => null)));
}

async function publishInstagram(post: PostWithMedia, igUserId: string) {
  const creds = systemCreds();
  const media = post.media.map((m) => m.creative);
  await warmImages(media.filter((c) => c.kind === 'IMAGE').map(igImageUrl));
  let containerId: string;

  if (post.format === 'SINGLE') {
    ({ id: containerId } = await metaPost<{ id: string }>(`/${igUserId}/media`, creds, {
      image_url: igImageUrl(media[0]),
      caption: post.caption
    }));
    await waitForContainer(containerId, creds, false);
  } else if (post.format === 'CAROUSEL') {
    const children: string[] = [];
    for (const c of media) {
      const child = await metaPost<{ id: string }>(`/${igUserId}/media`, creds, {
        image_url: igImageUrl(c),
        is_carousel_item: 'true'
      });
      await waitForContainer(child.id, creds, false);
      children.push(child.id);
    }
    ({ id: containerId } = await metaPost<{ id: string }>(`/${igUserId}/media`, creds, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: post.caption
    }));
    await waitForContainer(containerId, creds, false);
  } else {
    ({ id: containerId } = await metaPost<{ id: string }>(`/${igUserId}/media`, creds, {
      media_type: 'REELS',
      video_url: media[0].url,
      caption: post.caption,
      share_to_feed: 'true'
    }));
    await waitForContainer(containerId, creds, true);
  }

  const published = await metaPost<{ id: string }>(`/${igUserId}/media_publish`, creds, { creation_id: containerId });
  // It's live at this point, so a failed lookup mustn't count as a failed post (a retry would double-post)
  const permalink = await metaGet<{ permalink?: string }>(`/${published.id}`, creds, { fields: 'permalink' })
    .then((r) => r.permalink ?? null)
    .catch(() => null);
  return { externalId: published.id, permalink };
}

async function publishFacebook(post: PostWithMedia, pageId: string, pageToken: string) {
  const creds: MetaCredentials = { token: pageToken, appSecret: env.META_SECRET };
  const media = post.media.map((m) => m.creative);
  let postId: string;

  if (post.format === 'SINGLE') {
    const res = await metaPost<{ id: string; post_id?: string }>(`/${pageId}/photos`, creds, {
      url: media[0].url,
      message: post.caption
    });
    postId = res.post_id ?? res.id;
  } else if (post.format === 'CAROUSEL') {
    // Upload each photo unpublished, then attach them all to one feed post
    const photoIds: string[] = [];
    for (const c of media) {
      const photo = await metaPost<{ id: string }>(`/${pageId}/photos`, creds, { url: c.url, published: 'false' });
      photoIds.push(photo.id);
    }
    ({ id: postId } = await metaPost<{ id: string }>(`/${pageId}/feed`, creds, {
      message: post.caption,
      attached_media: JSON.stringify(photoIds.map((id) => ({ media_fbid: id })))
    }));
  } else {
    ({ id: postId } = await metaPost<{ id: string }>(`/${pageId}/videos`, creds, {
      file_url: media[0].url,
      description: post.caption
    }));
  }

  const permalinkUrl = await metaGet<{ permalink_url?: string }>(`/${postId}`, creds, { fields: 'permalink_url' })
    .then((r) => r.permalink_url ?? null)
    .catch(() => null);
  const permalink = permalinkUrl?.startsWith('/') ? `https://www.facebook.com${permalinkUrl}` : permalinkUrl;
  return { externalId: postId, permalink };
}

// Claims the post first so the scheduler and a "publish now" click can't both send it.
export async function publishPost(postId: string): Promise<void> {
  const claimed = await db.socialPost.updateMany({
    where: { id: postId, status: 'SCHEDULED' },
    data: { status: 'PUBLISHING', error: null }
  });
  if (claimed.count === 0) return;

  const post = await db.socialPost.findUniqueOrThrow({
    where: { id: postId },
    include: { media: { orderBy: { position: 'asc' }, include: { creative: true } } }
  });

  try {
    const accounts = await getAccounts();
    let result: { externalId: string; permalink: string | null };

    if (post.platform === 'INSTAGRAM') {
      if (!accounts.igUserId) throw new Error('No Instagram account linked to the Facebook Page');
      result = await publishInstagram(post, accounts.igUserId);
    } else {
      result = await publishFacebook(post, accounts.pageId, accounts.pageToken);
    }

    await db.socialPost.update({
      where: { id: postId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), ...result }
    });
    console.log(`[publish] ${post.platform} ${post.format} ${postId} published`);
  } catch (err) {
    const message = err instanceof MetaApiError ? `[${err.kind}] ${err.message}` : (err as Error).message;
    const attempts = post.attempts + 1;
    // Meta sometimes blocks API access for a while (e.g. after a security check). A bad token won't fix itself.
    const retry = attempts < MAX_ATTEMPTS && !(err instanceof MetaApiError && err.kind === 'auth');

    await db.socialPost.update({
      where: { id: postId },
      data: retry
        ? { status: 'SCHEDULED', scheduledFor: new Date(Date.now() + RETRY_DELAY_MS), attempts, error: `Retrying: ${message}` }
        : { status: 'FAILED', attempts, error: message }
    });
    console.error(`[publish] ${postId} attempt ${attempts} failed${retry ? ', retrying in 20m' : ''}:`, message);
  }
}

export async function publishDuePosts(): Promise<void> {
  if (!env.META_ACCESS_TOKEN) return;

  const due = await db.socialPost.findMany({
    where: { status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    select: { id: true },
    take: 10
  });

  for (const { id } of due) await publishPost(id);
}
