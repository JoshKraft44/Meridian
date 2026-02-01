import { db } from '$lib/db';
import type { PlatformFilter } from '$lib/types';
import { Platform } from '@prisma/client';

export interface ProfitSummary {
  ordersCount: number;
  grossRevenueCents: number;
  grossProfitCents: number;
  netProfitCents: number;
  totalFeesCents: number;
  shippingChargedCents: number;
  shippingCostCents: number;
  taxesCents: number;
  totalRefundsCents: number;
  totalExpensesCents: number;
  missingShippingCostCount: number;
}

export interface DayBucket {
  date: string; // YYYY-MM-DD
  grossCents: number;
  netCents: number;
}

export interface FeeBreakdown {
  type: string;
  totalCents: number;
}

function platformWhere(platform: PlatformFilter) {
  if (platform === 'all') return {};
  return { platform: platform === 'shopify' ? Platform.SHOPIFY : Platform.ETSY };
}

export async function getProfitSummary(
  start: Date,
  end: Date,
  excludeTaxes: boolean,
  platform: PlatformFilter = 'all'
): Promise<ProfitSummary> {
  const orderWhere = { orderDate: { gte: start, lte: end }, ...platformWhere(platform) };
  const orderRelWhere = { order: orderWhere };

  const [orders, feeAgg, refundAgg, expenseAgg] = await Promise.all([
    db.order.findMany({
      where: orderWhere,
      select: {
        grossRevenueCents: true,
        shippingChargedCents: true,
        shippingCostCents: true,
        taxesCents: true
      }
    }),
    db.feeLine.aggregate({
      where: orderRelWhere,
      _sum: { amountCents: true }
    }),
    db.refund.aggregate({
      where: orderRelWhere,
      _sum: { amountCents: true }
    }),
    db.expenseEvent.aggregate({
      where: { eventDate: { gte: start, lte: end } },
      _sum: { amountCents: true }
    })
  ]);

  const grossRevenueCents = orders.reduce((s, o) => s + o.grossRevenueCents, 0);
  const shippingChargedCents = orders.reduce((s, o) => s + o.shippingChargedCents, 0);
  const shippingCostCents = orders.reduce((s, o) => s + (o.shippingCostCents ?? 0), 0);
  const taxesCents = orders.reduce((s, o) => s + o.taxesCents, 0);
  const missingShippingCostCount = orders.filter((o) => o.shippingCostCents === null).length;

  const totalFeesCents = feeAgg._sum.amountCents ?? 0;
  const totalRefundsCents = refundAgg._sum.amountCents ?? 0;
  const totalExpensesCents = expenseAgg._sum.amountCents ?? 0;

  const grossProfitCents = excludeTaxes ? grossRevenueCents - taxesCents : grossRevenueCents;

  const netProfitCents =
    grossProfitCents - totalFeesCents - shippingCostCents - totalRefundsCents - totalExpensesCents;

  return {
    ordersCount: orders.length,
    grossRevenueCents,
    grossProfitCents,
    netProfitCents,
    totalFeesCents,
    shippingChargedCents,
    shippingCostCents,
    taxesCents,
    totalRefundsCents,
    totalExpensesCents,
    missingShippingCostCount
  };
}

export async function getRevenueTimeSeries(
  start: Date,
  end: Date,
  excludeTaxes: boolean,
  platform: PlatformFilter = 'all'
): Promise<DayBucket[]> {
  const orders = await db.order.findMany({
    where: { orderDate: { gte: start, lte: end }, ...platformWhere(platform) },
    select: {
      orderDate: true,
      grossRevenueCents: true,
      taxesCents: true,
      shippingCostCents: true,
      feeLines: { select: { amountCents: true } },
      refunds: { select: { amountCents: true } }
    },
    orderBy: { orderDate: 'asc' }
  });

  const buckets = new Map<string, DayBucket>();

  for (const order of orders) {
    const day = order.orderDate.toISOString().slice(0, 10);

    if (!buckets.has(day)) {
      buckets.set(day, { date: day, grossCents: 0, netCents: 0 });
    }

    const bucket = buckets.get(day)!;
    const gross = excludeTaxes
      ? order.grossRevenueCents - order.taxesCents
      : order.grossRevenueCents;
    const fees = order.feeLines.reduce((s, f) => s + f.amountCents, 0);
    const refunds = order.refunds.reduce((s, r) => s + r.amountCents, 0);
    const shipping = order.shippingCostCents ?? 0;

    bucket.grossCents += gross;
    bucket.netCents += gross - fees - shipping - refunds;
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getFeeBreakdown(
  start: Date,
  end: Date,
  platform: PlatformFilter = 'all'
): Promise<FeeBreakdown[]> {
  const rows = await db.feeLine.groupBy({
    by: ['type'],
    where: { order: { orderDate: { gte: start, lte: end }, ...platformWhere(platform) } },
    _sum: { amountCents: true },
    orderBy: { _sum: { amountCents: 'desc' } }
  });

  return rows.map((r) => ({
    type: r.type,
    totalCents: r._sum.amountCents ?? 0
  }));
}
