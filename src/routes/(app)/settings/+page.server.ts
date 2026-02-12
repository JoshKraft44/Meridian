import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const settings = await db.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });

  const connection = await db.shopifyConnection.findFirst({
    select: { shop: true, connectedAt: true, lastSyncedAt: true }
  });

  const lastSync = await db.syncRun.findFirst({
    where: { status: 'SUCCESS' },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true, ordersUpserted: true, payoutsSynced: true }
  });

  return { settings, connection, lastSync };
};

export const actions = {
  updateSettings: async ({ request }) => {
    const form = await request.formData();
    const accentColor = form.get('accentColor') as string;
    const excludeTaxes = form.get('excludeTaxes') === 'on';

    if (!accentColor || !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      return fail(400, { error: 'Invalid accent color' });
    }

    await db.settings.update({
      where: { id: 'singleton' },
      data: { accentColor, excludeTaxesFromGross: excludeTaxes }
    });

    return { saved: true };
  },

  disconnect: async () => {
    await db.shopifyConnection.deleteMany();
    return { disconnected: true };
  }
} satisfies Actions;
