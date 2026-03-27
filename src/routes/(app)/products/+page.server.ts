import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import type { PlatformFilter } from '$lib/types';
import { Platform, type Prisma } from '@prisma/client';

export const load: PageServerLoad = async ({ url }) => {
  const search = url.searchParams.get('q') ?? '';
  const platform = (url.searchParams.get('platform') ?? 'all') as PlatformFilter;
  const linked = url.searchParams.get('linked'); // 'yes' | 'no' | null
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const perPage = 24;

  const where: Prisma.ProductWhereInput = {
    ...(platform !== 'all'
      ? { platform: platform === 'shopify' ? Platform.SHOPIFY : Platform.ETSY }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
            { platformProductId: { contains: search } }
          ]
        }
      : {}),
    ...(linked === 'yes'
      ? { OR: [{ linkedProductId: { not: null } }, { linkedBy: { isNot: null } }] }
      : linked === 'no'
        ? { AND: [{ linkedProductId: null }, { linkedBy: { is: null } }] }
        : {})
  };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        linkedProduct: { select: { id: true, platform: true, title: true } },
        linkedBy: { select: { id: true, platform: true, title: true } }
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage
    }),
    db.product.count({ where })
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      platform: p.platform,
      platformProductId: p.platformProductId,
      title: p.title,
      sku: p.sku,
      status: p.status,
      priceCents: p.priceCents,
      thumbnail: p.images[0]?.src ?? null,
      linkedTo: p.linkedProduct ?? p.linkedBy ?? null
    })),
    search,
    platform,
    linked,
    page,
    totalPages: Math.ceil(total / perPage),
    total
  };
};
