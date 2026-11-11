import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { chainSummary, startFresh } from '$lib/server/studio';
import { IMAGE_MODELS, sizeFor, type ImageModel } from '$lib/server/gemini';

// The pieces the page needs to build the fresh prompt (shown to the user before sending)
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');
  return json(await chainSummary(params.id));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const body = await request.json();
  if (!body.prompt?.trim()) error(400, 'Missing prompt');
  const model: ImageModel = body.model in IMAGE_MODELS ? body.model : 'fast';

  try {
    const image = await startFresh({
      imageId: params.id,
      prompt: String(body.prompt),
      includeLatest: Boolean(body.includeLatest),
      model,
      imageSize: sizeFor(model, body.imageSize)
    });
    return json(image);
  } catch (err) {
    error(502, (err as Error).message);
  }
};
