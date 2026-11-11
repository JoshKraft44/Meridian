import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/db';

// Plain <img> tags can't send the App Bridge token, so generated images are served by their
// unguessable id, the same way /media works for Instagram
export const GET: RequestHandler = async ({ params }) => {
  const image = await db.generatedImage.findUnique({ where: { id: params.id }, select: { bytes: true, mimeType: true } });
  if (!image) error(404, 'Not found');

  return new Response(new Uint8Array(image.bytes), {
    headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=86400' }
  });
};
