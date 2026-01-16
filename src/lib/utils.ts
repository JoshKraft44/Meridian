import type { DatePreset } from './types';

const TZ = 'America/Edmonton';

export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatCentsCompact(cents: number): string {
  const abs = Math.abs(cents);
  let formatted: string;

  if (abs >= 100_000_00) {
    formatted = `$${(abs / 100_000_00).toFixed(1)}M`;
  } else if (abs >= 1_000_00) {
    formatted = `$${(abs / 1_000_00).toFixed(1)}k`;
  } else {
    formatted = (abs / 100).toLocaleString('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-CA', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-CA', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function startOfDayEdmonton(date: Date): Date {
  const str = date.toLocaleDateString('en-CA', { timeZone: TZ });
  return new Date(`${str}T00:00:00-07:00`);
}

export function getPresetRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: TZ });
  const today = new Date(`${todayStr}T00:00:00-07:00`);

  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);

  switch (preset) {
    case 'thisWeek': {
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      return { start, end };
    }
    case 'thisMonth': {
      const start = new Date(`${todayStr.slice(0, 7)}-01T00:00:00-07:00`);
      return { start, end };
    }
    case 'last30': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { start, end };
    }
    default:
      return { start: today, end };
  }
}
