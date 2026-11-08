import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/db';
import { validatePost, type Format, type Platform } from '$lib/creatives';
import { edmontonLocalToDate } from '$lib/utils';
import { publishPost } from '$lib/server/meta/publish';

export const load: PageServerLoad = async () => {
  const [posts, creatives] = await Promise.all([
    db.socialPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { media: { orderBy: { position: 'asc' }, include: { creative: { select: { url: true, kind: true } } } } }
    }),
    db.creative.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, url: true, width: true, height: true, filename: true, tags: true }
    })
  ]);

  return {
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      format: p.format,
      caption: p.caption,
      status: p.status,
      scheduledFor: p.scheduledFor?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      permalink: p.permalink,
      error: p.error,
      media: p.media.map((m) => m.creative)
    })),
    creatives
  };
};

const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK'];
const FORMATS: Format[] = ['SINGLE', 'CAROUSEL', 'REEL'];

export const actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const platforms = form.getAll('platforms').map(String).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
    const format = String(form.get('format')) as Format;
    const caption = String(form.get('caption') ?? '').trim();
    const creativeIds = String(form.get('creativeIds') ?? '').split(',').filter(Boolean);
    const when = String(form.get('when'));

    if (platforms.length === 0) return fail(400, { error: 'Pick at least one platform' });
    if (!FORMATS.includes(format)) return fail(400, { error: 'Unknown format' });

    const found = await db.creative.findMany({ where: { id: { in: creativeIds } }, select: { id: true, kind: true } });
    const media = creativeIds.map((id) => found.find((c) => c.id === id)).filter((c) => c !== undefined);
    if (media.length !== creativeIds.length) return fail(400, { error: 'Some selected media no longer exists' });

    for (const platform of platforms) {
      const problem = validatePost({ platform, format, caption, media });
      if (problem) return fail(400, { error: `${platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}: ${problem}` });
    }

    let scheduledFor: Date | null = null;
    if (when === 'schedule') {
      const local = String(form.get('scheduledAt') ?? '');
      if (!local) return fail(400, { error: 'Pick a time to schedule for' });
      scheduledFor = edmontonLocalToDate(local);
      if (scheduledFor.getTime() < Date.now()) return fail(400, { error: 'That time has already passed' });
    } else if (when === 'now') {
      scheduledFor = new Date();
    }

    const created = await db.$transaction(
      platforms.map((platform) =>
        db.socialPost.create({
          data: {
            platform,
            format,
            caption,
            status: when === 'draft' ? 'DRAFT' : 'SCHEDULED',
            scheduledFor,
            media: { create: creativeIds.map((creativeId, position) => ({ creativeId, position })) }
          }
        })
      )
    );

    // Don't hold the request open; video processing can take minutes. The list polls for status.
    if (when === 'now') for (const p of created) void publishPost(p.id);

    return { created: created.length, when };
  },

  publishNow: async ({ request }) => {
    const id = String((await request.formData()).get('id'));
    const updated = await db.socialPost.updateMany({
      where: { id, status: { in: ['DRAFT', 'FAILED'] } },
      data: { status: 'SCHEDULED', scheduledFor: new Date(), error: null }
    });
    if (updated.count === 0) return fail(400, { error: 'Only drafts and failed posts can be published from here' });
    void publishPost(id);
    return { publishing: id };
  },

  unschedule: async ({ request }) => {
    const id = String((await request.formData()).get('id'));
    await db.socialPost.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'DRAFT', scheduledFor: null } });
  },

  delete: async ({ request }) => {
    const id = String((await request.formData()).get('id'));
    const deleted = await db.socialPost.deleteMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] } } });
    if (deleted.count === 0) return fail(400, { error: 'Published posts stay in the history' });
  }
} satisfies Actions;
