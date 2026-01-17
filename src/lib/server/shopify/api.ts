import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

const API_VERSION = '2025-01';

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  total_price: string;
  total_tax: string;
  currency: string;
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
  }[];
}

export interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  refund_line_items: {
    id: number;
    line_item_id: number;
    quantity: number;
    restock_type: string;
  }[];
  transactions: {
    id: number;
    type: string;
    amount: string;
    currency: string;
  }[];
}

export interface ShopyPayout {
  id: string;
  status: string;
  payout_details: {
    summary: {
      adjustments_fee_amount: string;
      charges_fee_amount: string;
      refunds_fee_amount: string;
      reserved_funds_fee_amount: string;
    };
  };
  currency: string;
  deposited_at: string;
}

export interface ShopifyBalanceTransaction {
  id: string;
  type: string;
  source_order_id?: string;
  currency: string;
  amount: string;
  fee: string;
  net: string;
  created_at: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function* fetchAllOrders(
  token: string,
  since?: string
): AsyncGenerator<ShopifyOrder[]> {
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = new URLSearchParams({
    limit: '250',
    fields: 'id,name,created_at,financial_status,total_price,total_tax,currency,line_items',
    ...(since && { updated_at_min: since })
  });

  while (hasNextPage) {
    const url = `https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/orders.json?${query}`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      console.warn(`[shopify] rate limited, retrying after ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`shopify api error: ${response.status}`);
    }

    const data: { orders: ShopifyOrder[] } = await response.json();
    yield data.orders;

    const linkHeader = response.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      cursor = nextUrl.searchParams.get('limit_key');
      hasNextPage = !!cursor;
    } else {
      hasNextPage = false;
    }

    await sleep(500);
  }
}

async function* fetchAllRefunds(token: string): AsyncGenerator<ShopifyRefund[]> {
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = new URLSearchParams({
    limit: '250',
    fields: 'id,order_id,created_at,refund_line_items,transactions'
  });

  while (hasNextPage) {
    const url = `https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/refunds.json?${query}`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`shopify api error: ${response.status}`);
    }

    const data: { refunds: ShopifyRefund[] } = await response.json();
    yield data.refunds;

    const linkHeader = response.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      cursor = nextUrl.searchParams.get('limit_key');
      hasNextPage = !!cursor;
    } else {
      hasNextPage = false;
    }

    await sleep(500);
  }
}

async function* fetchAllPayouts(token: string): AsyncGenerator<ShopyPayout[]> {
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = new URLSearchParams({
    limit: '250'
  });

  while (hasNextPage) {
    const url = `https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/shopify_payments/payouts.json?${query}`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      await sleep(retryAfter * 1000);
      continue;
    }

    if (response.status === 403) {
      console.warn('[shopify] Shopify Payments not available (403), skipping payouts');
      return;
    }

    if (!response.ok) {
      throw new Error(`shopify api error: ${response.status}`);
    }

    const data: { payouts: ShopyPayout[] } = await response.json();
    yield data.payouts;

    const linkHeader = response.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      cursor = nextUrl.searchParams.get('limit_key');
      hasNextPage = !!cursor;
    } else {
      hasNextPage = false;
    }

    await sleep(500);
  }
}

async function* fetchAllBalanceTransactions(
  token: string,
  since?: string
): AsyncGenerator<ShopifyBalanceTransaction[]> {
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = new URLSearchParams({
    limit: '250',
    ...(since && { created_at_min: since })
  });

  while (hasNextPage) {
    const url = `https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/shopify_payments/balance/transactions.json?${query}`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      await sleep(retryAfter * 1000);
      continue;
    }

    if (response.status === 403) {
      console.warn('[shopify] Shopify Payments not available (403), skipping balance transactions');
      return;
    }

    if (!response.ok) {
      throw new Error(`shopify api error: ${response.status}`);
    }

    const data: { transactions: ShopifyBalanceTransaction[] } = await response.json();
    yield data.transactions;

    const linkHeader = response.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      cursor = nextUrl.searchParams.get('limit_key');
      hasNextPage = !!cursor;
    } else {
      hasNextPage = false;
    }

    await sleep(500);
  }
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const hash = createHmac('sha256', env.SHOPIFY_CLIENT_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hash === signature;
}

export { fetchAllOrders, fetchAllRefunds, fetchAllPayouts, fetchAllBalanceTransactions };
