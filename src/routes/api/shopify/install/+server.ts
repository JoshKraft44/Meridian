import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { createHmac } from 'crypto';

const SCOPES = 'read_orders,read_finances,read_shipping';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const shop = url.searchParams.get('shop') ?? env.SHOPIFY_SHOP;
  if (!shop) error(400, 'Missing shop parameter');

  const nonce = createHmac('sha256', env.SESSION_SECRET)
    .update(Date.now().toString())
    .digest('hex')
    .slice(0, 16);

  cookies.set('shopify_oauth_state', nonce, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600
  });

  const callbackUrl = `${pubEnv.PUBLIC_APP_URL}/api/shopify/callback`;

  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', env.SHOPIFY_CLIENT_ID);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('state', nonce);

  redirect(302, authUrl.toString());
};
