// Store management MCP server (stdio).
// shopify_query is read-only so it can be auto-allowed; anything that writes goes through a separate tool.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { adminGraphql } from './admin.ts';

const server = new McpServer({ name: 'meridian-shopify', version: '0.1.0' });

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function isMutation(query: string) {
  const stripped = query.replace(/#.*$/gm, '');
  return /\bmutation\b/.test(stripped);
}

function toProductGid(id: string) {
  return id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`;
}

function toCents(amount: string | null): number | null {
  return amount == null ? null : Math.round(parseFloat(amount) * 100);
}

function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

server.registerTool(
  'shopify_query',
  {
    description:
      'Run a read-only Shopify Admin GraphQL query (API 2026-10) against the Antler Addiction store. Mutations are rejected here; use shopify_mutate.',
    inputSchema: {
      query: z.string(),
      variables: z.record(z.string(), z.unknown()).optional()
    }
  },
  async ({ query, variables }) => {
    if (isMutation(query)) return text('Mutations are not allowed in shopify_query. Use shopify_mutate.');
    return text(await adminGraphql(query, variables));
  }
);

server.registerTool(
  'shopify_mutate',
  {
    description:
      'Run a Shopify Admin GraphQL mutation (API 2026-10). Changes the live store. Check userErrors in the response.',
    inputSchema: {
      mutation: z.string(),
      variables: z.record(z.string(), z.unknown()).optional()
    }
  },
  async ({ mutation, variables }) => text(await adminGraphql(mutation, variables))
);

server.registerTool(
  'find_products',
  {
    description:
      'Search products using Shopify search syntax (e.g. "title:*antler*", "tag:sheds", "status:active"). Returns ids, handles and variant prices.',
    inputSchema: {
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(25)
    }
  },
  async ({ search, limit }) => {
    const result = await adminGraphql(
      `query ($q: String, $n: Int!) {
        products(first: $n, query: $q) {
          nodes {
            id title handle status tags
            variants(first: 50) { nodes { id title sku price compareAtPrice inventoryQuantity } }
          }
        }
      }`,
      { q: search ?? null, n: limit }
    );
    if (result.errors) return text(result);
    return text(result.data.products.nodes);
  }
);

const productsWithVariants = `query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id title
      variants(first: 100) { nodes { id title price compareAtPrice } }
    }
  }
}`;

const bulkUpdateVariants = `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price compareAtPrice }
    userErrors { field message }
  }
}`;

server.registerTool(
  'set_sale',
  {
    description:
      'Put products on sale with a crossed-out original price. Sets compareAtPrice to the original and lowers price. ' +
      'If a variant is already on sale, the existing compareAtPrice is kept as the original. ' +
      'Returns a preview unless apply is true.',
    inputSchema: {
      productIds: z.array(z.string()).min(1),
      percentOff: z.number().gt(0).lt(100).optional(),
      salePrice: z.string().optional().describe('Fixed sale price for every variant, e.g. "49.99"'),
      apply: z.boolean().default(false)
    }
  },
  async ({ productIds, percentOff, salePrice, apply }) => {
    if ((percentOff == null) === (salePrice == null)) return text('Pass exactly one of percentOff or salePrice.');

    const result = await adminGraphql(productsWithVariants, { ids: productIds.map(toProductGid) });
    if (result.errors) return text(result);

    const plan = [];
    for (const product of result.data.nodes) {
      if (!product) continue;

      const variants = product.variants.nodes.map((v: any) => {
        const originalCents = toCents(v.compareAtPrice) ?? toCents(v.price)!;
        const saleCents =
          percentOff != null ? Math.round(originalCents * (1 - percentOff / 100)) : toCents(salePrice!)!;
        return {
          id: v.id,
          title: v.title,
          before: { price: v.price, compareAtPrice: v.compareAtPrice },
          after: { price: fromCents(saleCents), compareAtPrice: fromCents(originalCents) },
          skipped: saleCents >= originalCents ? 'sale price not below original' : undefined
        };
      });

      plan.push({ productId: product.id, title: product.title, variants });
    }

    if (!apply) return text({ preview: true, plan });

    const results = [];
    for (const product of plan) {
      const updates = product.variants
        .filter((v: any) => !v.skipped)
        .map((v: any) => ({ id: v.id, price: v.after.price, compareAtPrice: v.after.compareAtPrice }));
      if (updates.length === 0) continue;

      const res = await adminGraphql(bulkUpdateVariants, { productId: product.productId, variants: updates });
      results.push({ title: product.title, response: res.data?.productVariantsBulkUpdate ?? res });
    }
    return text({ applied: true, results });
  }
);

server.registerTool(
  'end_sale',
  {
    description:
      'End a sale: restores price to the compareAtPrice and clears compareAtPrice. Returns a preview unless apply is true.',
    inputSchema: {
      productIds: z.array(z.string()).min(1),
      apply: z.boolean().default(false)
    }
  },
  async ({ productIds, apply }) => {
    const result = await adminGraphql(productsWithVariants, { ids: productIds.map(toProductGid) });
    if (result.errors) return text(result);

    const plan = [];
    for (const product of result.data.nodes) {
      if (!product) continue;
      const variants = product.variants.nodes
        .filter((v: any) => v.compareAtPrice)
        .map((v: any) => ({
          id: v.id,
          title: v.title,
          before: { price: v.price, compareAtPrice: v.compareAtPrice },
          after: { price: v.compareAtPrice, compareAtPrice: null }
        }));
      if (variants.length > 0) plan.push({ productId: product.id, title: product.title, variants });
    }

    if (!apply) return text({ preview: true, plan });

    const results = [];
    for (const product of plan) {
      const updates = product.variants.map((v: any) => ({ id: v.id, ...v.after }));
      const res = await adminGraphql(bulkUpdateVariants, { productId: product.productId, variants: updates });
      results.push({ title: product.title, response: res.data?.productVariantsBulkUpdate ?? res });
    }
    return text({ applied: true, results });
  }
);

await server.connect(new StdioServerTransport());
