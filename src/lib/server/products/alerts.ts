import { db } from '$lib/db';

export interface TakedownAlert {
  id: string; // stable key for dismissal: `${activeId}:${inactiveId}`
  activeProductId: string;
  activeProductTitle: string;
  activePlatform: string;
  inactiveProductId: string;
  inactiveProductTitle: string;
  inactivePlatform: string;
  recentOrderCount: number;
}

// statuses that indicate a listing has been removed or disabled
const INACTIVE_STATUSES = new Set([
  'archived', 'draft', 'inactive', 'expired', 'removed', 'sold_out', 'private'
]);

export async function getTakedownAlerts(dayLookback = 30): Promise<TakedownAlert[]> {
  // shopify product always holds the linkedProductId pointer
  const pairs = await db.product.findMany({
    where: { linkedProductId: { not: null } },
    include: { linkedProduct: true }
  });

  if (pairs.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dayLookback);

  const alerts: TakedownAlert[] = [];

  for (const sp of pairs) {
    const ep = sp.linkedProduct!;

    const shopifyDown = sp.status ? INACTIVE_STATUSES.has(sp.status.toLowerCase()) : false;
    const etsyDown = ep.status ? INACTIVE_STATUSES.has(ep.status.toLowerCase()) : false;

    // only alert when exactly one side is down
    if (shopifyDown === etsyDown) continue;

    const active = shopifyDown ? ep : sp;
    const inactive = shopifyDown ? sp : ep;

    const recentCount = await db.lineItem.count({
      where: {
        platformProductId: active.platformProductId,
        order: { orderDate: { gte: cutoff } }
      }
    });

    if (recentCount === 0) continue;

    alerts.push({
      id: `${active.id}:${inactive.id}`,
      activeProductId: active.id,
      activeProductTitle: active.title,
      activePlatform: active.platform,
      inactiveProductId: inactive.id,
      inactiveProductTitle: inactive.title,
      inactivePlatform: inactive.platform,
      recentOrderCount: recentCount
    });
  }

  return alerts;
}
