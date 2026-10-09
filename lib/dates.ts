// Dates are plain "YYYY-MM-DD" strings; all maths is done in UTC so a
// laptop's timezone never shifts a day.

const DAY = 86400000;

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ms(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(ms(s));
}

export function addDays(iso: string, n: number): string {
  return new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((ms(b) - ms(a)) / DAY);
}

export function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ms(iso)));
  } catch {
    return iso;
  }
}

export function formatLongDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(ms(iso)),
    );
  } catch {
    return iso;
  }
}
