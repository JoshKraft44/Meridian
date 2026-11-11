import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { appAdmin } from './shopify/appAdmin';
import { createStagedUpload, uploadToStagedTarget, createFileAndWait } from './shopify/files';
import { generateImage, type ImageModel, type ImageSize } from './gemini';

export type AntlerCount = 'one' | 'pair' | 'set';

// What the studio page needs to know about a generated image (never the bytes)
export const GENERATED_SELECT = {
  id: true,
  presetName: true,
  model: true,
  imageSize: true,
  status: true,
  creativeId: true,
  parentId: true,
  instruction: true,
  createdAt: true
} as const;

// The rules every scene shares. In the first test the model reshaped antlers it had to
// re-pose (stood one upright on a shelf) and added/dropped antlers from pairs, so the
// pose is locked and the count is spelled out.
const FIDELITY = `Use the reference photo as the only source for the antler. Reproduce {antlers} exactly as photographed: the same silhouette, the same number, length and curvature of every tine, the same burr at the base, and the same colour, texture, cracks, chips and staining.

Keep the antler in the same orientation and resting pose as in the photo, lying on the new surface the same way. Do not stand it up, rotate it, flip it or show it from a different side. Do not add, remove, duplicate, mirror or reshape any antler or tine. Keep a realistic real-world scale.`;

const FINISH = `Photorealistic lifestyle product photo. Natural light that matches the scene, physically correct contact shadows where the antler touches the surface, gentle depth of field. No people, no hands, no text, no logos, no watermarks. The antler is the clear subject of the frame.`;

function scene(text: string) {
  return `Create a new photograph of the antler from the reference photo ${text}\n\n${FIDELITY}\n\n${FINISH}`;
}

const BUILT_IN = [
  {
    name: 'Farmhouse kitchen table',
    description: 'Warm wood table, morning window light, linen and a mug behind',
    prompt: scene('resting on a rustic wooden farmhouse kitchen table. Soft morning light from a window to one side, a folded linen napkin and a ceramic mug softly out of focus in the background.')
  },
  {
    name: 'Cabin coffee table',
    description: 'Log walls, leather chair and wool throw, cozy lamp light',
    prompt: scene('resting on a weathered log cabin coffee table. Knotty pine log walls behind, a leather armchair with a wool throw softly out of focus, warm lamp light.')
  },
  {
    name: 'Christmas tablescape',
    description: 'Evergreen garland, pinecones and warm string lights',
    prompt: scene('as the centrepiece of a holiday table: lying on a dark wood table among fresh evergreen garland and pinecones, with warm string lights softly blurred behind. Festive but understated.')
  },
  {
    name: 'Snowy window & books',
    description: 'Coffee table by a snowy window, a stack of hardcover books',
    prompt: scene('resting on a stack of two or three hardcover books on a coffee table, with a large window behind showing snow-covered evergreens. Bright, soft winter daylight, calm modern-rustic living room.')
  },
  {
    name: 'Stone mantel',
    description: 'Lying on a stone fireplace mantel, candle and warm evening light',
    prompt: scene('lying flat on a natural stone fireplace mantel in a cozy living room. A lit candle softly out of focus nearby, warm evening light.')
  },
  {
    name: 'Clean studio',
    description: 'Seamless off-white backdrop, soft shadow, for listings',
    prompt: scene('on a seamless warm off-white studio backdrop, lit with large soft lights from above and the side, a soft natural shadow under it. Simple, clean e-commerce product shot with nothing else in frame.')
  }
];

export async function listPresets() {
  const count = await db.scenePreset.count({ where: { builtIn: true } });
  if (count === 0) await db.scenePreset.createMany({ data: BUILT_IN.map((p) => ({ ...p, builtIn: true })) });

  return db.scenePreset.findMany({
    where: { archivedAt: null },
    orderBy: [{ builtIn: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, description: true, prompt: true, builtIn: true, createdAt: true }
  });
}

const COUNT_PHRASES: Record<AntlerCount, string> = {
  one: 'the single antler (exactly one antler, no more)',
  pair: 'both antlers of the matching pair (exactly two antlers, no more and no fewer)',
  set: 'every antler in the set (the same number of antlers as the photo, no more and no fewer)'
};

export function guessCount(title: string): AntlerCount {
  if (/\b(\d+)[- ]?(pack|pc|pcs|pieces)\b|\bset of\b|\bbundle\b/i.test(title)) return 'set';
  if (/\bpair\b|\bmatching\b|\bset\b/i.test(title)) return 'pair';
  return 'one';
}

export function buildPrompt(prompt: string, count: AntlerCount, extraReferences: number) {
  let text = prompt.replaceAll('{antlers}', COUNT_PHRASES[count]);
  if (extraReferences > 0) {
    text += `\n\nThe first image is the main reference. The other ${extraReferences === 1 ? 'image shows' : `${extraReferences} images show`} the same antler from other angles; use them only to get its shape and texture right.`;
  }
  return text;
}

export interface StudioMedia {
  id: string;
  alt: string | null;
  url: string;
  width: number;
  height: number;
}

export function toProductGid(id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/Product/${id.replace(/\D/g, '')}`;
}

export async function loadProduct(productId: string) {
  const res = await appAdmin()(
    `query StudioProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        media(first: 50) {
          nodes {
            id
            alt
            mediaContentType
            ... on MediaImage { image { url width height } }
          }
        }
      }
    }`,
    { id: toProductGid(productId) }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const product = res.data?.product;
  if (!product) return null;

  const media: StudioMedia[] = product.media.nodes
    .filter((m: any) => m.mediaContentType === 'IMAGE' && m.image)
    .map((m: any) => ({ id: m.id, alt: m.alt, url: m.image.url, width: m.image.width, height: m.image.height }));

  return { id: product.id as string, title: product.title as string, handle: product.handle as string, media };
}

async function fetchReference(url: string) {
  const sized = `${url}${url.includes('?') ? '&' : '?'}width=1536&format=pjpg`;
  const res = await fetch(sized, { headers: { Accept: 'image/jpeg' } });
  if (!res.ok) throw new Error(`couldn't load product photo (${res.status})`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: 'image/jpeg' };
}

export async function generateScene(opts: {
  productId: string;
  sourceMediaIds: string[];
  presetName: string;
  prompt: string;
  count: AntlerCount;
  model: ImageModel;
  imageSize: ImageSize;
  aspectRatio: string;
}) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const product = await loadProduct(opts.productId);
  if (!product) throw new Error('Product not found');

  // Main photo first, then up to two other angles as extra references
  const sources = opts.sourceMediaIds
    .map((id) => product.media.find((m) => m.id === id))
    .filter((m) => m !== undefined)
    .slice(0, 3);
  if (sources.length === 0) throw new Error('Pick a photo to generate from');

  const prompt = buildPrompt(opts.prompt, opts.count, sources.length - 1);
  const images = await Promise.all(sources.map((m) => fetchReference(m.url)));
  const out = await generateImage({
    apiKey: env.GEMINI_API_KEY,
    model: opts.model,
    prompt,
    images,
    aspectRatio: opts.aspectRatio,
    imageSize: opts.imageSize
  });

  return db.generatedImage.create({
    data: {
      productGid: product.id,
      sourceMediaIds: sources.map((m) => m.id),
      presetName: opts.presetName,
      prompt,
      model: opts.model,
      imageSize: opts.imageSize,
      aspectRatio: opts.aspectRatio,
      bytes: out.bytes,
      mimeType: out.mimeType
    },
    select: GENERATED_SELECT
  });
}

// Every amendment made on the way to this image, oldest first
async function changesSoFar(image: { instruction: string | null; parentId: string | null }) {
  const changes: string[] = [];
  let cursor = image;
  while (cursor.instruction) {
    changes.unshift(cursor.instruction);
    if (!cursor.parentId) break;
    const prev = await db.generatedImage.findUnique({ where: { id: cursor.parentId }, select: { instruction: true, parentId: true } });
    if (!prev) break;
    cursor = prev;
  }
  return changes;
}

// What "start fresh" builds its prompt from: the scene prompt this image came from and the corrections since
export async function chainSummary(imageId: string) {
  const image = await db.generatedImage.findUniqueOrThrow({
    where: { id: imageId },
    select: { prompt: true, instruction: true, parentId: true }
  });
  return { basePrompt: image.prompt, changes: await changesSoFar(image) };
}

// Edits an earlier generated image. The model gets that image, the original reference photos,
// the original scene prompt and every change asked for so far, so nothing drifts from the real antler.
export async function amendScene(opts: { imageId: string; instruction: string; model: ImageModel; imageSize: ImageSize }) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const parent = await db.generatedImage.findUniqueOrThrow({ where: { id: opts.imageId } });
  const history = await changesSoFar(parent);

  const product = await loadProduct(parent.productGid);
  if (!product) throw new Error('Product not found');
  const references = parent.sourceMediaIds
    .map((id) => product.media.find((m) => m.id === id))
    .filter((m) => m !== undefined);

  const earlier = history.length
    ? `\n\nChanges already made to it, in order:\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  const prompt = `The first image is a photo you created from the original instructions below.${earlier}

Now edit that photo with this change: ${opts.instruction.trim()}

Keep everything else about the photo the same: composition, framing, lighting and props, unless the change says otherwise.

${references.length ? `The ${references.length === 1 ? 'next image is the original reference photo' : `next ${references.length} images are the original reference photos`} of the real antler. The antler in the edited photo must still match ${references.length === 1 ? 'it' : 'them'} exactly; the change must never alter the antler's shape, tines, colour or markings unless it explicitly asks to.\n\n` : ''}Original instructions (still apply unless the change says otherwise):
${parent.prompt}`;

  const images = [
    { bytes: Buffer.from(parent.bytes), mimeType: parent.mimeType },
    ...(await Promise.all(references.map((m) => fetchReference(m.url))))
  ];
  const out = await generateImage({
    apiKey: env.GEMINI_API_KEY,
    model: opts.model,
    prompt,
    images,
    aspectRatio: parent.aspectRatio,
    imageSize: opts.imageSize
  });

  return db.generatedImage.create({
    data: {
      productGid: parent.productGid,
      sourceMediaIds: parent.sourceMediaIds,
      presetName: parent.presetName,
      prompt: parent.prompt,
      model: opts.model,
      imageSize: opts.imageSize,
      aspectRatio: parent.aspectRatio,
      bytes: out.bytes,
      mimeType: out.mimeType,
      parentId: parent.id,
      instruction: opts.instruction.trim()
    },
    select: GENERATED_SELECT
  });
}

// When amending has gone as far as it can, start over from the real photos with everything learned
// built into the prompt. The last attempt can ride along as a loose reference, but it's never edited.
export async function startFresh(opts: {
  imageId: string;
  prompt: string;
  includeLatest: boolean;
  model: ImageModel;
  imageSize: ImageSize;
}) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const latest = await db.generatedImage.findUniqueOrThrow({ where: { id: opts.imageId } });
  const product = await loadProduct(latest.productGid);
  if (!product) throw new Error('Product not found');

  const references = latest.sourceMediaIds
    .map((id) => product.media.find((m) => m.id === id))
    .filter((m) => m !== undefined);
  if (references.length === 0) throw new Error('The original reference photos are no longer on the product');

  const images = await Promise.all(references.map((m) => fetchReference(m.url)));
  if (opts.includeLatest) images.push({ bytes: Buffer.from(latest.bytes), mimeType: latest.mimeType });

  const out = await generateImage({
    apiKey: env.GEMINI_API_KEY,
    model: opts.model,
    prompt: opts.prompt,
    images,
    aspectRatio: latest.aspectRatio,
    imageSize: opts.imageSize
  });

  // A new chain: this prompt becomes the base that later amendments build on
  return db.generatedImage.create({
    data: {
      productGid: latest.productGid,
      sourceMediaIds: latest.sourceMediaIds,
      presetName: `${latest.presetName.replace(/ \(fresh\)$/, '')} (fresh)`,
      prompt: opts.prompt,
      model: opts.model,
      imageSize: opts.imageSize,
      aspectRatio: latest.aspectRatio,
      bytes: out.bytes,
      mimeType: out.mimeType
    },
    select: GENERATED_SELECT
  });
}

function fileName(image: { id: string; presetName: string; mimeType: string }) {
  const slug = image.presetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${image.id.slice(-6)}.${image.mimeType.includes('png') ? 'png' : 'jpg'}`;
}

async function stage(image: { id: string; presetName: string; mimeType: string; bytes: Uint8Array }) {
  const admin = appAdmin();
  const name = fileName(image);
  const bytes = new Uint8Array(image.bytes);
  const target = await createStagedUpload(admin, { filename: name, mimeType: image.mimeType, sizeBytes: bytes.length, kind: 'IMAGE' });
  await uploadToStagedTarget(target, bytes, image.mimeType, name);
  return target.resourceUrl;
}

export async function addToProduct(imageId: string, alt: string) {
  const image = await db.generatedImage.findUniqueOrThrow({ where: { id: imageId } });
  const resourceUrl = await stage(image);

  const res = await appAdmin()(
    `mutation AddProductImage($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product { id media(last: 1) { nodes { id status } } }
        userErrors { field message }
      }
    }`,
    { product: { id: image.productGid }, media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE', alt }] }
  );
  const err = res.errors?.[0]?.message ?? res.data?.productUpdate?.userErrors?.[0]?.message;
  if (err) throw new Error(err);

  const mediaId = res.data.productUpdate.product.media.nodes[0]?.id ?? null;
  await db.generatedImage.update({ where: { id: imageId }, data: { status: 'ADDED', shopifyMediaId: mediaId } });
}

export async function saveToLibrary(imageId: string) {
  const image = await db.generatedImage.findUniqueOrThrow({ where: { id: imageId } });
  if (image.creativeId) return;

  const resourceUrl = await stage(image);
  const uploaded = await createFileAndWait(appAdmin(), resourceUrl, 'IMAGE', `AI scene: ${image.presetName}`);
  const creative = await db.creative.create({
    data: {
      kind: 'IMAGE',
      url: uploaded.url,
      shopifyFileId: uploaded.fileId,
      filename: fileName(image),
      width: uploaded.width,
      height: uploaded.height,
      tags: ['ai-scene', image.presetName.toLowerCase()],
      notes: 'Generated in the image studio'
    }
  });
  await db.generatedImage.update({ where: { id: imageId }, data: { creativeId: creative.id } });
}
