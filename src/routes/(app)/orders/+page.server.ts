import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import type { PlatformFilter } from '$lib/types';
import { Platform } from '@prisma/client';

export const load: PageServerLoad = async ({ url }) => {
  const platform = (url.searchParams.get('platform') ?? 'all') as PlatformFilter;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const perPage = 25;

  const platformWhere = platform === 'all'
    ? {}
    : { platform: platform === 'shopify' ? Platform.SHOPIFY : Platform.ETSY };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: platformWhere,
      include: {
        feeLines: { select: { amountCents: true, type: true } },
        refunds: { select: { amountCents: true } }
      },
      orderBy: { orderDate: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage
    }),
    db.order.count({ where: platformWhere })
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      platform: o.platform,
      platformOrderId: o.platformOrderId,
      orderName: o.orderName,
      orderDate: o.orderDate.toISOString(),
      grossRevenueCents: o.grossRevenueCents,
      shippingChargedCents: o.shippingChargedCents,
      shippingCostCents: o.shippingCostCents,
      taxesCents: o.taxesCents,
      status: o.status,
      totalFeesCents: o.feeLines.reduce((s, f) => s + f.amountCents, 0),
      totalRefundsCents: o.refunds.reduce((s, r) => s + r.amountCents, 0)
    })),
    platform,
    page,
    totalPages: Math.ceil(total / perPage),
    total
  };
};
