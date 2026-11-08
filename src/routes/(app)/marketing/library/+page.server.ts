import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/db';
import { appAdmin } from '$lib/server/shopify/appAdmin';
import { deleteFile } from '$lib/server/shopify/files';

export const load: PageServerLoad = async () => {
  const creatives = await db.creative.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { posts: true } } }
  });

  return {
    creatives: creatives.map((c) => ({
      id: c.id,
      kind: c.kind,
      url: c.url,
      filename: c.filename,
      width: c.width,
      height: c.height,
      tags: c.tags,
      notes: c.notes,
      postCount: c._count.posts
    }))
  };
};

function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export const actions = {
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id'));
    const notes = String(form.get('notes') ?? '').trim();

    await db.creative.update({
      where: { id },
      data: { notes: notes || null, tags: parseTags(form.get('tags')) }
    });
    return { saved: id };
  },

  delete: async ({ request }) => {
    const id = String((await request.formData()).get('id'));
    const creative = await db.creative.findUnique({ where: { id }, include: { _count: { select: { posts: true } } } });
    if (!creative) return fail(404, { error: 'Not found' });
    if (creative._count.posts > 0) return fail(400, { error: 'Used in a post, so it stays' });

    try {
      await deleteFile(appAdmin(), creative.shopifyFileId);
    } catch (err) {
      // Already gone from Shopify is fine; anything else should stop the delete
      if (!String((err as Error).message).toLowerCase().includes('not found')) {
        return fail(502, { error: (err as Error).message });
      }
    }
    await db.creative.delete({ where: { id } });
    return { deleted: id };
  }
} satisfies Actions;
