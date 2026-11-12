import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { appAdmin } from '$lib/server/shopify/appAdmin';

// Collections and product types for the picker's filters
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const res = await appAdmin()(
    `query StudioCatalog {
      collections(first: 100, sortKey: TITLE) { nodes { id title productsCount { count } } }
      productTypes(first: 100) { nodes }
    }`
  );
  if (res.errors?.length) error(502, res.errors[0].message);

  return json({
    collections: res.data.collections.nodes
      .filter((c: any) => c.productsCount?.count > 0)
      .map((c: any) => ({ id: c.id.split('/').pop(), title: c.title, count: c.productsCount.count })),
    types: res.data.productTypes.nodes.filter(Boolean)
  });
};
