import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db';
import { exchangeCode, getMe, getShopForUser } from '$lib/server/etsy/api';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('etsy_state');
	const codeVerifier = cookies.get('etsy_verifier');

	cookies.delete('etsy_state', { path: '/' });
	cookies.delete('etsy_verifier', { path: '/' });

	if (!code || !state || state !== storedState || !codeVerifier) {
		return new Response('Invalid OAuth state', { status: 400 });
	}

	const callbackUrl = `${process.env.PUBLIC_APP_URL}/api/etsy/callback`;

	let tokens;
	try {
		tokens = await exchangeCode(code, codeVerifier, callbackUrl);
	} catch (err) {
		return new Response(`Token exchange failed: ${err}`, { status: 500 });
	}

	const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

	let me, shop;
	try {
		me = await getMe(tokens.access_token);
		shop = await getShopForUser(String(me.user_id), tokens.access_token);
	} catch (err) {
		return new Response(`Failed to fetch shop info: ${err}`, { status: 500 });
	}

	await db.etsyConnection.upsert({
		where: { shopId: String(shop.shop_id) },
		create: {
			shopId: String(shop.shop_id),
			shopName: shop.shop_name,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt,
		},
		update: {
			shopName: shop.shop_name,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt,
		},
	});

	redirect(302, '/settings?etsy=connected');
};
