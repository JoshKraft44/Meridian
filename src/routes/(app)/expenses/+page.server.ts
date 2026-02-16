import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { ExpenseCategoryType, BillingFrequency, Platform } from '@prisma/client';

export const load: PageServerLoad = async () => {
  const [expenses, subscriptions] = await Promise.all([
    db.expenseEvent.findMany({
      orderBy: { eventDate: 'desc' },
      take: 100
    }),
    db.subscription.findMany({
      orderBy: { startDate: 'desc' }
    })
  ]);

  return {
    expenses: expenses.map((e) => ({
      id: e.id,
      eventDate: e.eventDate.toISOString(),
      category: e.category,
      amountCents: e.amountCents,
      notes: e.notes
    })),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      amountCents: s.amountCents,
      frequency: s.frequency,
      platform: s.platform,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate?.toISOString() ?? null,
      notes: s.notes
    }))
  };
};

export const actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const dateStr = form.get('date') as string;
    const category = form.get('category') as string;
    const amountStr = form.get('amount') as string;
    const notes = (form.get('notes') as string) || null;

    if (!dateStr || !category || !amountStr) {
      return fail(400, { error: 'Date, category, and amount are required' });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return fail(400, { error: 'Amount must be a positive number' });
    }

    if (!Object.values(ExpenseCategoryType).includes(category as ExpenseCategoryType)) {
      return fail(400, { error: 'Invalid category' });
    }

    await db.expenseEvent.create({
      data: {
        eventDate: new Date(dateStr),
        category: category as ExpenseCategoryType,
        amountCents: Math.round(amount * 100),
        notes
      }
    });

    return { created: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    if (!id) return fail(400, { error: 'Missing id' });

    await db.expenseEvent.delete({ where: { id } });
    return { deleted: true };
  },

  createSubscription: async ({ request }) => {
    const form = await request.formData();
    const name = form.get('name') as string;
    const amountStr = form.get('amount') as string;
    const frequency = form.get('frequency') as string;
    const startStr = form.get('startDate') as string;
    const endStr = form.get('endDate') as string;
    const platformStr = form.get('platform') as string;
    const ongoing = form.get('ongoing') === 'on';
    const notes = (form.get('notes') as string) || null;

    if (!name || !amountStr || !frequency || !startStr) {
      return fail(400, { subError: 'Name, amount, frequency, and start date are required' });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return fail(400, { subError: 'Amount must be a positive number' });
    }

    if (!Object.values(BillingFrequency).includes(frequency as BillingFrequency)) {
      return fail(400, { subError: 'Invalid frequency' });
    }

    await db.subscription.create({
      data: {
        name,
        amountCents: Math.round(amount * 100),
        frequency: frequency as BillingFrequency,
        platform: platformStr === 'SHOPIFY' ? Platform.SHOPIFY : platformStr === 'ETSY' ? Platform.ETSY : null,
        startDate: new Date(startStr),
        endDate: ongoing ? null : endStr ? new Date(endStr) : null,
        notes
      }
    });

    return { subCreated: true };
  },

  deleteSubscription: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    if (!id) return fail(400, { subError: 'Missing id' });

    await db.subscription.delete({ where: { id } });
    return { subDeleted: true };
  }
} satisfies Actions;
