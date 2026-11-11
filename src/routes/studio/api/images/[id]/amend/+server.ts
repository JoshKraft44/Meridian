import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { amendScene } from '$lib/server/studio';
import { IMAGE_MODELS, type ImageModel } from '$lib/server/gemini';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { instruction, model } = await request.json();
  if (!instruction?.trim()) error(400, 'Describe the change you want');

  try {
    const image = await amendScene({
      imageId: params.id,
      instruction: String(instruction),
      model: model in IMAGE_MODELS ? (model as ImageModel) : 'fast'
    });
    return json(image);
  } catch (err) {
    error(502, (err as Error).message);
  }
};
