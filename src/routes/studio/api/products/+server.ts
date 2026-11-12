import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { appAdmin } from '$lib/server/shopify/appAdmin';

const PAGE_SIZE = 48;
// Activity sorts look up this many recent products, then apply the filters to those
const ACTIVITY_LIMIT = 100;

const SHOPIFY_SORTS: Record<string, { sortKey: string; reverse: boolean }> = {
  updated: { sortKey: 'UPDATED_AT', reverse: true },
  created: { sortKey: 'CREATED_AT', reverse: true },
  title: { sortKey: 'TITLE', reverse: false }
};

const numericId = (gid: string) => gid.split('/').pop()!;
const clean = (s: string) => s.replace(/['"\\]/g, '');

function searchFilter(url: URL) {
  const parts: string[] = [];
  const q = url.searchParams.get('q')?.trim();
  const collection = url.searchParams.get('collection');
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status') ?? 'active';

  if (q) parts.push(`title:*${q.replace(/[^\w\s-]/g, '')}*`);
  if (collection && /^\d+$/.test(collection)) parts.push(`collection_id:${collection}`);
  if (type) parts.push(`product_type:'${clean(type)}'`);
  if (['active', 'draft', 'archived'].includes(status)) parts.push(`status:${status}`);
  return parts;
}

// Most recent edit per product = newest change to any of its generated images (discards included)
async function editedTimes(gids?: string[]) {
  const rows = await db.generatedImage.groupBy({
    by: ['productGid'],
    where: gids ? { productGid: { in: gids } } : undefined,
    _max: { updatedAt: true },
    orderBy: { _max: { updatedAt: 'desc' } },
    take: gids ? undefined : ACTIVITY_LIMIT
  });
  return new Map(rows.map((r) => [r.productGid, r._max.updatedAt!]));
}

async function viewedTimes(gids?: string[]) {
  const rows = await db.studioProductView.findMany({
    where: gids ? { productGid: { in: gids } } : undefined,
    orderBy: { viewedAt: 'desc' },
    take: gids ? undefined : ACTIVITY_LIMIT
  });
  return new Map(rows.map((r) => [r.productGid, r.viewedAt]));
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const sort = url.searchParams.get('sort') ?? 'updated';
  const filter = searchFilter(url);
  const activitySort = sort === 'viewed' || sort === 'edited';

  let recent: Map<string, Date> | null = null;
  if (activitySort) {
    recent = sort === 'viewed' ? await viewedTimes() : await editedTimes();
    if (!recent.size) return json({ products: [], next: null });
    filter.unshift(`(${[...recent.keys()].map((gid) => `id:${numericId(gid)}`).join(' OR ')})`);
  }

  const order = SHOPIFY_SORTS[sort] ?? SHOPIFY_SORTS.updated;
  const res = await appAdmin()(
    `query StudioProducts($query: String, $first: Int!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
      products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
        nodes {
          id title status updatedAt
          featuredMedia { preview { image { url } } }
          mediaCount { count }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      query: filter.join(' AND ') || null,
      first: activitySort ? ACTIVITY_LIMIT : PAGE_SIZE,
      after: activitySort ? null : url.searchParams.get('after'),
      sortKey: order.sortKey,
      reverse: order.reverse
    }
  );
  if (res.errors?.length) error(502, res.errors[0].message);

  const nodes: any[] = res.data.products.nodes;
  const gids = nodes.map((p) => p.id);
  const [viewed, edited] = await Promise.all([viewedTimes(gids), editedTimes(gids)]);

  const products = nodes.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    image: p.featuredMedia?.preview?.image?.url ?? null,
    photos: p.mediaCount?.count ?? 0,
    updatedAt: p.updatedAt,
    viewedAt: viewed.get(p.id) ?? null,
    editedAt: edited.get(p.id) ?? null
  }));

  // Shopify returns the id matches in its own order, so put them back in activity order
  if (recent) products.sort((a, b) => recent.get(b.id)!.getTime() - recent.get(a.id)!.getTime());

  const pageInfo = res.data.products.pageInfo;
  return json({ products, next: !activitySort && pageInfo.hasNextPage ? pageInfo.endCursor : null });
};
