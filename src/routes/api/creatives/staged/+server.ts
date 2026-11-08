import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { appAdmin } from '$lib/server/shopify/appAdmin';
import { createStagedUpload } from '$lib/server/shopify/files';

// Browser uploads straight to Shopify's storage with this target, so big files never pass through the app
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { filename, mimeType, sizeBytes } = await request.json();
  if (!filename || !mimeType || !sizeBytes) error(400, 'filename, mimeType and sizeBytes required');

  const kind = mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
  if (kind === 'IMAGE' && mimeType !== 'image/jpeg') error(400, 'Images must be converted to JPEG before upload');

  const target = await createStagedUpload(appAdmin(), { filename, mimeType, sizeBytes, kind });
  return json({ target, kind });
};
