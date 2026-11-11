// Gemini image editing: reference photo(s) + prompt in, one new image out.

export const IMAGE_MODELS = {
  fast: 'gemini-3.1-flash-image', // Nano Banana 2, ~8s
  best: 'gemini-3-pro-image' // Nano Banana Pro, ~15s
} as const;

export type ImageModel = keyof typeof IMAGE_MODELS;

// Output resolution. 1K is ~930x1150 at 4:5, 2K ~1860x2300; only Pro does 4K.
export type ImageSize = '1K' | '2K' | '4K';

export function sizeFor(model: ImageModel, requested: unknown): ImageSize {
  if (requested === '4K') return model === 'best' ? '4K' : '2K';
  return requested === '2K' ? '2K' : '1K';
}

export interface InputImage {
  bytes: Buffer;
  mimeType: string;
}

export class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function generateImage(opts: {
  apiKey: string;
  model: ImageModel;
  prompt: string;
  images: InputImage[];
  aspectRatio: string;
  imageSize: ImageSize;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  const parts = [
    ...opts.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.bytes.toString('base64') } })),
    { text: opts.prompt }
  ];

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODELS[opts.model]}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': opts.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: opts.aspectRatio, imageSize: opts.imageSize } }
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      res.status === 429 ? 'Out of Gemini credits or rate limited. Top up at aistudio.google.com.' : body.error?.message ?? `Gemini ${res.status}`;
    throw new GeminiError(message, res.status);
  }

  const out = body.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData || p.inline_data);
  if (!out) {
    // Usually a safety block or the model answering with text instead of an image
    const reason = body.candidates?.[0]?.finishReason ?? body.promptFeedback?.blockReason ?? 'no image returned';
    throw new GeminiError(`Gemini didn't return an image (${reason})`, 502);
  }

  const data = out.inlineData ?? out.inline_data;
  return { bytes: Buffer.from(data.data, 'base64'), mimeType: data.mimeType ?? data.mime_type ?? 'image/png' };
}
