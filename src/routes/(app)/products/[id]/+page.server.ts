import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db';
import { error, fail } from '@sveltejs/kit';
import { unlinkProducts } from '$lib/server/products/linking';

export const load: PageServerLoad = async ({ params }) => {
  const product = await db.product.findUnique({
    where: { id: params.id },
    include: {
      images: { orderBy: { position: 'asc' } },
      linkedProduct: {
        include: { images: { orderBy: { position: 'asc' }, take: 1 } }
      },
      linkedBy: {
        include: { images: { orderBy: { position: 'asc' }, take: 1 } }
      }
    }
  });

  if (!product) error(404, 'Product not found');

  const linked = product.linkedProduct ?? product.linkedBy ?? null;

  // recent orders containing this product (via line items)
  const lineItems = await db.lineItem.findMany({
    where: { platformProductId: product.platformProductId },
    include: {
      order: {
        select: {
          id: true,
          orderName: true,
          orderDate: true,
          status: true,
          grossRevenueCents: true,
          platform: true
        }
      }
    },
    orderBy: { order: { orderDate: 'desc' } },
    take: 20
  });

  // deduplicate by order id
  const seenOrders = new Set<string>();
  const recentOrders = lineItems
    .filter((li) => {
      if (seenOrders.has(li.order.id)) return false;
      seenOrders.add(li.order.id);
      return true;
    })
    .slice(0, 10)
    .map((li) => ({
      id: li.order.id,
      orderName: li.order.orderName,
      orderDate: li.order.orderDate.toISOString(),
      status: li.order.status,
      grossRevenueCents: li.order.grossRevenueCents
    }));

  // get shopify shop domain for admin links
  let shopDomain: string | null = null;
  if (product.platform === 'SHOPIFY') {
    const conn = await db.shopifyConnection.findFirst({ select: { shop: true } });
    shopDomain = conn?.shop ?? null;
  }

  return {
    product: {
      ...product,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      images: product.images.map((img) => ({
        id: img.id,
        src: img.src,
        alt: img.alt,
        position: img.position
      }))
    },
    linked: linked
      ? {
          id: linked.id,
          platform: linked.platform,
          platformProductId: linked.platformProductId,
          title: linked.title,
          thumbnail: linked.images[0]?.src ?? null
        }
      : null,
    recentOrders,
    shopDomain
  };
};

export const actions: Actions = {
  unlink: async ({ params }) => {
    try {
      await unlinkProducts(params.id);
    } catch (e) {
      return fail(400, { error: String(e) });
    }
  }
};
