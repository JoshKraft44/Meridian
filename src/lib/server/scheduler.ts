import { runShopifySync } from './shopify/sync';
import { runEtsySync } from './etsy/sync';
import { runMetaSync } from './meta/sync';

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let started = false;

function runAllSyncs(manual = false) {
	runShopifySync(manual).catch((err) => console.error('[sync:shopify] error:', err));
	runEtsySync(manual).catch((err) => console.error('[sync:etsy] error:', err));
	runMetaSync().catch((err) => console.error('[sync:meta] error:', err));
}

export function startScheduler(): void {
	if (started) return;
	started = true;

	setTimeout(() => runAllSyncs(), 30_000);
	setInterval(() => runAllSyncs(), INTERVAL_MS);

	console.log('[scheduler] started, first sync in 30s, then every 6h');
}
