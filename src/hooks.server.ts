import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readSession } from '$lib/server/auth';
import { verifySessionToken } from '$lib/server/shopify/sessionToken';
import { startScheduler } from '$lib/server/scheduler';

startScheduler();

// Inside the Shopify admin there are no Meridian cookies (third-party cookies are blocked
// in the iframe), so App Bridge's session token stands in for the login.
function shopifyAdminUser(authorization: string | null) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET || !env.SHOPIFY_SHOP) return null;

  const claims = verifySessionToken(token, {
    clientId: env.SHOPIFY_CLIENT_ID,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
    shop: env.SHOPIFY_SHOP
  });
  return claims ? { username: `shopify:${claims.sub}` } : null;
}

export const handle: Handle = async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('session');

  if (sessionCookie) {
    const user = readSession(sessionCookie);
    if (user) {
      event.locals.user = user;
    }
  }

  if (!event.url.pathname.startsWith('/studio')) return resolve(event);

  // The image studio is the one part of Meridian that opens inside the Shopify admin
  event.locals.user ??= shopifyAdminUser(event.request.headers.get('authorization'));

  const embedded = event.url.searchParams.has('host') || event.url.searchParams.get('embedded') === '1';
  const response = await resolve(event, {
    // App Bridge has to be the first script in the head, so it's injected rather than added via svelte:head
    transformPageChunk: embedded
      ? ({ html }) =>
          html.replace(
            '<head>',
            `<head>\n    <meta name="shopify-api-key" content="${env.SHOPIFY_CLIENT_ID}" />\n    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`
          )
      : undefined
  });

  response.headers.set('Content-Security-Policy', `frame-ancestors https://${env.SHOPIFY_SHOP} https://admin.shopify.com;`);
  // Lets App Bridge fetch a fresh token and retry once when a request comes back 401
  if (response.status === 401) response.headers.set('X-Shopify-Retry-Invalid-Session-Request', '1');
  return response;
};
