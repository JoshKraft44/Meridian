import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login');

  const settings = await db.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });

  return {
    user: locals.user,
    accentColor: settings.accentColor
  };
};
