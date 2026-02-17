import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      feeLines: true,
      refunds: { orderBy: { refundDate: 'desc' } },
      lineItems: true
    }
  });

  if (!order) error(404, 'Order not found');

  const platformProductIds = [...new Set(
    order.lineItems
      .map((li) => li.platformProductId)
      .filter((id): id is string => id !== null)
  )];

  // Map of platformProductId → { thumbnail, images[], productId }
  const productDataMap: Record<string, {
    thumbnail: string;
    images: { src: string; alt: string | null }[];
    productId: string;
  }> = {};

  if (platformProductIds.length > 0) {
    const products = await db.product.findMany({
      where: {
        platform: order.platform,
        platformProductId: { in: platformProductIds }
      },
      include: {
        images: { orderBy: { position: 'asc' } }
      }
    });

    for (const p of products) {
      if (p.images.length > 0) {
        productDataMap[p.platformProductId] = {
          thumbnail: p.images[0].src,
          images: p.images.map((img) => ({ src: img.src, alt: img.alt })),
          productId: p.id
        };
      }
    }
  }

  return {
    order: {
      ...order,
      orderDate: order.orderDate.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      refunds: order.refunds.map((r) => ({
        ...r,
        refundDate: r.refundDate.toISOString(),
        createdAt: r.createdAt.toISOString()
      })),
      feeLines: order.feeLines.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString()
      }))
    },
    productDataMap
  };
};
