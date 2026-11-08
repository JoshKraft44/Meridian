import { shopifyAdmin } from '../src/lib/server/shopify/admin.ts';

// MCP server runs outside SvelteKit, so env comes straight from process.env
export const adminGraphql = shopifyAdmin({
  shop: process.env.SHOPIFY_SHOP ?? '',
  clientId: process.env.SHOPIFY_CLIENT_ID ?? '',
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? ''
});
