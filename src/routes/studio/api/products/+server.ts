import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { appAdmin } from '$lib/server/shopify/appAdmin';

// Product picker for when the studio is opened from the app instead of a product page
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const q = url.searchParams.get('q')?.trim();
  const res = await appAdmin()(
    `query StudioProducts($query: String) {
      products(first: 30, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title featuredMedia { preview { image { url } } } mediaCount { count } }
      }
    }`,
    { query: q ? `title:*${q.replace(/[^\w\s-]/g, '')}*` : 'status:active' }
  );
  if (res.errors?.length) error(502, res.errors[0].message);

  return json(
    res.data.products.nodes.map((p: any) => ({
      id: p.id,
      title: p.title,
      image: p.featuredMedia?.preview?.image?.url ?? null,
      photos: p.mediaCount?.count ?? 0
    }))
  );
};
