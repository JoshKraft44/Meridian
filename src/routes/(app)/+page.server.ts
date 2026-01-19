import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getProfitSummary, getRevenueTimeSeries, getFeeBreakdown } from '$lib/server/profit';
import { getPresetRange } from '$lib/utils';
import type { DatePreset } from '$lib/types';

export const load: PageServerLoad = async ({ url }) => {
  const preset = (url.searchParams.get('range') ?? 'thisMonth') as DatePreset;
  const customStart = url.searchParams.get('start');
  const customEnd = url.searchParams.get('end');

  let start: Date;
  let end: Date;

  if (preset === 'custom' && customStart && customEnd) {
    start = new Date(customStart);
    end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
  } else {
    ({ start, end } = getPresetRange(preset));
  }

  const settings = await db.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });

  const [summary, timeSeries, feeBreakdown, payoutAgg, lastSync] = await Promise.all([
    getProfitSummary(start, end, settings.excludeTaxes),
    getRevenueTimeSeries(start, end, settings.excludeTaxes),
    getFeeBreakdown(start, end),
    db.payout.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amountCents: true }
    }),
    db.syncRun.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true }
    })
  ]);

  return {
    preset,
    customStart: customStart ?? '',
    customEnd: customEnd ?? '',
    summary,
    timeSeries,
    feeBreakdown,
    payoutsCents: payoutAgg._sum.amountCents ?? 0,
    lastSync: lastSync?.finishedAt?.toISOString() ?? null
  };
};
