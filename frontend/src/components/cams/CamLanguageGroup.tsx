'use client';

import { useSyncExternalStore } from 'react';
import { languageForCountry } from '@/lib/cams/languages';
import FilterCheckRow from './FilterCheckRow';
import CountryFlag from '@/components/ui/CountryFlag';

export type LanguageRow = { key: string; label: string; href: string; checked: boolean; flag?: string };

/**
 * The rail's language rows, with geo-personalized ordering.
 *
 * The rows arrive fully built from the server (hrefs are canonical-aware filter URLs) in the
 * fixed base order, and that is exactly what SSR and the first client render paint — no
 * hydration mismatch. After mount, the visitor's country (the `pm_cc` cookie, copied from
 * Cloudflare's CF-IPCountry by proxy.ts on every request) maps to a language; if it's a
 * non-English one, its row moves to the top, right before English.
 *
 * Done client-side ON PURPOSE: the rail lives inside statically cached pages, and reading the
 * geo header server-side would make every listing dynamic — one shared document for everyone,
 * personal ordering in the browser.
 */
const subscribeNever = () => () => {};
/** The visitor's language from the pm_cc cookie — a string (stable under Object.is), read via
 * the store hook: the server snapshot is null, so SSR and hydration render base order, and the
 * client re-reads after mount. No effect-driven setState, no hydration mismatch. */
function readCookieLanguage(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)pm_cc=([A-Za-z]{2})/);
  if (!match) return null;
  const language = languageForCountry(match[1]);
  return language && language !== 'english' ? language : null;
}

export default function CamLanguageGroup({ rows }: { rows: LanguageRow[] }) {
  const cookieLanguage = useSyncExternalStore(subscribeNever, readCookieLanguage, () => null);
  const promoted = cookieLanguage && rows.some((r) => r.key === cookieLanguage) ? cookieLanguage : null;

  // "All Languages" (key __all) is pinned first always; the visitor's language, when known,
  // moves directly after it — i.e. to the top of the actual languages, before English.
  const pinned = rows.filter((r) => r.key === '__all');
  const rest = rows.filter((r) => r.key !== '__all');
  const ordered = promoted
    ? [...pinned, ...rest.filter((r) => r.key === promoted), ...rest.filter((r) => r.key !== promoted)]
    : rows;

  return (
    <ul className="space-y-0.5">
      {ordered.map((r) => (
        <li key={r.key}>
          <FilterCheckRow
            href={r.href}
            checked={r.checked}
            label={r.label}
            variant="radio"
            icon={r.flag ? <CountryFlag country={r.flag} className="h-4 w-4" /> : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
