import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '$lib/db';

function verifyHmac(query: URLSearchParams): boolean {
  const hmac = query.get('hmac') ?? '';
  const params = new URLSearchParams();

  for (const [key, value] of query.entries()) {
    if (key !== 'hmac') params.set(key, value);
  }

  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const expected = createHmac('sha256', env.SHOPIFY_CLIENT_SECRET).update(message).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  const params = url.searchParams;
  const code = params.get('code');
  const shop = params.get('shop');
  const state = params.get('state');
  const storedState = cookies.get('shopify_oauth_state');

  if (!code || !shop || !state) error(400, 'Missing OAuth parameters');
  if (state !== storedState) error(403, 'State mismatch — possible CSRF');
  if (!verifyHmac(params)) error(403, 'HMAC verification failed');

  cookies.delete('shopify_oauth_state', { path: '/' });

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
      code
    })
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    error(502, `Token exchange failed: ${body}`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  await db.shopifyConnection.upsert({
    where: { shop },
    create: { shop, accessToken: access_token },
    update: { accessToken: access_token }
  });

  redirect(302, '/?connected=1');
};
