import { createHmac } from 'crypto';
import { env } from '$env/dynamic/private';

const API_VERSION = '2025-01';

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  total_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money?: { amount: string };
  };
  currency: string;
  email?: string;
  billing_address?: {
    first_name?: string;
    last_name?: string;
  };
  refunds: {
    id: number;
    processed_at: string;
    transactions: {
      id: number;
      kind: string;
      status: string;
      amount: string;
    }[];
  }[];
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
  }[];
}

export interface ShopifyPayout {
  id: number;
  status: string;
  amount: string;
  currency: string;
  date: string;
  summary: {
    adjustments_fee_amount: string;
    charges_fee_amount: string;
    refunds_fee_amount: string;
  };
}

export interface ShopifyBalanceTransaction {
  id: number;
  type: string;
  source_order_id: number | null;
  currency: string;
  amount: string;
  fee: string;
  net: string;
  created_at: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
    console.warn(`[shopify] rate limited, retrying after ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return shopifyFetch(url, token);
  }

  return res;
}

function getNextPageUrl(linkHeader: string): string | null {
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export async function* fetchAllOrders(
  shop: string,
  token: string,
  since?: string
): AsyncGenerator<ShopifyOrder[]> {
  const query = new URLSearchParams({
    limit: '250',
    status: 'any',
    ...(since && { updated_at_min: since })
  });

  let url: string | null =
    `https://${shop}/admin/api/${API_VERSION}/orders.json?${query}`;

  while (url) {
    const res = await shopifyFetch(url, token);
    if (!res.ok) throw new Error(`shopify api error: ${res.status}`);

    const data: { orders: ShopifyOrder[] } = await res.json();
    if (data.orders.length > 0) yield data.orders;

    url = getNextPageUrl(res.headers.get('Link') || '');
    if (url) await sleep(500);
  }
}

export async function* fetchAllPayouts(
  shop: string,
  token: string
): AsyncGenerator<ShopifyPayout[]> {
  let url: string | null =
    `https://${shop}/admin/api/${API_VERSION}/shopify_payments/payouts.json?limit=250`;

  while (url) {
    const res = await shopifyFetch(url, token);

    if (res.status === 403) {
      console.warn('[shopify] Shopify Payments not available (403), skipping payouts');
      return;
    }
    if (!res.ok) throw new Error(`shopify api error: ${res.status}`);

    const data: { payouts: ShopifyPayout[] } = await res.json();
    if (data.payouts.length > 0) yield data.payouts;

    url = getNextPageUrl(res.headers.get('Link') || '');
    if (url) await sleep(500);
  }
}

export async function* fetchAllBalanceTransactions(
  shop: string,
  token: string
): AsyncGenerator<ShopifyBalanceTransaction[]> {
  let url: string | null =
    `https://${shop}/admin/api/${API_VERSION}/shopify_payments/balance/transactions.json?limit=250`;

  while (url) {
    const res = await shopifyFetch(url, token);

    if (res.status === 403) {
      console.warn('[shopify] Balance transactions not available (403), skipping');
      return;
    }
    if (!res.ok) throw new Error(`shopify api error: ${res.status}`);

    const data: { transactions: ShopifyBalanceTransaction[] } = await res.json();
    if (data.transactions.length > 0) yield data.transactions;

    url = getNextPageUrl(res.headers.get('Link') || '');
    if (url) await sleep(500);
  }
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const hash = createHmac('sha256', env.SHOPIFY_CLIENT_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hash === signature;
}
