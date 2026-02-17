import { db } from '$lib/db';
import { fetchAllOrders, fetchAllPayouts, fetchAllBalanceTransactions, fetchOrderShippingLabelCost, fetchAllProducts } from './api';
import { Platform, SyncStatus, OrderStatus, FeeType } from '@prisma/client';

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

async function upsertOrders(shop: string, token: string, since?: string): Promise<number> {
  let count = 0;

  for await (const batch of fetchAllOrders(shop, token, since)) {
    for (const raw of batch) {
      const customerName = [raw.customer?.first_name, raw.customer?.last_name]
        .filter(Boolean).join(' ') || null;

      const orderData = {
        platform: Platform.SHOPIFY,
        platformOrderId: raw.id.toString(),
        orderName: raw.name || null,
        orderDate: new Date(raw.created_at),
        grossRevenueCents: toCents(raw.total_price),
        subtotalPriceCents: toCents(raw.subtotal_price),
        totalDiscountsCents: toCents(raw.total_discounts),
        shippingChargedCents: toCents(
          raw.total_shipping_price_set?.shop_money?.amount ?? '0'
        ),
        taxesCents: toCents(raw.total_tax),
        status: mapOrderStatus(raw.financial_status),
        customerName,
        customerEmail: raw.customer?.email || raw.email || null,
        customerPhone: raw.customer?.phone || null,
        shippingName: raw.shipping_address?.name || null,
        shippingAddress1: raw.shipping_address?.address1 || null,
        shippingAddress2: raw.shipping_address?.address2 || null,
        shippingCity: raw.shipping_address?.city || null,
        shippingProvince: raw.shipping_address?.province || null,
        shippingProvinceCode: raw.shipping_address?.province_code || null,
        shippingZip: raw.shipping_address?.zip || null,
        shippingCountry: raw.shipping_address?.country || null,
        shippingCountryCode: raw.shipping_address?.country_code || null,
        fulfillmentStatus: raw.fulfillment_status || null,
        note: raw.note || null,
        tags: raw.tags || null,
        cancelReason: raw.cancel_reason || null,
        cancelledAt: raw.cancelled_at ? new Date(raw.cancelled_at) : null,
        closedAt: raw.closed_at ? new Date(raw.closed_at) : null,
        discountCodes: raw.discount_codes && raw.discount_codes.length > 0
          ? raw.discount_codes : undefined,
        paymentGateway: raw.payment_gateway_names?.[0] || null
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
              platformRefundId: r.id.toString(),
              amountCents: toCents(t.amount),
              refundDate: new Date(r.processed_at)
            }))
        );

        if (refundRows.length > 0) {
          await db.refund.createMany({ data: refundRows });
        }
      }

      // Sync line items — same delete + re-insert pattern
      await db.lineItem.deleteMany({ where: { orderId: order.id } });

      if (raw.line_items.length > 0) {
        await db.lineItem.createMany({
          data: raw.line_items.map((li) => ({
            orderId: order.id,
            platformItemId: li.id.toString(),
            platformProductId: li.product_id?.toString() || null,
            title: li.title,
            variantTitle: li.variant_title || null,
            quantity: li.quantity,
            priceCents: toCents(li.price),
            sku: li.sku || null,
            requiresShipping: li.requires_shipping ?? true,
            grams: li.grams ?? null
          }))
        });
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
            totalCents: toCents(raw.amount),
            chargesFeesCents: toCents(raw.summary.charges_fee_amount),
            adjustmentsFeesCents: toCents(raw.summary.adjustments_fee_amount),
            refundsFeesCents: toCents(raw.summary.refunds_fee_amount),
            payoutDate: new Date(raw.date)
          },
          update: {
            totalCents: toCents(raw.amount),
            chargesFeesCents: toCents(raw.summary.charges_fee_amount),
            adjustmentsFeesCents: toCents(raw.summary.adjustments_fee_amount),
            refundsFeesCents: toCents(raw.summary.refunds_fee_amount)
          }
        });

        count++;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403') || message.includes('payment')) {
      console.warn('[sync] Shopify Payments not available — skipping payouts');
    } else {
      throw err;
    }
  }

  return count;
}

async function syncBalanceTransactions(shop: string, token: string): Promise<void> {
  try {
    for await (const batch of fetchAllBalanceTransactions(shop, token)) {
      for (const txn of batch) {
        if (!txn.source_order_id) continue;

        const orderKey = {
          platform: Platform.SHOPIFY,
          platformOrderId: txn.source_order_id.toString()
        };

        const order = await db.order.findUnique({
          where: { platform_platformOrderId: orderKey },
          select: { id: true }
        });

        if (!order) continue;

        if (txn.type === 'charge' && parseFloat(txn.fee) > 0) {
          await db.feeLine.upsert({
            where: { id: `shopify_txn_${txn.id}` },
            create: {
              id: `shopify_txn_${txn.id}`,
              orderId: order.id,
              type: FeeType.PAYMENT_PROCESSING,
              amountCents: toCents(txn.fee)
            },
            update: {
              amountCents: toCents(txn.fee)
            }
          });
        }

      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      console.warn('[sync] Balance transactions not accessible — skipping fees/shipping costs');
    } else {
      throw err;
    }
  }
}

function parseFilename(src: string): string | null {
  try {
    const pathname = new URL(src).pathname;
    const base = pathname.split('/').pop() ?? '';
    // Strip Shopify's size suffix (e.g. _800x.jpg → .jpg)
    return base.replace(/(_\d+x\d*|\d*x\d+)\.(jpg|png|webp|gif)/i, '.$2') || null;
  } catch {
    return null;
  }
}

async function upsertProducts(shop: string, token: string): Promise<number> {
  let count = 0;

  for await (const batch of fetchAllProducts(shop, token)) {
    for (const raw of batch) {
      const productData = {
        platform: Platform.SHOPIFY,
        platformProductId: raw.id.toString(),
        title: raw.title,
        vendor: raw.vendor || null,
        productType: raw.product_type || null,
        status: raw.status,
        tags: raw.tags || null
      };

      const product = await db.product.upsert({
        where: {
          platform_platformProductId: {
            platform: Platform.SHOPIFY,
            platformProductId: raw.id.toString()
          }
        },
        create: productData,
        update: productData
      });

      // Delete + re-insert images to stay idempotent
      await db.productImage.deleteMany({ where: { productId: product.id } });

      if (raw.images.length > 0) {
        await db.productImage.createMany({
          data: raw.images.map((img) => ({
            productId: product.id,
            src: img.src,
            filename: parseFilename(img.src),
            alt: img.alt,
            position: img.position,
            width: img.width,
            height: img.height
          }))
        });
      }

      count++;
    }
  }

  return count;
}

async function syncShippingLabelCosts(shop: string, token: string): Promise<void> {
  try {
    const orders = await db.order.findMany({
      where: { platform: Platform.SHOPIFY, shippingCostCents: null },
      select: { platformOrderId: true }
    });

    let matched = 0;
    for (const order of orders) {
      const costCents = await fetchOrderShippingLabelCost(shop, token, order.platformOrderId);
      if (costCents !== null) {
        await db.order.updateMany({
          where: { platform: Platform.SHOPIFY, platformOrderId: order.platformOrderId },
          data: { shippingCostCents: costCents }
        });
        matched++;
      }
    }

    console.log(`[sync] shipping labels: ${orders.length} orders checked, ${matched} costs found`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] shipping label sync failed:', message);
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
    const [ordersCount, payoutsCount, productsCount] = await Promise.all([
      upsertOrders(connection.shop, connection.accessToken, since),
      upsertPayouts(connection.shop, connection.accessToken),
      upsertProducts(connection.shop, connection.accessToken)
    ]);

    await syncBalanceTransactions(connection.shop, connection.accessToken);
    await syncShippingLabelCosts(connection.shop, connection.accessToken);

    await db.syncRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt: new Date(),
        status: SyncStatus.SUCCESS,
        ordersUpserted: ordersCount,
        payoutsSynced: payoutsCount
      }
    });

    console.log(`[sync] Shopify sync complete — ${ordersCount} orders, ${payoutsCount} payouts, ${productsCount} products`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync] Shopify sync failed:', message);

    await db.syncRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt: new Date(),
        status: SyncStatus.FAILED,
        errorMessage: message.slice(0, 500)
      }
    });
  }
}
