import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { addToProduct, saveToLibrary } from '$lib/server/studio';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { action, alt } = await request.json();
  try {
    if (action === 'add') await addToProduct(params.id, String(alt ?? ''));
    else if (action === 'library') await saveToLibrary(params.id);
    else if (action === 'discard') await db.generatedImage.update({ where: { id: params.id }, data: { status: 'DISCARDED' } });
    else error(400, 'Unknown action');
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    error(502, (err as Error).message);
  }

  const image = await db.generatedImage.findUniqueOrThrow({
    where: { id: params.id },
    select: { id: true, presetName: true, model: true, status: true, creativeId: true, createdAt: true }
  });
  return json(image);
};
