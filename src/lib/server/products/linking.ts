import { db } from '$lib/db';

export async function linkProducts(productIdA: string, productIdB: string) {
  const [a, b] = await Promise.all([
    db.product.findUnique({
      where: { id: productIdA },
      select: { id: true, platform: true, linkedProductId: true }
    }),
    db.product.findUnique({
      where: { id: productIdB },
      select: { id: true, platform: true, linkedProductId: true }
    })
  ]);

  if (!a || !b) throw new Error('Product not found');
  if (a.platform === b.platform) throw new Error('Cannot link products on the same platform');
  if (a.linkedProductId || b.linkedProductId) throw new Error('Product already linked');

  // check reverse links too
  const [reverseA, reverseB] = await Promise.all([
    db.product.findFirst({ where: { linkedProductId: a.id } }),
    db.product.findFirst({ where: { linkedProductId: b.id } })
  ]);
  if (reverseA || reverseB) throw new Error('Product already linked');

  // convention: shopify product points to etsy product
  const [shopify, etsy] = a.platform === 'SHOPIFY' ? [a, b] : [b, a];

  await db.product.update({
    where: { id: shopify.id },
    data: { linkedProductId: etsy.id }
  });
}

export async function unlinkProducts(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, linkedProductId: true }
  });

  if (product?.linkedProductId) {
    await db.product.update({
      where: { id: productId },
      data: { linkedProductId: null }
    });
    return;
  }

  // check reverse direction
  const linker = await db.product.findFirst({ where: { linkedProductId: productId } });
  if (linker) {
    await db.product.update({
      where: { id: linker.id },
      data: { linkedProductId: null }
    });
  }
}

export interface SkuMatch {
  shopify: { id: string; title: string; sku: string; thumbnail: string | null };
  etsy: { id: string; title: string; sku: string; thumbnail: string | null };
}

export async function findSkuMatches(): Promise<SkuMatch[]> {
  const unlinked = await db.product.findMany({
    where: {
      sku: { not: null },
      linkedProductId: null,
      linkedBy: { is: null }
    },
    include: { images: { orderBy: { position: 'asc' }, take: 1 } }
  });

  const shopifyBySku = new Map<string, (typeof unlinked)[0]>();
  const etsyBySku = new Map<string, (typeof unlinked)[0]>();

  for (const p of unlinked) {
    if (!p.sku) continue;
    const normalized = p.sku.trim().toLowerCase();
    if (p.platform === 'SHOPIFY') shopifyBySku.set(normalized, p);
    else etsyBySku.set(normalized, p);
  }

  const matches: SkuMatch[] = [];
  for (const [sku, sp] of shopifyBySku) {
    const ep = etsyBySku.get(sku);
    if (ep) {
      matches.push({
        shopify: { id: sp.id, title: sp.title, sku: sp.sku!, thumbnail: sp.images[0]?.src ?? null },
        etsy: { id: ep.id, title: ep.title, sku: ep.sku!, thumbnail: ep.images[0]?.src ?? null }
      });
    }
  }

  return matches;
}
