import { runShopifySync } from './shopify/sync';
import { runEtsySync } from './etsy/sync';
import { runMetaSync } from './meta/sync';
import { publishDuePosts } from './meta/publish';

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let started = false;

function runAllSyncs(manual = false) {
	runShopifySync(manual).catch((err) => console.error('[sync:shopify] error:', err));
	runEtsySync(manual).catch((err) => console.error('[sync:etsy] error:', err));
}

export function startScheduler(): void {
	if (started) return;
	started = true;

	setTimeout(() => runAllSyncs(), 30_000);
	setInterval(() => runAllSyncs(), INTERVAL_MS);

	// Ad spend moves hourly while campaigns run, and Meta's API is cheap to poll
	const syncMeta = () => runMetaSync().catch((err) => console.error('[sync:meta] error:', err));
	setTimeout(syncMeta, 30_000);
	setInterval(syncMeta, 60 * 60_000);

	// Scheduled posts go out within a minute of their time
	setInterval(() => {
		publishDuePosts().catch((err) => console.error('[publish] error:', err));
	}, 60_000);

	console.log('[scheduler] started, first sync in 30s, then every 6h (meta hourly)');
}
