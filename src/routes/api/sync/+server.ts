import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { runShopifySync } from '$lib/server/shopify/sync';
import { runEtsySync } from '$lib/server/etsy/sync';
import { runMetaSync } from '$lib/server/meta/sync';

let syncInProgress = false;
let lastTriggered = 0;
const COOLDOWN_MS = 60_000;

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const now = Date.now();
	if (syncInProgress) {
		return json({ ok: false, message: 'Sync already running' }, { status: 429 });
	}
	if (now - lastTriggered < COOLDOWN_MS) {
		const wait = Math.ceil((COOLDOWN_MS - (now - lastTriggered)) / 1000);
		return json({ ok: false, message: `Wait ${wait}s before triggering again` }, { status: 429 });
	}

	syncInProgress = true;
	lastTriggered = now;

	Promise.all([
		runShopifySync(true),
		runEtsySync(true),
		runMetaSync(),
	])
		.catch(console.error)
		.finally(() => {
			syncInProgress = false;
		});

	return json({ ok: true, message: 'Sync started' });
};
