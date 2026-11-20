import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { appAdmin } from '../shopify/appAdmin';
import { etsyKey } from './sources';
import { syncReviews } from './sync';

let running = false;

export async function runReviewSync(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const conn = await db.etsyConnection.findFirst();
		if (!conn || !env.ETSY_KEYSTRING || !env.SHOPIFY_SHOP) {
			console.log('[reviews] skipped, Etsy or Shopify not configured');
			return;
		}

		await syncReviews({
			admin: appAdmin(),
			db,
			shop: env.SHOPIFY_SHOP,
			etsyShopId: conn.shopId,
			etsyApiKey: etsyKey(env.ETSY_KEYSTRING, env.ETSY_SHARED_SECRET ?? ''),
			judgeToken: env.JUDGEME_API_TOKEN || undefined
		});
	} finally {
		running = false;
	}
}
