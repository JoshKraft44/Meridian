import { db } from '$lib/db';
import type { PlatformFilter } from '$lib/types';
import { Platform, BillingFrequency } from '@prisma/client';

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
  subscriptionCostCents: number;
  missingShippingCostCount: number;
}

export interface DayBucket {
  date: string; // YYYY-MM-DD
  grossCents: number;
  netCents: number;
}

function platformWhere(platform: PlatformFilter) {
  if (platform === 'all') return {};
  return { platform: platform === 'shopify' ? Platform.SHOPIFY : Platform.ETSY };
}

function subscriptionPlatformWhere(platform: PlatformFilter) {
  if (platform === 'all') return {};
  // include subs that match the platform OR have no platform (general)
  return { OR: [{ platform: platform === 'shopify' ? Platform.SHOPIFY : Platform.ETSY }, { platform: null }] };
}

async function getSubscriptionCostCents(start: Date, end: Date, platform: PlatformFilter = 'all'): Promise<number> {
  const subs = await db.subscription.findMany({
    where: {
      startDate: { lte: end },
      AND: [
        { OR: [{ endDate: null }, { endDate: { gte: start } }] },
        ...( platform === 'all' ? [] : [subscriptionPlatformWhere(platform)] )
      ]
    }
  });

  let total = 0;
  for (const sub of subs) {
    const stepMonths = sub.frequency === BillingFrequency.MONTHLY ? 1 : 12;
    const cursor = new Date(sub.startDate);

    while (cursor <= end) {
      if (cursor >= start && (!sub.endDate || cursor <= sub.endDate)) {
        total += sub.amountCents;
      }
      cursor.setMonth(cursor.getMonth() + stepMonths);
    }
  }
  return total;
}

export async function getProfitSummary(
  start: Date,
  end: Date,
  excludeTaxes: boolean,
  platform: PlatformFilter = 'all'
): Promise<ProfitSummary> {
  const orderWhere = { orderDate: { gte: start, lte: end }, ...platformWhere(platform) };
  const orderRelWhere = { order: orderWhere };

  const [orders, feeAgg, refundAgg, expenseAgg, subscriptionCostCents] = await Promise.all([
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
    }),
    getSubscriptionCostCents(start, end, platform)
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
    grossProfitCents - totalFeesCents - shippingCostCents - totalRefundsCents - totalExpensesCents - subscriptionCostCents;

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
    subscriptionCostCents,
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

export interface CostBreakdown {
  label: string;
  totalCents: number;
}

export async function getCostBreakdown(
  start: Date,
  end: Date,
  platform: PlatformFilter = 'all'
): Promise<CostBreakdown[]> {
  const [feeRows, expenseRows, subscriptionCents] = await Promise.all([
    db.feeLine.groupBy({
      by: ['type'],
      where: { order: { orderDate: { gte: start, lte: end }, ...platformWhere(platform) } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } }
    }),
    db.expenseEvent.groupBy({
      by: ['category'],
      where: { eventDate: { gte: start, lte: end } },
      _sum: { amountCents: true }
    }),
    getSubscriptionCostCents(start, end, platform)
  ]);

  const items: CostBreakdown[] = [];

  for (const r of feeRows) {
    items.push({ label: r.type.replace(/_/g, ' '), totalCents: r._sum.amountCents ?? 0 });
  }

  for (const r of expenseRows) {
    const label = r.category.charAt(0) + r.category.slice(1).toLowerCase();
    items.push({ label, totalCents: r._sum.amountCents ?? 0 });
  }

  if (subscriptionCents > 0) {
    items.push({ label: 'Subscriptions', totalCents: subscriptionCents });
  }

  items.sort((a, b) => b.totalCents - a.totalCents);
  return items;
}
