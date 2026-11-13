import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { randomBytes, createHash } from 'crypto';
import { env } from '$env/dynamic/private';
// listings_w is for editing listing descriptions, everything else is read only
const SCOPES = ['transactions_r', 'listings_r', 'listings_w', 'profile_r', 'shops_r'].join(' ');

export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const codeVerifier = randomBytes(32).toString('base64url');
	const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
	const state = randomBytes(16).toString('hex');

	cookies.set('etsy_verifier', codeVerifier, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });
	cookies.set('etsy_state', state, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });

	const callbackUrl = `${process.env.PUBLIC_APP_URL}/api/etsy/callback`;

	const authUrl =
		`https://www.etsy.com/oauth/connect` +
		`?response_type=code` +
		`&client_id=${env.ETSY_KEYSTRING}` +
		`&redirect_uri=${encodeURIComponent(callbackUrl)}` +
		`&scope=${encodeURIComponent(SCOPES)}` +
		`&state=${state}` +
		`&code_challenge=${codeChallenge}` +
		`&code_challenge_method=S256`;

	redirect(302, authUrl);
};
