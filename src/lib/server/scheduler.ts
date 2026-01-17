import { runShopifySync } from './shopify/sync';

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  // First sync 30s after startup
  setTimeout(() => {
    runShopifySync().catch((err) => console.error('[sync] error:', err));
  }, 30_000);

  // Then every 6 hours
  setInterval(() => {
    runShopifySync().catch((err) => console.error('[sync] error:', err));
  }, INTERVAL_MS);

  console.log('[scheduler] started, first sync in 30s, then every 6h');
}
