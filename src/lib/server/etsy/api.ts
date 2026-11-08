import { ETSY_KEYSTRING, ETSY_SHARED_SECRET } from '$env/static/private';

const BASE = 'https://openapi.etsy.com/v3';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

async function etsyFetch(path: string, token: string, params?: Record<string, string>): Promise<unknown> {
	const url = new URL(`${BASE}${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString(), {
		headers: {
			'x-api-key': `${ETSY_KEYSTRING}:${ETSY_SHARED_SECRET}`,
			Authorization: `Bearer ${token}`,
		},
	});

	if (res.status === 429) {
		const retry = parseInt(res.headers.get('Retry-After') ?? '5', 10);
		await new Promise((r) => setTimeout(r, retry * 1000));
		return etsyFetch(path, token, params);
	}

	if (!res.ok) throw new Error(`Etsy API ${res.status} ${path}: ${await res.text()}`);
	return res.json();
}

export interface EtsyMoney {
	amount: number;
	divisor: number;
	currency_code: string;
}

export interface EtsyTransaction {
	transaction_id: number;
	title: string;
	listing_id: number | null;
	quantity: number;
	sku: string | null;
	price: EtsyMoney;
	shipping_cost: EtsyMoney;
	variations: Array<{ formatted_value: string }>;
	product_data: { product_id: number; sku: string | null } | null;
}

export interface EtsyReceipt {
	receipt_id: number;
	status: string;
	payment_method: string;
	buyer_email: string;
	name: string;
	first_line: string;
	second_line: string | null;
	city: string;
	state: string;
	zip: string;
	country_iso: string;
	create_timestamp: number;
	update_timestamp: number;
	is_refunded: boolean;
	grandtotal: EtsyMoney;
	subtotal: EtsyMoney;
	total_shipping_cost: EtsyMoney;
	total_tax_cost: EtsyMoney;
	discount_amt: EtsyMoney;
	transactions: EtsyTransaction[];
}

export interface EtsyListing {
	listing_id: number;
	title: string;
	description: string;
	state: string;
	tags: string[];
	sku: string[];
	price: EtsyMoney;
	images: Array<{ url_fullxfull: string; rank: number; alt_text: string | null }>;
}

export async function* fetchAllReceipts(
	shopId: string,
	token: string,
	since?: Date,
): AsyncGenerator<EtsyReceipt[]> {
	let offset = 0;
	const limit = 100;
	const params: Record<string, string> = {
		limit: String(limit),
		'includes[]': 'Transactions',
	};
	if (since) params.min_last_modified = String(Math.floor(since.getTime() / 1000));

	while (true) {
		params.offset = String(offset);
		const data = (await etsyFetch(`/application/shops/${shopId}/receipts`, token, params)) as {
			results: EtsyReceipt[];
		};
		if (!data.results?.length) break;
		yield data.results;
		if (data.results.length < limit) break;
		offset += limit;
	}
}

export async function* fetchAllListings(
	shopId: string,
	token: string,
): AsyncGenerator<EtsyListing[]> {
	let offset = 0;
	const limit = 100;

	while (true) {
		const data = (await etsyFetch(`/application/shops/${shopId}/listings/active`, token, {
			limit: String(limit),
			offset: String(offset),
			'includes[]': 'Images',
		})) as { results: EtsyListing[] };
		if (!data.results?.length) break;
		yield data.results;
		if (data.results.length < limit) break;
		offset += limit;
	}
}

export async function getShopForUser(
	userId: string,
	token: string,
): Promise<{ shop_id: number; shop_name: string }> {
	const data = (await etsyFetch(`/application/users/${userId}/shops`, token)) as {
		shop_id: number;
		shop_name: string;
	};
	return data;
}

export async function getMe(token: string): Promise<{ user_id: number }> {
	const data = (await etsyFetch('/application/users/me', token)) as { user_id: number };
	return data;
}

export async function exchangeCode(
	code: string,
	codeVerifier: string,
	redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: ETSY_KEYSTRING,
			redirect_uri: redirectUri,
			code,
			code_verifier: codeVerifier,
		}),
	});
	if (!res.ok) throw new Error(`Etsy token exchange failed: ${await res.text()}`);
	return res.json();
}

export async function refreshAccessToken(
	refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: ETSY_KEYSTRING,
			refresh_token: refreshToken,
		}),
	});
	if (!res.ok) throw new Error(`Etsy token refresh failed: ${await res.text()}`);
	return res.json();
}
