import { env } from '$env/dynamic/private';
import { shopifyAdmin, type AdminGraphql } from './admin';

let admin: AdminGraphql | null = null;

// Client-credentials admin client for the running app (write scopes, no DB token needed)
export function appAdmin(): AdminGraphql {
  admin ??= shopifyAdmin({
    shop: env.SHOPIFY_SHOP ?? '',
    clientId: env.SHOPIFY_CLIENT_ID ?? '',
    clientSecret: env.SHOPIFY_CLIENT_SECRET ?? ''
  });
  return admin;
}
