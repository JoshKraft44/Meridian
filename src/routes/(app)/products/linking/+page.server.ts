import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { Platform } from '@prisma/client';
import { linkProducts, unlinkProducts, findSkuMatches } from '$lib/server/products/linking';

export const load: PageServerLoad = async () => {
  const [skuMatches, counts] = await Promise.all([
    findSkuMatches(),
    db.product.groupBy({
      by: ['platform'],
      _count: true
    })
  ]);

  // count linked products
  const linkedCount = await db.product.count({
    where: {
      OR: [
        { linkedProductId: { not: null } },
        { linkedBy: { isNot: null } }
      ]
    }
  });

  const shopifyCount = counts.find((c) => c.platform === 'SHOPIFY')?._count ?? 0;
  const etsyCount = counts.find((c) => c.platform === 'ETSY')?._count ?? 0;

  return {
    skuMatches,
    linkedCount,
    shopifyCount,
    etsyCount
  };
};

export const actions = {
  confirmMatch: async ({ request }) => {
    const form = await request.formData();
    const shopifyId = form.get('shopifyId') as string;
    const etsyId = form.get('etsyId') as string;
    if (!shopifyId || !etsyId) return fail(400, { error: 'Missing product IDs' });

    try {
      await linkProducts(shopifyId, etsyId);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed to link' });
    }
    return { linked: true };
  },

  unlink: async ({ request }) => {
    const form = await request.formData();
    const productId = form.get('productId') as string;
    if (!productId) return fail(400, { error: 'Missing product ID' });

    await unlinkProducts(productId);
    return { unlinked: true };
  },

  addEtsyProduct: async ({ request }) => {
    const form = await request.formData();
    const title = (form.get('title') as string ?? '').trim();
    const sku = (form.get('sku') as string ?? '').trim();
    const listingId = (form.get('listingId') as string ?? '').trim();
    const imageUrl = (form.get('imageUrl') as string ?? '').trim();

    if (!title || !listingId) {
      return fail(400, { error: 'Title and listing ID are required' });
    }

    const product = await db.product.upsert({
      where: {
        platform_platformProductId: {
          platform: Platform.ETSY,
          platformProductId: listingId
        }
      },
      create: {
        platform: Platform.ETSY,
        platformProductId: listingId,
        title,
        sku: sku || null,
        status: 'active'
      },
      update: {
        title,
        sku: sku || null
      }
    });

    if (imageUrl) {
      await db.productImage.deleteMany({ where: { productId: product.id } });
      await db.productImage.create({
        data: {
          productId: product.id,
          src: imageUrl,
          position: 0
        }
      });
    }

    return { added: true };
  }
} satisfies Actions;
