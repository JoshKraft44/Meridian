import { db } from '$lib/db';
import { Platform, OrderStatus } from '@prisma/client';
import { fetchAllReceipts, fetchAllListings, refreshAccessToken, type EtsyReceipt } from './api';

async function getValidToken(): Promise<{ token: string; shopId: string } | null> {
	const conn = await db.etsyConnection.findFirst();
	if (!conn) return null;

	// Refresh if expiring within 5 minutes
	if (conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
		const refreshed = await refreshAccessToken(conn.refreshToken);
		const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
		await db.etsyConnection.update({
			where: { id: conn.id },
			data: { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, expiresAt },
		});
		return { token: refreshed.access_token, shopId: conn.shopId };
	}

	return { token: conn.accessToken, shopId: conn.shopId };
}

function toOrderStatus(status: string, isRefunded: boolean): OrderStatus {
	if (isRefunded) return OrderStatus.REFUNDED;
	if (status === 'canceled') return OrderStatus.CANCELLED;
	if (status === 'paid' || status === 'completed') return OrderStatus.CLOSED;
	return OrderStatus.OPEN;
}

function cents(money: EtsyReceipt['grandtotal']): number {
	return Math.round((money.amount / money.divisor) * 100);
}

async function upsertReceipts(shopId: string, token: string, since?: Date): Promise<number> {
	let count = 0;

	for await (const batch of fetchAllReceipts(shopId, token, since)) {
		for (const receipt of batch) {
			const order = await db.order.upsert({
				where: {
					platform_platformOrderId: {
						platform: Platform.ETSY,
						platformOrderId: String(receipt.receipt_id),
					},
				},
				create: {
					platform: Platform.ETSY,
					platformOrderId: String(receipt.receipt_id),
					orderDate: new Date(receipt.create_timestamp * 1000),
					grossRevenueCents: cents(receipt.grandtotal),
					subtotalPriceCents: cents(receipt.subtotal),
					shippingChargedCents: cents(receipt.total_shipping_cost),
					taxesCents: cents(receipt.total_tax_cost),
					totalDiscountsCents: cents(receipt.discount_amt),
					status: toOrderStatus(receipt.status, receipt.is_refunded),
					customerName: receipt.name || null,
					customerEmail: receipt.buyer_email || null,
					shippingAddress1: receipt.first_line || null,
					shippingAddress2: receipt.second_line || null,
					shippingCity: receipt.city || null,
					shippingProvince: receipt.state || null,
					shippingZip: receipt.zip || null,
					shippingCountryCode: receipt.country_iso || null,
					paymentGateway: receipt.payment_method || null,
				},
				update: {
					grossRevenueCents: cents(receipt.grandtotal),
					subtotalPriceCents: cents(receipt.subtotal),
					shippingChargedCents: cents(receipt.total_shipping_cost),
					taxesCents: cents(receipt.total_tax_cost),
					totalDiscountsCents: cents(receipt.discount_amt),
					status: toOrderStatus(receipt.status, receipt.is_refunded),
					customerName: receipt.name || null,
					customerEmail: receipt.buyer_email || null,
				},
			});

			await db.lineItem.deleteMany({ where: { orderId: order.id } });
			if (receipt.transactions?.length) {
				await db.lineItem.createMany({
					data: receipt.transactions.map((txn) => ({
						orderId: order.id,
						platformItemId: String(txn.transaction_id),
						platformProductId: txn.listing_id ? String(txn.listing_id) : null,
						title: txn.title,
						variantTitle:
							txn.variations?.map((v) => v.formatted_value).join(' / ') || null,
						quantity: txn.quantity,
						priceCents: cents(txn.price),
						sku: txn.sku || txn.product_data?.sku || null,
					})),
				});
			}

			// Simple refund record if receipt was refunded
			if (receipt.is_refunded) {
				await db.refund.deleteMany({ where: { orderId: order.id } });
				await db.refund.create({
					data: {
						orderId: order.id,
						platformRefundId: `etsy_refund_${receipt.receipt_id}`,
						refundDate: new Date(receipt.update_timestamp * 1000),
						amountCents: cents(receipt.grandtotal),
					},
				});
			}

			count++;
		}
	}

	return count;
}

async function upsertListings(shopId: string, token: string): Promise<void> {
	for await (const batch of fetchAllListings(shopId, token)) {
		for (const listing of batch) {
			const product = await db.product.upsert({
				where: {
					platform_platformProductId: {
						platform: Platform.ETSY,
						platformProductId: String(listing.listing_id),
					},
				},
				create: {
					platform: Platform.ETSY,
					platformProductId: String(listing.listing_id),
					title: listing.title,
					description: listing.description?.slice(0, 2000) || null,
					status: listing.state,
					tags: listing.tags?.join(', ') || null,
					sku: listing.sku?.[0] || null,
					priceCents: Math.round((listing.price.amount / listing.price.divisor) * 100),
				},
				update: {
					title: listing.title,
					status: listing.state,
					tags: listing.tags?.join(', ') || null,
					sku: listing.sku?.[0] || null,
					priceCents: Math.round((listing.price.amount / listing.price.divisor) * 100),
				},
			});

			await db.productImage.deleteMany({ where: { productId: product.id } });
			if (listing.images?.length) {
				await db.productImage.createMany({
					data: listing.images.map((img) => ({
						productId: product.id,
						src: img.url_fullxfull,
						alt: img.alt_text || null,
						position: img.rank ?? 0,
					})),
				});
			}
		}
	}
}

export async function runEtsySync(triggeredManually = false): Promise<void> {
	const auth = await getValidToken();
	if (!auth) {
		console.warn('[etsy] No connection — skipping sync');
		return;
	}

	const syncRun = await db.syncRun.create({
		data: { platform: Platform.ETSY, startedAt: new Date(), status: 'RUNNING' },
	});

	try {
		const lastSync = triggeredManually
			? null
			: await db.syncRun.findFirst({
					where: { platform: Platform.ETSY, status: 'SUCCESS' },
					orderBy: { startedAt: 'desc' },
				});

		const since = lastSync?.startedAt ?? undefined;

		const [ordersUpserted] = await Promise.all([
			upsertReceipts(auth.shopId, auth.token, since),
			upsertListings(auth.shopId, auth.token),
		]);

		await db.syncRun.update({
			where: { id: syncRun.id },
			data: { status: 'SUCCESS', finishedAt: new Date(), ordersUpserted },
		});

		await db.etsyConnection.updateMany({
			where: { shopId: auth.shopId },
			data: { lastSyncedAt: new Date() },
		});

		console.log(`[etsy] sync complete: ${ordersUpserted} orders`);
	} catch (err) {
		await db.syncRun.update({
			where: { id: syncRun.id },
			data: { status: 'FAILED', finishedAt: new Date(), errorMessage: String(err) },
		});
		throw err;
	}
}
