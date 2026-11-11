import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';

// Saved presets can be removed; the built-in ones stay
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const updated = await db.scenePreset.updateMany({
    where: { id: params.id, builtIn: false },
    data: { archivedAt: new Date() }
  });
  if (updated.count === 0) error(400, "Built-in presets can't be removed");
  return json({ ok: true });
};
