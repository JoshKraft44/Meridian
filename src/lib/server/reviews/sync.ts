// Mirrors Etsy + Judge.me reviews into Shopify so the theme can show them as one set.
//
// Storage (merchant-owned, readable in Liquid):
//   metaobject type meridian_review           one entry per review
//   shop.metafields.meridian.reviews           every review with text, newest first
//   shop.metafields.meridian.review_highlights short, well-rated picks for carousels
//   shop.metafields.meridian.review_stats      { count, average, ... } across everything
//   product.metafields.meridian.reviews        reviews matched to that product
//
// Etsy is the source of truth for Etsy reviews. Judge.me's imported copies of them are only
// used for the reviewer's name, then dropped so nothing is counted twice.

import type { PrismaClient } from '@prisma/client';
import type { AdminGraphql } from '../shopify/admin';
import { etsyGet, fetchEtsyReviews, fetchJudgeReviews, type Review } from './sources';

const TYPE = 'meridian_review';
const NS = 'meridian';
const HIGHLIGHTS = 24;
const PER_PRODUCT = 50;

export interface ReviewSyncDeps {
	admin: AdminGraphql;
	db: PrismaClient;
	shop: string;
	etsyShopId: string;
	etsyApiKey: string;
	judgeToken?: string;
	dryRun?: boolean;
	log?: (msg: string) => void;
}

interface Stored extends Review {
	productId: string | null;
}

async function gql(admin: AdminGraphql, query: string, variables?: Record<string, unknown>) {
	const res = await admin(query, variables);
	if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
	return res.data;
}

function userErrors(payload: any, what: string) {
	const errs = payload?.userErrors ?? [];
	if (errs.length) throw new Error(`${what}: ${errs.map((e: any) => `${e.field?.join('.') ?? ''} ${e.message}`).join('; ')}`);
}

// --- matching -----------------------------------------------------------

function textKey(s: string) {
	return s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}

function dayGap(a: string, b: string) {
	return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

function mergeSources(etsy: Review[], judge: Awaited<ReturnType<typeof fetchJudgeReviews>>['reviews']) {
	const byText = new Map<string, Review>();
	for (const r of etsy) if (r.body) byText.set(textKey(r.body), r);

	const site: Review[] = [];
	let matched = 0;

	for (const j of judge) {
		const hit =
			(j.body && byText.get(textKey(j.body))) ||
			(j.fromEtsy && etsy.find((e) => !e.body && !j.body && e.rating === j.rating && dayGap(e.date, j.date) <= 1));

		if (hit) {
			if (!hit.author && j.author) hit.author = j.author;
			matched++;
			continue;
		}
		// an Etsy import with no Etsy counterpart was probably removed on Etsy
		if (j.fromEtsy) continue;
		site.push(j);
	}

	return { reviews: [...etsy, ...site], matched };
}

// Shopify image filenames keep the Etsy image id (il_fullxfull.<id>_...), which ties listings to products
const listingCache = new Map<number, string | null>();

async function productIdsForListings(db: PrismaClient, apiKey: string, listingIds: number[], log: (m: string) => void) {
	const images = await db.productImage.findMany({
		where: { filename: { startsWith: 'il_' }, product: { platform: 'SHOPIFY' } },
		select: { filename: true, product: { select: { platformProductId: true, status: true } } }
	});

	const byImage = new Map<string, { id: string; active: boolean }>();
	for (const img of images) {
		const id = img.filename?.match(/^il_[a-z0-9]+\.(\d+)_/i)?.[1];
		if (id) byImage.set(id, { id: img.product.platformProductId, active: img.product.status === 'active' });
	}

	let looked = 0;
	for (const listingId of listingIds) {
		if (listingCache.has(listingId)) continue;
		looked++;

		let found: string | null = null;
		try {
			const res = await etsyGet<{ results: { listing_image_id: number }[] }>(`/listings/${listingId}/images`, apiKey);
			const votes = new Map<string, number>();
			for (const img of res.results) {
				const hit = byImage.get(String(img.listing_image_id));
				if (hit) votes.set(hit.id, (votes.get(hit.id) ?? 0) + (hit.active ? 2 : 1));
			}
			found = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
		} catch {
			// deleted listings 404, those reviews just stay shop-level
		}
		listingCache.set(listingId, found ? `gid://shopify/Product/${found}` : null);
	}

	if (looked) log(`matched ${looked} new Etsy listings against Shopify images`);
}

async function productIdsForHandles(admin: AdminGraphql, handles: string[]) {
	const out = new Map<string, string>();
	for (let i = 0; i < handles.length; i += 25) {
		const chunk = handles.slice(i, i + 25);
		const query = chunk.map((h) => `handle:${JSON.stringify(h)}`).join(' OR ');
		const data = await gql(admin, `query($q: String!) { products(first: 25, query: $q) { nodes { id handle } } }`, { q: query });
		for (const p of data.products.nodes) out.set(p.handle, p.id);
	}
	return out;
}

// --- Shopify writes -----------------------------------------------------

async function ensureDefinitions(admin: AdminGraphql): Promise<string> {
	let data = await gql(admin, `{ metaobjectDefinitionByType(type: "${TYPE}") { id } }`);
	let defId: string | undefined = data.metaobjectDefinitionByType?.id;

	if (!defId) {
		const text = (key: string, name: string) => ({ key, name, type: 'single_line_text_field' });
		data = await gql(
			admin,
			`mutation($d: MetaobjectDefinitionCreateInput!) {
				metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message } }
			}`,
			{
				d: {
					type: TYPE,
					name: 'Review',
					description: 'Synced from Etsy and Judge.me by Meridian. Edits here get overwritten.',
					displayNameKey: 'author',
					access: { storefront: 'PUBLIC_READ' },
					fieldDefinitions: [
						text('source', 'Source'),
						{ key: 'rating', name: 'Rating', type: 'number_integer' },
						text('title', 'Title'),
						{ key: 'body', name: 'Review', type: 'multi_line_text_field' },
						text('author', 'Reviewer'),
						{ key: 'date', name: 'Date', type: 'date' },
						{ key: 'image', name: 'Photo', type: 'url' },
						{ key: 'product', name: 'Product', type: 'product_reference' }
					]
				}
			}
		);
		userErrors(data.metaobjectDefinitionCreate, 'review definition');
		defId = data.metaobjectDefinitionCreate.metaobjectDefinition.id as string;
	}

	const wanted = [
		{ ownerType: 'SHOP', key: 'reviews', name: 'Reviews' },
		{ ownerType: 'SHOP', key: 'review_highlights', name: 'Review highlights' },
		{ ownerType: 'PRODUCT', key: 'reviews', name: 'Reviews' }
	];

	for (const w of wanted) {
		const found = await gql(
			admin,
			`query($o: MetafieldOwnerType!, $k: String!) { metafieldDefinitions(first: 1, ownerType: $o, namespace: "${NS}", key: $k) { nodes { id } } }`,
			{ o: w.ownerType, k: w.key }
		);
		if (found.metafieldDefinitions.nodes.length) continue;

		const created = await gql(
			admin,
			`mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message } } }`,
			{
				d: {
					name: w.name,
					namespace: NS,
					key: w.key,
					ownerType: w.ownerType,
					type: 'list.metaobject_reference',
					validations: [{ name: 'metaobject_definition_id', value: defId }],
					access: { storefront: 'PUBLIC_READ' }
				}
			}
		);
		userErrors(created.metafieldDefinitionCreate, `${w.ownerType} ${w.key} definition`);
	}

	return defId;
}

function fieldsFor(r: Stored) {
	return [
		{ key: 'source', value: r.source },
		{ key: 'rating', value: String(r.rating) },
		{ key: 'title', value: r.title },
		{ key: 'body', value: r.body },
		{ key: 'author', value: r.author },
		{ key: 'date', value: r.date },
		{ key: 'image', value: r.image ?? '' },
		{ key: 'product', value: r.productId ?? '' }
	];
}

function signature(fields: { key: string; value: string | null }[]) {
	return fields
		.map((f) => `${f.key}=${f.value ?? ''}`)
		.sort()
		.join('|');
}

async function loadExisting(admin: AdminGraphql) {
	const existing = new Map<string, { id: string; sig: string; review: Stored }>();
	let after: string | null = null;

	do {
		const data: any = await gql(
			admin,
			`query($after: String) {
				metaobjects(type: "${TYPE}", first: 250, after: $after) {
					nodes { id handle fields { key value } }
					pageInfo { hasNextPage endCursor }
				}
			}`,
			{ after }
		);

		for (const node of data.metaobjects.nodes) {
			const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x.value ?? '']));
			existing.set(node.handle, {
				id: node.id,
				sig: signature(node.fields),
				review: {
					handle: node.handle,
					source: f.source === 'etsy' ? 'etsy' : 'site',
					rating: Number(f.rating) || 0,
					title: f.title,
					body: f.body,
					author: f.author,
					date: f.date,
					image: f.image || null,
					etsyListingId: null,
					productHandle: null,
					productId: f.product || null
				}
			});
		}

		after = data.metaobjects.pageInfo.hasNextPage ? data.metaobjects.pageInfo.endCursor : null;
	} while (after);

	return existing;
}

async function setMetafields(admin: AdminGraphql, metafields: { ownerId: string; key: string; type: string; value: string }[]) {
	for (let i = 0; i < metafields.length; i += 25) {
		const batch = metafields.slice(i, i + 25).map((m) => ({ ...m, namespace: NS }));
		const data = await gql(
			admin,
			`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
			{ m: batch }
		);
		userErrors(data.metafieldsSet, 'metafieldsSet');
	}
}

function newestFirst(a: Stored, b: Stored) {
	return b.date.localeCompare(a.date) || a.handle.localeCompare(b.handle);
}

// --- run ----------------------------------------------------------------

export async function syncReviews(deps: ReviewSyncDeps) {
	const log = deps.log ?? ((m: string) => console.log(`[reviews] ${m}`));
	const { admin, db } = deps;

	const etsy = await fetchEtsyReviews(deps.etsyShopId, deps.etsyApiKey);
	const judge = await fetchJudgeReviews(admin, { shop: deps.shop, token: deps.judgeToken });
	const { reviews, matched } = mergeSources(etsy, judge.reviews);
	log(`etsy ${etsy.length}, judge.me ${judge.reviews.length} (${matched} were Etsy copies)${judge.complete ? '' : ', judge.me from metafield'}`);

	const listingIds = [...new Set(reviews.map((r) => r.etsyListingId).filter((id): id is number => id !== null))];
	await productIdsForListings(db, deps.etsyApiKey, listingIds, log);
	const handles = [...new Set(reviews.map((r) => r.productHandle).filter((h): h is string => !!h))];
	const byHandle = handles.length ? await productIdsForHandles(admin, handles) : new Map<string, string>();

	const fresh: Stored[] = reviews.map((r) => ({
		...r,
		productId: r.etsyListingId ? (listingCache.get(r.etsyListingId) ?? null) : r.productHandle ? (byHandle.get(r.productHandle) ?? null) : null
	}));

	if (deps.dryRun) {
		const withProduct = fresh.filter((r) => r.productId).length;
		log(`dry run: ${fresh.length} reviews, ${withProduct} tied to a product, nothing written`);
		return { reviews: fresh, written: 0 };
	}

	await ensureDefinitions(admin);
	const existing = await loadExisting(admin);

	let written = 0;
	const ids = new Map<string, string>();
	for (const r of fresh) {
		const fields = fieldsFor(r);
		const prev = existing.get(r.handle);
		if (prev && prev.sig === signature(fields)) {
			ids.set(r.handle, prev.id);
			continue;
		}

		const data = await gql(
			admin,
			`mutation($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!) {
				metaobjectUpsert(handle: $h, metaobject: $m) { metaobject { id } userErrors { field message } }
			}`,
			{ h: { type: TYPE, handle: r.handle }, m: { fields } }
		);
		userErrors(data.metaobjectUpsert, `upsert ${r.handle}`);
		ids.set(r.handle, data.metaobjectUpsert.metaobject.id);
		written++;
	}

	// Without the Judge.me token only the newest page is visible, so older site reviews stay as they were.
	// Etsy is always fetched in full, so Etsy entries that vanished get removed.
	const all = [...fresh];
	const stale: string[] = [];
	for (const [handle, prev] of existing) {
		if (ids.has(handle)) continue;
		if (handle.startsWith('site-') && !judge.complete) {
			all.push(prev.review);
			ids.set(handle, prev.id);
		} else {
			stale.push(prev.id);
		}
	}

	if (stale.length > all.length * 0.2) {
		log(`refusing to delete ${stale.length} entries, looks like a partial fetch`);
	} else {
		for (const id of stale) {
			const data = await gql(admin, `mutation($id: ID!) { metaobjectDelete(id: $id) { userErrors { field message } } }`, { id });
			userErrors(data.metaobjectDelete, 'metaobjectDelete');
		}
	}

	all.sort(newestFirst);
	const withText = all.filter((r) => r.body);
	const highlights = withText.filter((r) => r.rating >= 4 && r.body.length >= 60 && r.body.length <= 600).slice(0, HIGHLIGHTS);
	const average = all.length ? all.reduce((sum, r) => sum + r.rating, 0) / all.length : 0;

	const shopId = (await gql(admin, `{ shop { id } }`)).shop.id as string;
	const ref = (list: Stored[]) => JSON.stringify(list.map((r) => ids.get(r.handle)).filter(Boolean));

	const metafields = [
		{ ownerId: shopId, key: 'reviews', type: 'list.metaobject_reference', value: ref(withText.slice(0, 1024)) },
		{ ownerId: shopId, key: 'review_highlights', type: 'list.metaobject_reference', value: ref(highlights) },
		{
			ownerId: shopId,
			key: 'review_stats',
			type: 'json',
			value: JSON.stringify({
				count: all.length,
				average: Math.round(average * 100) / 100,
				with_text: withText.length,
				photos: all.filter((r) => r.image).length,
				etsy: all.filter((r) => r.source === 'etsy').length,
				site: all.filter((r) => r.source === 'site').length,
				updated_at: new Date().toISOString()
			})
		}
	];

	const byProduct = new Map<string, Stored[]>();
	for (const r of withText) {
		if (!r.productId) continue;
		const list = byProduct.get(r.productId) ?? [];
		list.push(r);
		byProduct.set(r.productId, list);
	}
	for (const [productId, list] of byProduct) {
		metafields.push({ ownerId: productId, key: 'reviews', type: 'list.metaobject_reference', value: ref(list.slice(0, PER_PRODUCT)) });
	}

	await setMetafields(admin, metafields);
	log(`${all.length} reviews (avg ${average.toFixed(2)}), ${written} written, ${stale.length} removed, ${byProduct.size} products`);
	return { reviews: all, written };
}
