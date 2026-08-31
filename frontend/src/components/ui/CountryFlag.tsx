/**
 * A country flag as a small circle — THE flag element, reused wherever a country appears
 * (cam cards, model pages, and the language/multiregion UI when that lands).
 *
 * Renders from the vendored flag-icons set (flagicons.lipis.dev) in /public/flags/1x1/,
 * which the existing immutable cache-control header already covers. The 1x1 variant crops
 * to a circle without distortion. An unknown code 404s — pair with data-cam-thumb-style
 * fallbacks only if the context needs it; here a missing flag simply shows nothing (alt="").
 */
/** One DisplayNames instance per locale — constructing it per flag per render is pure waste. */
const displayNames = new Map<string, Intl.DisplayNames>();
export function countryName(cc: string, locale: string): string {
  return regionName(cc, locale);
}
function regionName(cc: string, locale: string): string {
  try {
    let dn = displayNames.get(locale);
    if (!dn) {
      dn = new Intl.DisplayNames([locale], { type: 'region' });
      displayNames.set(locale, dn);
    }
    return dn.of(cc.toUpperCase()) ?? cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

export default function CountryFlag({
  country,
  className = 'h-5 w-5',
  locale = 'en',
}: {
  /** ISO-2, any case. */
  country: string;
  className?: string;
  locale?: string;
}) {
  const cc = country.toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return null;
  const name = regionName(cc, locale);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/flags/1x1/${cc}.svg`}
      alt={name}
      title={name}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
