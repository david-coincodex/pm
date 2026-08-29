/**
 * Country normalization for the feeds → lowercase ISO-2 for CamModel.country (flag rendering).
 *
 * Chaturbate already sends ISO-2 codes. BongaCams sends NAMES in whatever language the model
 * typed — sampled today: "Россия", "Colombia", "colombia", "Russia", "Poland", "USA",
 * "Украина". This maps the observed vocabulary; unmapped values yield undefined and simply
 * render no flag. Client-safe.
 */

const NAME_TO_ISO: Record<string, string> = {
  россия: 'ru', russia: 'ru', 'russian federation': 'ru',
  украина: 'ua', ukraine: 'ua', 'украї́на': 'ua', україна: 'ua',
  беларусь: 'by', belarus: 'by',
  казахстан: 'kz', kazakhstan: 'kz',
  молдова: 'md', moldova: 'md',
  латвия: 'lv', latvia: 'lv',
  литва: 'lt', lithuania: 'lt',
  эстония: 'ee', estonia: 'ee',
  colombia: 'co', venezuela: 've', argentina: 'ar', chile: 'cl', peru: 'pe', ecuador: 'ec',
  mexico: 'mx', méxico: 'mx', bolivia: 'bo', uruguay: 'uy', paraguay: 'py', 'costa rica': 'cr',
  spain: 'es', españa: 'es', espana: 'es',
  usa: 'us', 'united states': 'us', 'united states of america': 'us', us: 'us',
  uk: 'gb', 'united kingdom': 'gb', england: 'gb', 'great britain': 'gb',
  canada: 'ca', australia: 'au', 'new zealand': 'nz',
  germany: 'de', deutschland: 'de', германия: 'de',
  france: 'fr', франция: 'fr',
  italy: 'it', italia: 'it',
  portugal: 'pt', brazil: 'br', brasil: 'br',
  romania: 'ro', românia: 'ro', румыния: 'ro',
  poland: 'pl', polska: 'pl', польша: 'pl',
  'czech republic': 'cz', czechia: 'cz', чехия: 'cz',
  hungary: 'hu', bulgaria: 'bg', serbia: 'rs', croatia: 'hr', greece: 'gr',
  turkey: 'tr', türkiye: 'tr', turkiye: 'tr',
  netherlands: 'nl', belgium: 'be', switzerland: 'ch', austria: 'at',
  sweden: 'se', norway: 'no', finland: 'fi', denmark: 'dk',
  philippines: 'ph', thailand: 'th', india: 'in', indonesia: 'id', vietnam: 'vn',
  japan: 'jp', china: 'cn', 'south korea': 'kr', korea: 'kr',
  'south africa': 'za', egypt: 'eg', morocco: 'ma', nigeria: 'ng', kenya: 'ke',
};

const ISO_RE = /^[a-z]{2}$/;

/**
 * ISO-2 codes pass through (lowercased); names go through the map; anything else → undefined.
 */
export function normalizeCountry(raw: string | undefined | null): string | undefined {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (ISO_RE.test(value)) return value;
  return NAME_TO_ISO[value];
}
