/**
 * Number formatting shared by server and client components.
 */

/** 44134 → "44K", 1200000 → "1.2M". Locale-aware via Intl. */
export function compactNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Milliseconds → "3h 12m" / "45m". Unit letters read fine in every launched locale. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
