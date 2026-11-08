import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { appAdmin } from '$lib/server/shopify/appAdmin';
import { createFileAndWait } from '$lib/server/shopify/files';

// Called after the browser finished uploading to the staged target
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { resourceUrl, filename, kind, sizeBytes, tags } = await request.json();
  if (!resourceUrl || !filename || (kind !== 'IMAGE' && kind !== 'VIDEO')) error(400, 'Bad upload details');

  try {
    const uploaded = await createFileAndWait(appAdmin(), resourceUrl, kind, filename.replace(/\.[^.]+$/, ''));
    const creative = await db.creative.create({
      data: {
        kind,
        url: uploaded.url,
        shopifyFileId: uploaded.fileId,
        filename,
        sizeBytes: sizeBytes ?? null,
        width: uploaded.width,
        height: uploaded.height,
        tags: Array.isArray(tags) ? tags : []
      }
    });
    return json({ id: creative.id });
  } catch (err) {
    error(502, (err as Error).message);
  }
};
