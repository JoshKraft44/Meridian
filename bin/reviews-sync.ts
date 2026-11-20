// Sync Etsy + Judge.me reviews into Shopify by hand (the server also runs it every 6h).
//   npm run reviews:sync            write to the store
//   npm run reviews:sync -- --dry   fetch, merge and match only

import { PrismaClient } from '@prisma/client';
import { shopifyAdmin } from '../src/lib/server/shopify/admin.ts';
import { etsyKey } from '../src/lib/server/reviews/sources.ts';
import { syncReviews } from '../src/lib/server/reviews/sync.ts';

const db = new PrismaClient();
const env = process.env;

const conn = await db.etsyConnection.findFirst();
if (!conn) throw new Error('No Etsy connection in the DB');

const { reviews } = await syncReviews({
  admin: shopifyAdmin({ shop: env.SHOPIFY_SHOP ?? '', clientId: env.SHOPIFY_CLIENT_ID ?? '', clientSecret: env.SHOPIFY_CLIENT_SECRET ?? '' }),
  db,
  shop: env.SHOPIFY_SHOP ?? '',
  etsyShopId: conn.shopId,
  etsyApiKey: etsyKey(env.ETSY_KEYSTRING ?? '', env.ETSY_SHARED_SECRET ?? ''),
  judgeToken: env.JUDGEME_API_TOKEN || undefined,
  dryRun: process.argv.includes('--dry')
});

if (process.argv.includes('--dry')) {
  const named = reviews.filter((r) => r.author).length;
  const photos = reviews.filter((r) => r.image).length;
  console.log(`${named} with a name, ${photos} with a photo, ${reviews.filter((r) => r.source === 'site').length} from the site`);
  for (const r of reviews.slice(0, 5)) console.log(r.date, r.source, r.rating, r.author || '-', r.productId ?? '-', r.body.slice(0, 60));
}

await db.$disconnect();
