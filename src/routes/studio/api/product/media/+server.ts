import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { removeFromProduct, reorderProductMedia } from '$lib/server/studio';

// Changes to the photos already on a listing: take one off, or put them in a new order
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { productId, action, mediaId, order } = await request.json();
  if (!productId) error(400, 'Missing product id');

  try {
    if (action === 'remove' && typeof mediaId === 'string') await removeFromProduct(productId, mediaId);
    else if (action === 'reorder' && Array.isArray(order)) await reorderProductMedia(productId, order.map(String));
    else error(400, 'Unknown action');
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    error(502, (err as Error).message);
  }

  return json({ ok: true });
};
