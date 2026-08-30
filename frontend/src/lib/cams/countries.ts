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
 * Valid ISO 3166-1 alpha-2 codes — the ONLY 2-letter values that actually name a country. A
 * value like "NY" or "TX" is a US STATE, not a country (BongaCams models type these into their
 * country field — EmmaEmber's homecountry is literally "NY"); without this gate the /^[a-z]{2}$/
 * check waved them through as bogus flags (a 404'd /flags/1x1/ny.svg showing alt text "NY").
 */
const ISO2 = new Set(
  ('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq ' +
    'br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm ' +
    'do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs ' +
    'gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn ' +
    'kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq ' +
    'mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm ' +
    'pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv ' +
    'sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi ' +
    'vn vu wf ws ye yt za zm zw').split(' '),
);

/**
 * US state/DC abbreviations → the US flag. Consulted ONLY after the ISO2 check, so a code that
 * is also a real country (ca=Canada, in=India, va=Vatican, ga=Gabon…) stays that country; the
 * non-country ones (ny, tx, fl, oh, wa…) resolve to "us" instead of showing nothing.
 */
const US_STATE_ABBR = new Set(
  ('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj ' +
    'nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc').split(' '),
);

/**
 * ISO-2 country codes pass through; US state abbreviations map to "us"; names go through the
 * map; anything else → undefined (no flag, rather than a wrong one).
 */
export function normalizeCountry(raw: string | undefined | null): string | undefined {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (ISO_RE.test(value)) {
    if (ISO2.has(value)) return value;
    if (US_STATE_ABBR.has(value)) return 'us';
    return undefined;
  }
  return NAME_TO_ISO[value];
}
