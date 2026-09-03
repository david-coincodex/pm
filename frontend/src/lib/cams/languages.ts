/**
 * Canonical language vocabulary for the cam filter, and the normalizer that maps the feeds'
 * free text onto it.
 *
 * BongaCams sends clean lowercase names; Chaturbate's `spoken_languages` is model-typed free
 * text — 217 distinct values in one 2,000-room sample: autonyms ("español", "русский"),
 * cross-language names ("ingles" = English written by a Spanish speaker), combined forms
 * ("spanish / english", "español- ingles"). Unmapped tokens are dropped: a language outside
 * the canonical set simply isn't filterable.
 *
 * Client-safe: pure data + string logic.
 */

/**
 * Fixed base order, identical for every visitor: English first, then by observed prevalence.
 * Labels are autonyms — the convention for language pickers, and they need no translation.
 */
export const CAM_LANGUAGES: { key: string; label: string }[] = [
  { key: 'english', label: 'English' },
  { key: 'spanish', label: 'Español' },
  { key: 'russian', label: 'Русский' },
  { key: 'french', label: 'Français' },
  { key: 'german', label: 'Deutsch' },
  { key: 'italian', label: 'Italiano' },
  { key: 'portuguese', label: 'Português' },
  { key: 'romanian', label: 'Română' },
  { key: 'ukrainian', label: 'Українська' },
  { key: 'polish', label: 'Polski' },
  { key: 'turkish', label: 'Türkçe' },
  { key: 'arabic', label: 'العربية' },
  // Added with StripChat (#82): its roster made the Asian-language slices real inventory —
  // measured live: in 235, ph 181, cn 68, jp 57, vn 40. Korean measured 8 — deliberately absent
  // (a near-empty page); Australian is not a language (au counts as English).
  { key: 'hindi', label: 'हिन्दी' },
  { key: 'tagalog', label: 'Tagalog' },
  { key: 'chinese', label: '中文' },
  { key: 'japanese', label: '日本語' },
  { key: 'vietnamese', label: 'Tiếng Việt' },
];

const LANGUAGE_KEYS = new Set(CAM_LANGUAGES.map((l) => l.key));

export const isCamLanguage = (v: string): boolean => LANGUAGE_KEYS.has(v);

export const languageLabel = (key: string): string => CAM_LANGUAGES.find((l) => l.key === key)?.label ?? key;

/** Synonyms keyed on de-accented lowercase tokens (accents stripped before lookup). */
const SYNONYMS: Record<string, string> = {
  english: 'english', ingles: 'english', engleza: 'english', anglais: 'english', inglese: 'english', englisch: 'english', angielski: 'english',
  spanish: 'spanish', espanol: 'spanish', castellano: 'spanish', espagnol: 'spanish', spanisch: 'spanish',
  russian: 'russian', русский: 'russian', руский: 'russian', ruso: 'russian', russisch: 'russian', russe: 'russian',
  french: 'french', francais: 'french', frances: 'french', franzosisch: 'french',
  german: 'german', deutsch: 'german', aleman: 'german', allemand: 'german', немецкий: 'german',
  italian: 'italian', italiano: 'italian', italienisch: 'italian',
  portuguese: 'portuguese', portugues: 'portuguese', brasileiro: 'portuguese',
  romanian: 'romanian', romana: 'romanian', rumänisch: 'romanian', румынский: 'romanian',
  ukrainian: 'ukrainian', украинский: 'ukrainian', украінська: 'ukrainian', українська: 'ukrainian', ukrainisch: 'ukrainian',
  polish: 'polish', polski: 'polish', polaco: 'polish', польский: 'polish',
  turkish: 'turkish', turkce: 'turkish', turco: 'turkish', турецкий: 'turkish',
  arabic: 'arabic', arabe: 'arabic', арабский: 'arabic', العربية: 'arabic',
  hindi: 'hindi',
  tagalog: 'tagalog', filipino: 'tagalog',
  chinese: 'chinese', mandarin: 'chinese', chino: 'chinese', 中文: 'chinese',
  japanese: 'japanese', japones: 'japanese', 日本語: 'japanese',
  vietnamese: 'vietnamese',
  // ISO-639-1 codes: StripChat's feed declares languages as codes ('en','zh','ja'), which the
  // name-keyed rows above silently dropped — every sc row synced with languages: []. Exact
  // whole-token matches only, so free-text fragments can't collide with a two-letter code.
  en: 'english', es: 'spanish', ru: 'russian', fr: 'french', de: 'german', it: 'italian',
  pt: 'portuguese', ro: 'romanian', uk: 'ukrainian', pl: 'polish', tr: 'turkish', ar: 'arabic',
  hi: 'hindi', tl: 'tagalog', zh: 'chinese', ja: 'japanese', vi: 'vietnamese',
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    // Combining marks only — Cyrillic/Arabic letters must survive untouched.
    .replace(/[̀-ͯ]/g, '')
    .trim();

/**
 * The lookup table with its keys passed through the SAME strip as incoming tokens. Without
 * this, NFD betrays Cyrillic: й decomposes to и + combining breve, the breve is stripped, and
 * "русский" typed by a model no longer equals the precomposed "русский" key in source code.
 */
const STRIPPED_SYNONYMS: Record<string, string> = Object.fromEntries(
  Object.entries(SYNONYMS).map(([k, v]) => [strip(k), v]),
);

/**
 * Feed values → canonical keys. Handles every separator seen in the wild: commas, slashes,
 * hyphens, ampersands, plus, "and"/"y" as words.
 * NOTE: since the filter moved to country-based matching, the frontend renders no
 * declared-language UI — this now feeds only the model registry rows (modelSync payload),
 * kept as declared-language data for future use.
 */
export function normalizeLanguages(raw: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const value of raw) {
    if (!value) continue;
    for (const token of value.split(/[,/\-&+]|\band\b|\by\b/i)) {
      const mapped = STRIPPED_SYNONYMS[strip(token)];
      if (mapped) out.add(mapped);
    }
  }
  // Canonical order, so every consumer renders the same sequence.
  return CAM_LANGUAGES.map((l) => l.key).filter((k) => out.has(k));
}

/**
 * Country → dominant canonical language. Two consumers:
 *  1. The language FILTER: picking "Deutsch" selects models whose COUNTRY maps to german —
 *     a user decision after declared-language matching put Colombian flags under a Deutsch
 *     filter. Flags always agree with the filter by construction now.
 *  2. The rail's geo-personalized ordering (visitor's language promoted above English).
 * Unknown country → null → matches no language filter, no promotion.
 */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  // English-speaking (needed by the filter; the geo-promotion consumer skips 'english')
  us: 'english', gb: 'english', ca: 'english', au: 'english', nz: 'english', ie: 'english',
  // Spanish-speaking
  es: 'spanish', mx: 'spanish', co: 'spanish', ar: 'spanish', cl: 'spanish', pe: 'spanish',
  ve: 'spanish', ec: 'spanish', uy: 'spanish', py: 'spanish', bo: 'spanish', gt: 'spanish',
  cr: 'spanish', pa: 'spanish', do: 'spanish', hn: 'spanish', ni: 'spanish', sv: 'spanish', cu: 'spanish',
  // Russian-speaking
  ru: 'russian', by: 'russian', kz: 'russian', kg: 'russian',
  ua: 'ukrainian',
  de: 'german', at: 'german', ch: 'german', li: 'german',
  fr: 'french', mc: 'french',
  it: 'italian', sm: 'italian',
  pt: 'portuguese', br: 'portuguese', ao: 'portuguese', mz: 'portuguese',
  ro: 'romanian', md: 'romanian',
  pl: 'polish',
  tr: 'turkish',
  sa: 'arabic', eg: 'arabic', ae: 'arabic', ma: 'arabic', dz: 'arabic', tn: 'arabic',
  iq: 'arabic', jo: 'arabic', lb: 'arabic', kw: 'arabic', qa: 'arabic', om: 'arabic',
  bh: 'arabic', ye: 'arabic', ly: 'arabic', sy: 'arabic',
  // in/ph moved OUT of english when their own pages shipped (#82): a country maps to exactly
  // one language here, and the dedicated slice is worth more than padding the English page.
  in: 'hindi',
  ph: 'tagalog',
  cn: 'chinese', tw: 'chinese', hk: 'chinese', mo: 'chinese',
  jp: 'japanese',
  vn: 'vietnamese',
};

export function languageForCountry(cc: string): string | null {
  return COUNTRY_TO_LANGUAGE[cc.toLowerCase()] ?? null;
}

/**
 * The flagship country per language — the rail shows each language as a country-flagged row
 * (the filter matches by country, so the flag is the truthful symbol). Portuguese carries the
 * Brazilian flag: that is where the feeds' Portuguese-speaking models overwhelmingly are.
 */
export const LANGUAGE_FLAGS: Record<string, string> = {
  english: 'us', spanish: 'es', russian: 'ru', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'br', romanian: 'ro', ukrainian: 'ua', polish: 'pl', turkish: 'tr', arabic: 'sa',
  hindi: 'in', tagalog: 'ph', chinese: 'cn', japanese: 'jp', vietnamese: 'vn',
};
