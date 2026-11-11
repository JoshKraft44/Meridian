import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { amendScene } from '$lib/server/studio';
import { IMAGE_MODELS, sizeFor, type ImageModel } from '$lib/server/gemini';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const body = await request.json();
  if (!body.instruction?.trim()) error(400, 'Describe the change you want');
  const model: ImageModel = body.model in IMAGE_MODELS ? body.model : 'fast';

  try {
    const image = await amendScene({
      imageId: params.id,
      instruction: String(body.instruction),
      model,
      imageSize: sizeFor(model, body.imageSize)
    });
    return json(image);
  } catch (err) {
    error(502, (err as Error).message);
  }
};
