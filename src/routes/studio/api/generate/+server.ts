import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { editPrompt, generateScene, type AntlerCount } from '$lib/server/studio';
import { IMAGE_MODELS, sizeFor, type ImageModel } from '$lib/server/gemini';

const COUNTS: AntlerCount[] = ['one', 'pair', 'set'];
const RATIOS = ['4:5', '1:1', '3:4'];

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const body = await request.json();
  if (!body.productId || !Array.isArray(body.sourceMediaIds)) error(400, 'Missing details');

  // Amend mode sends just the change; the edit rules are added here
  const editing = typeof body.instruction === 'string';
  const prompt = editing ? (body.instruction.trim() ? editPrompt(body.instruction) : '') : String(body.prompt ?? '').trim();
  if (!prompt) error(400, editing ? 'Describe the change you want' : 'Missing prompt');

  const model: ImageModel = body.model in IMAGE_MODELS ? body.model : 'fast';

  try {
    const image = await generateScene({
      productId: body.productId,
      sourceMediaIds: body.sourceMediaIds,
      presetName: editing ? 'Photo edit' : String(body.presetName ?? 'Custom'),
      prompt,
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
