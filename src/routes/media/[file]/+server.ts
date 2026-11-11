import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { igSafeUrl } from '$lib/creatives';

// Public JPEG for Instagram to fetch when publishing. Instagram kept failing to download
// carousel photos straight from Shopify's CDN (WebP negotiation, slow first-time crops),
// so Meridian fetches the IG-ready JPEG itself and serves it from here.
// Only library images are served, by their unguessable id; they're public on Shopify anyway.
export const GET: RequestHandler = async ({ params }) => {
  const id = params.file.replace(/\.jpg$/, '');
  const creative = await db.creative.findUnique({ where: { id }, select: { kind: true, url: true, width: true, height: true } });
  if (!creative || creative.kind !== 'IMAGE') error(404, 'Not found');

  const res = await fetch(igSafeUrl(creative), { headers: { Accept: 'image/jpeg' } });
  if (!res.ok) error(502, `CDN returned ${res.status}`);

  return new Response(await res.arrayBuffer(), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }
  });
};
