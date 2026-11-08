// Admin GraphQL client using the client credentials grant (app is owned by the same org as the store),
// so no OAuth round trip or DB lookup is needed. Tokens last 24h.
// Takes credentials as arguments so the MCP server and bin/ scripts can use it outside SvelteKit.

const API_VERSION = '2026-10';

export interface ShopifyAppCreds {
  shop: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphqlResult {
  data?: any;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: unknown;
}

export type AdminGraphql = (query: string, variables?: Record<string, unknown>) => Promise<GraphqlResult>;

export function shopifyAdmin(creds: ShopifyAppCreds): AdminGraphql {
  let token: string | null = null;
  let tokenExpiresAt = 0;

  async function getToken(): Promise<string> {
    if (token && Date.now() < tokenExpiresAt) return token;

    if (!creds.shop || !creds.clientId || !creds.clientSecret) {
      throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set');
    }

    const res = await fetch(`https://${creds.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret
      })
    });

    if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);

    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = data.access_token;
    // refresh a few minutes early
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    return token;
  }

  return async function adminGraphql(query, variables) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(`https://${creds.shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': await getToken()
        },
        body: JSON.stringify({ query, variables })
      });

      if (res.status === 401) {
        token = null;
        continue;
      }

      if (res.status === 429) {
        await sleep(1000 * attempt);
        continue;
      }

      if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);

      const body = (await res.json()) as GraphqlResult;
      const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < 4) {
        await sleep(1000 * attempt);
        continue;
      }

      return body;
    }

    throw new Error('Shopify request failed after retries');
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
