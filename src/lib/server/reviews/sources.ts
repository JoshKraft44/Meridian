// Pulls reviews from Etsy (Open API v3, shop reviews need only the app key) and Judge.me.
// Kept free of SvelteKit imports so bin/reviews-sync.ts can run it too.

import type { AdminGraphql } from '../shopify/admin';

export interface Review {
	handle: string; // metaobject handle, stable per source review
	source: 'etsy' | 'site';
	rating: number;
	title: string;
	body: string;
	author: string;
	date: string; // YYYY-MM-DD
	image: string | null;
	etsyListingId: number | null;
	productHandle: string | null; // Judge.me gives a handle, Etsy reviews are matched later
}

interface EtsyReview {
	listing_id: number;
	transaction_id: number;
	rating: number;
	review: string | null;
	image_url_fullxfull: string | null;
	created_timestamp: number;
}

const ETSY_BASE = 'https://openapi.etsy.com/v3/application';

export function etsyKey(keystring: string, secret: string) {
	return `${keystring}:${secret}`;
}

export async function etsyGet<T>(path: string, apiKey: string): Promise<T> {
	for (let attempt = 1; attempt <= 3; attempt++) {
		const res = await fetch(`${ETSY_BASE}${path}`, { headers: { 'x-api-key': apiKey } });
		if (res.status === 429) {
			await new Promise((r) => setTimeout(r, 2000 * attempt));
			continue;
		}
		if (!res.ok) throw new Error(`Etsy ${res.status} ${path}: ${await res.text()}`);
		return (await res.json()) as T;
	}
	throw new Error(`Etsy rate limited on ${path}`);
}

function day(date: Date) {
	return date.toISOString().slice(0, 10);
}

export async function fetchEtsyReviews(shopId: string, apiKey: string): Promise<Review[]> {
	const reviews: Review[] = [];

	for (let offset = 0; ; offset += 100) {
		const page = await etsyGet<{ count: number; results: EtsyReview[] }>(
			`/shops/${shopId}/reviews?limit=100&offset=${offset}`,
			apiKey
		);

		for (const r of page.results) {
			reviews.push({
				handle: `etsy-${r.transaction_id}`,
				source: 'etsy',
				rating: r.rating,
				title: '',
				body: (r.review ?? '').trim(),
				author: '',
				date: day(new Date(r.created_timestamp * 1000)),
				image: r.image_url_fullxfull,
				etsyListingId: r.listing_id,
				productHandle: null
			});
		}

		if (page.results.length < 100 || offset + 100 >= page.count) break;
	}

	return reviews;
}

// Judge.me also imports Etsy reviews; those are flagged so they can be matched up instead of counted twice
export interface JudgeReview extends Review {
	fromEtsy: boolean;
}

function handleFromUrl(url: string | null | undefined) {
	return url?.match(/\/products\/([^/?#]+)/)?.[1] ?? null;
}

// Judge.me fills a missing title with the start of the review, which just repeats it
function judgeTitle(title: string | null | undefined, body: string | null | undefined) {
	const t = (title ?? '').replace(/\s+/g, ' ').trim();
	const b = (body ?? '').replace(/\s+/g, ' ').trim();
	if (!t || b.toLowerCase().startsWith(t.toLowerCase())) return '';
	return t.slice(0, 200);
}

function judgeAuthor(name: string | null | undefined, anonymous: boolean) {
	if (anonymous || !name || name === 'Anonymous') return '';
	return name.trim();
}

// Full history through the private API token, when one is configured
async function judgeFromApi(shop: string, token: string): Promise<JudgeReview[]> {
	const reviews: JudgeReview[] = [];

	for (let page = 1; page < 100; page++) {
		const url = new URL('https://judge.me/api/v1/reviews');
		url.searchParams.set('shop_domain', shop);
		url.searchParams.set('api_token', token);
		url.searchParams.set('per_page', '100');
		url.searchParams.set('page', String(page));

		const res = await fetch(url);
		if (!res.ok) throw new Error(`Judge.me ${res.status}: ${await res.text()}`);
		const data = (await res.json()) as { reviews?: any[] };
		const batch = data.reviews ?? [];

		for (const r of batch) {
			if (r.hidden || r.published === false) continue;
			const picture = (r.pictures ?? []).find((p: any) => !p.hidden);
			reviews.push({
				handle: `site-${r.id}`,
				source: 'site',
				rating: r.rating,
				title: judgeTitle(r.title, r.body),
				body: (r.body ?? '').trim(),
				author: judgeAuthor(r.reviewer?.name, false),
				date: day(new Date(r.created_at)),
				image: picture?.urls?.huge ?? picture?.urls?.original ?? null,
				etsyListingId: null,
				productHandle: r.product_handle ?? null,
				fromEtsy: String(r.source ?? '').toLowerCase().includes('etsy')
			});
		}

		if (batch.length < 100) break;
	}

	return reviews;
}

// Without a token, Judge.me's own storefront metafield still carries the newest page of each list
async function judgeFromMetafield(admin: AdminGraphql): Promise<JudgeReview[]> {
	const res = await admin(`{ shop { metafield(namespace: "judgeme", key: "reviews_grid") { jsonValue } } }`);
	const grid = res.data?.shop?.metafield?.jsonValue;
	if (!grid) return [];

	const seen = new Map<string, JudgeReview>();
	for (const list of ['all_reviews', 'store_reviews', 'product_reviews']) {
		for (const r of grid[list]?.reviews ?? []) {
			if (seen.has(r.uuid)) continue;
			const picture = r.pictures_urls?.[0];
			seen.set(r.uuid, {
				handle: `site-${r.uuid}`,
				source: 'site',
				rating: r.rating,
				title: judgeTitle(r.title, r.body),
				body: (r.body ?? '').trim(),
				author: judgeAuthor(r.reviewer_name, r.is_anonymous_reviewer),
				date: day(new Date(r.created_at)),
				image: picture?.huge ?? picture?.original ?? null,
				etsyListingId: null,
				productHandle: r.is_shop_review ? null : handleFromUrl(r.product_url),
				fromEtsy: (r.transparency_badges ?? []).includes('review_written_in_etsy')
			});
		}
	}

	return [...seen.values()];
}

export async function fetchJudgeReviews(
	admin: AdminGraphql,
	opts: { shop: string; token?: string }
): Promise<{ reviews: JudgeReview[]; complete: boolean }> {
	if (opts.token) return { reviews: await judgeFromApi(opts.shop, opts.token), complete: true };
	return { reviews: await judgeFromMetafield(admin), complete: false };
}
