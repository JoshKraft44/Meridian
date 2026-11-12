import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { GENERATED_SELECT, guessCount, listPresets, loadProduct } from '$lib/server/studio';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const id = url.searchParams.get('id');
  if (!id) error(400, 'Missing product id');

  const product = await loadProduct(id);
  if (!product) error(404, 'Product not found');

  const [presets, generated] = await Promise.all([
    listPresets(),
    db.generatedImage.findMany({
      where: { productGid: product.id, status: { not: 'DISCARDED' } },
      orderBy: { createdAt: 'desc' },
      select: GENERATED_SELECT
    }),
    db.studioProductView.upsert({
      where: { productGid: product.id },
      create: { productGid: product.id },
      update: { viewedAt: new Date() }
    })
  ]);

  return json({ product, presets, generated, defaultCount: guessCount(product.title) });
};
