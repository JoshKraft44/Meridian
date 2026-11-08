import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/db';
import { validatePost, type Format, type Platform } from '$lib/creatives';
import { edmontonLocalToDate } from '$lib/utils';
import { publishPost } from '$lib/server/meta/publish';

const mediaInclude = {
  media: { orderBy: { position: 'asc' as const }, include: { creative: { select: { url: true, kind: true, width: true, height: true } } } }
};

// Claude's drafts, grouped so the IG + FB versions of one idea are reviewed together
async function loadSuggestions() {
  const drafts = await db.socialPost.findMany({
    where: { status: 'DRAFT', suggestedBy: { not: null } },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    include: mediaInclude
  });

  const groups = new Map<string, (typeof drafts)[number][]>();
  for (const d of drafts) {
    const key = d.groupId ?? d.id;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  return [...groups.entries()].map(([groupId, rows]) => ({
    groupId,
    platforms: rows.map((r) => r.platform),
    format: rows[0].format,
    caption: rows[0].caption,
    rationale: rows[0].rationale,
    feedback: rows[0].feedback,
    suggestedFor: rows[0].scheduledFor?.toISOString() ?? null,
    media: rows[0].media.map((m) => m.creative)
  }));
}

export const load: PageServerLoad = async () => {
  const [posts, creatives, suggestions] = await Promise.all([
    db.socialPost.findMany({
      where: { NOT: { status: 'DRAFT', suggestedBy: { not: null } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { media: { orderBy: { position: 'asc' }, include: { creative: { select: { url: true, kind: true } } } } }
    }),
    db.creative.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, url: true, width: true, height: true, filename: true, tags: true }
    }),
    loadSuggestions()
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
    creatives,
    suggestions
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

    const groupId = crypto.randomUUID();
    const created = await db.$transaction(
      platforms.map((platform) =>
        db.socialPost.create({
          data: {
            groupId,
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

  approveSuggestion: async ({ request }) => {
    const form = await request.formData();
    const groupId = String(form.get('groupId'));
    const caption = String(form.get('caption') ?? '').trim();
    const local = String(form.get('scheduledAt') ?? '');

    const rows = await db.socialPost.findMany({
      where: { groupId, status: 'DRAFT' },
      include: { media: { include: { creative: { select: { kind: true } } } } }
    });
    if (rows.length === 0) return fail(404, { error: 'Suggestion not found' });

    for (const r of rows) {
      const problem = validatePost({ platform: r.platform, format: r.format, caption, media: r.media.map((m) => m.creative) });
      if (problem) return fail(400, { error: problem, groupId });
    }

    if (!local) return fail(400, { error: 'Pick a time', groupId });
    const scheduledFor = edmontonLocalToDate(local);
    if (scheduledFor.getTime() < Date.now()) return fail(400, { error: 'That time has already passed', groupId });

    await db.socialPost.updateMany({
      where: { groupId, status: 'DRAFT' },
      data: { caption, scheduledFor, status: 'SCHEDULED' }
    });
    return { approved: groupId };
  },

  suggestionFeedback: async ({ request }) => {
    const form = await request.formData();
    const groupId = String(form.get('groupId'));
    const feedback = String(form.get('feedback') ?? '').trim();
    await db.socialPost.updateMany({ where: { groupId, status: 'DRAFT' }, data: { feedback: feedback || null } });
    return { feedbackSaved: groupId };
  },

  dismissSuggestion: async ({ request }) => {
    const groupId = String((await request.formData()).get('groupId'));
    await db.socialPost.deleteMany({ where: { groupId, status: 'DRAFT' } });
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
