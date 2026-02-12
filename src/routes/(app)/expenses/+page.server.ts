import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { ExpenseCategoryType } from '@prisma/client';

export const load: PageServerLoad = async () => {
  const expenses = await db.expenseEvent.findMany({
    orderBy: { eventDate: 'desc' },
    take: 100
  });

  return {
    expenses: expenses.map((e) => ({
      id: e.id,
      eventDate: e.eventDate.toISOString(),
      category: e.category,
      amountCents: e.amountCents,
      notes: e.notes
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
  }
} satisfies Actions;
