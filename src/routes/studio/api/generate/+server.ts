import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { generateScene, type AntlerCount } from '$lib/server/studio';
import { IMAGE_MODELS, sizeFor, type ImageModel } from '$lib/server/gemini';

const COUNTS: AntlerCount[] = ['one', 'pair', 'set'];
const RATIOS = ['4:5', '1:1', '3:4'];

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const body = await request.json();
  if (!body.productId || !Array.isArray(body.sourceMediaIds) || !body.prompt?.trim()) error(400, 'Missing details');

  const model: ImageModel = body.model in IMAGE_MODELS ? body.model : 'fast';

  try {
    const image = await generateScene({
      productId: body.productId,
      sourceMediaIds: body.sourceMediaIds,
      presetName: String(body.presetName ?? 'Custom'),
      prompt: String(body.prompt),
      count: COUNTS.includes(body.count) ? body.count : 'one',
      model,
      imageSize: sizeFor(model, body.imageSize),
      aspectRatio: RATIOS.includes(body.aspectRatio) ? body.aspectRatio : '4:5'
    });
    return json(image);
  } catch (err) {
    error(502, (err as Error).message);
  }
};
