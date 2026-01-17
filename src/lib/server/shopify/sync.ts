import { db } from '$lib/db';
import { fetchAllOrders, fetchAllPayouts, fetchAllBalanceTransactions } from './api';
import type { ShopifyOrder, ShopifyPayout, ShopifyBalanceTransaction } from './api';
import { Platform, SyncStatus, OrderStatus } from '@prisma/client';

function toCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

function mapOrderStatus(financial: string): OrderStatus {
  switch (financial) {
    case 'refunded':
      return OrderStatus.REFUNDED;
    case 'voided':
      return OrderStatus.CANCELLED;
    default:
      return OrderStatus.CLOSED;
  }
}

function customerName(order: ShopifyOrder): string | null {
  const addr = order.billing_address;
  if (!addr) return null;
  const parts = [addr.first_name, addr.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

async function upsertOrders(shop: string, token: string, since?: string): Promise<number> {
  let count = 0;

  for await (const batch of fetchAllOrders(shop, token, since)) {
    for (const raw of batch) {
      const orderData = {
        platform: Platform.SHOPIFY,
        platformOrderId: raw.id.toString(),
        orderNumber: raw.name,
        orderDate: new Date(raw.created_at),
        grossRevenueCents: toCents(raw.total_price),
        shippingChargedCents: toCents(
          raw.total_shipping_price_set?.shop_money?.amount ?? '0'
        ),
        taxesCents: toCents(raw.total_tax),
        currency: raw.currency,
        status: mapOrderStatus(raw.financial_status),
        customerName: customerName(raw),
        customerEmail: raw.email ?? null
      };

      const order = await db.order.upsert({
        where: {
          platform_platformOrderId: {
            platform: Platform.SHOPIFY,
            platformOrderId: raw.id.toString()
          }
        },
        create: orderData,
        update: orderData
      });

      // Sync refunds — delete and re-insert to stay idempotent
      if (raw.refunds && raw.refunds.length > 0) {
        await db.refund.deleteMany({ where: { orderId: order.id } });

        const refundRows = raw.refunds.flatMap((r) =>
          r.transactions
            .filter((t) => t.kind === 'refund' && t.status === 'success')
            .map((t) => ({
              orderId: order.id,
              amountCents: toCents(t.amount),
              date: new Date(r.processed_at),
              reason: null
            }))
        );

        if (refundRows.length > 0) {
          await db.refund.createMany({ data: refundRows });
        }
      }

      count++;
    }
  }

  return count;
}

async function upsertPayouts(shop: string, token: string): Promise<number> {
  let count = 0;

  try {
    for await (const batch of fetchAllPayouts(shop, token)) {
      for (const raw of batch) {
        const feeCents =
          toCents(raw.summary.charges_fee_amount) +
          toCents(raw.summary.adjustments_fee_amount) +
          toCents(raw.summary.refunds_fee_amount);

        await db.payout.upsert({
          where: {
            platform_platformPayoutId: {
              platform: Platform.SHOPIFY,
              platformPayoutId: raw.id.toString()
            }
          },
          create: {
            platformPayoutId: raw.id.toString(),
            platform: Platform.SHOPIFY,
            amountCents: toCents(raw.amount),
            feeCents,
            date: new Date(raw.date),
            status: raw.status,
            currency: raw.currency
          },
          update: {
            amountCents: toCents(raw.amount),
            feeCents,
            status: raw.status
          }
        });

        count++;
      }
    }
  } catch (err) {
    // Shopify Payments may not be enabled or scopes may be missing
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403') || message.includes('payment')) {
      console.warn('[sync] Shopify Payments not available — skipping payouts');
    } else {
      throw err;
    }
  }

  return count;
}

async function upsertFeeLines(shop: string, token: string): Promise<void> {
  try {
    for await (const batch of fetchAllBalanceTransactions(shop, token)) {
      const paymentTxns = batch.filter(
        (t): t is ShopifyBalanceTransaction & { source_order_id: number } =>
          t.type === 'payment' && t.source_order_id !== null && parseFloat(t.fee) > 0
      );

      for (const txn of paymentTxns) {
        const order = await db.order.findUnique({
          where: {
            platform_platformOrderId: {
              platform: Platform.SHOPIFY,
              platformOrderId: txn.source_order_id.toString()
            }
          },
          select: { id: true }
        });

        if (!order) continue;

        await db.feeLine.upsert({
          where: {
            // Use balance transaction id as a stable key via a generated field name
            // Since Prisma doesn't support upsert by non-unique without a workaround,
            // delete and recreate per order instead.
            id: `shopify_txn_${txn.id}`
          },
          create: {
            id: `shopify_txn_${txn.id}`,
            orderId: order.id,
            type: 'payment_processing',
            amountCents: toCents(txn.fee)
          },
          update: {
            amountCents: toCents(txn.fee)
          }
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      console.warn('[sync] Balance transactions not accessible — skipping fee lines');
    } else {
      throw err;
    }
  }
}

export async function runShopifySync(triggeredManually = false): Promise<void> {
  const connection = await db.shopifyConnection.findFirst();
  if (!connection) {
    console.warn('[sync] No Shopify connection found — skipping sync');
    return;
  }

  const runRecord = await db.syncRun.create({
    data: {
      platform: Platform.SHOPIFY,
      startedAt: new Date(),
      status: SyncStatus.RUNNING
    }
  });

  const lastSuccess = await db.syncRun.findFirst({
    where: { platform: Platform.SHOPIFY, status: SyncStatus.SUCCESS },
    orderBy: { startedAt: 'desc' }
  });

  const since = triggeredManually ? undefined : lastSuccess?.startedAt.toISOString();

  try {
    const [ordersCount, payoutsCount] = await Promise.all([
      upsertOrders(connection.shop, connection.accessToken, since),
      upsertPayouts(connection.shop, connection.accessToken)
    ]);

    await upsertFeeLines(connection.shop, connection.accessToken);

    await db.syncRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt: new Date(),
        status: SyncStatus.SUCCESS,
        ordersUpserted: ordersCount,
        payoutsSynced: payoutsCount
      }
    });

    console.log(`[sync] Shopify sync complete — ${ordersCount} orders, ${payoutsCount} payouts`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync] Shopify sync failed:', message);

    await db.syncRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt: new Date(),
        status: SyncStatus.FAILED,
        errorSummary: message.slice(0, 500)
      }
    });
  }
}
