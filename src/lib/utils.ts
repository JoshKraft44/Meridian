import type { DatePreset } from './types';

// Alberta went to permanent UTC-6 on 2026-11-01. Node's bundled ICU (and older browsers) still
// apply the old MST/MDT rules there, so after the switch use Regina, which has always been a fixed
// UTC-6. Before it, America/Edmonton is right.
const ALBERTA_UTC6_FROM = Date.UTC(2026, 10, 1, 8);

export function albertaZone(date: Date = new Date()): string {
  return date.getTime() >= ALBERTA_UTC6_FROM ? 'America/Regina' : 'America/Edmonton';
}

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

  if (abs >= 100_000_000) {
    formatted = `$${(abs / 100_000_000).toFixed(1)}M`;
  } else if (abs >= 100_000) {
    formatted = `$${(abs / 100_000).toFixed(1)}k`;
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
    timeZone: albertaZone(new Date(date)),
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-CA', {
    timeZone: albertaZone(new Date(date)),
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// "2026-11-08T09:30" from a datetime-local input, read as Edmonton wall time
export function edmontonLocalToDate(local: string): Date {
  const asUtc = new Date(`${local}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: albertaZone(asUtc),
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
      .formatToParts(asUtc)
      .map((p) => [p.type, p.value])
  );
  const wallMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(asUtc.getTime() - (wallMs - asUtc.getTime()));
}

export function cdnThumb(url: string, width: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

export function startOfDayEdmonton(date: Date): Date {
  const str = date.toLocaleDateString('en-CA', { timeZone: albertaZone(date) });
  return edmontonLocalToDate(`${str}T00:00`);
}

export function getPresetRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: albertaZone(now) });
  const today = edmontonLocalToDate(`${todayStr}T00:00`);

  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);

  switch (preset) {
    case 'today':
      return { start: today, end };
    case 'last7': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start, end };
    }
    case 'thisWeek': {
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      return { start, end };
    }
    case 'thisMonth': {
      const start = edmontonLocalToDate(`${todayStr.slice(0, 7)}-01T00:00`);
      return { start, end };
    }
    case 'last30': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { start, end };
    }
    case 'ytd': {
      const start = edmontonLocalToDate(`${todayStr.slice(0, 4)}-01-01T00:00`);
      return { start, end };
    }
    case 'lastYear': {
      const start = new Date(today);
      start.setDate(today.getDate() - 364);
      return { start, end };
    }
    case 'allTime': {
      const start = edmontonLocalToDate('2020-01-01T00:00');
      return { start, end };
    }
    default:
      return { start: today, end };
  }
}
