/**
 * Display names from the feeds are model-controlled marketing space, not names. Observed in
 * production: "Liss| Next stream: August 23 ❀" and "Vote for me https://xma.show/voting Female
 * Streamer of the Year" — room subjects and vote-begging stuffed into the name field, which we
 * were printing into H1s, aria-labels and meta titles.
 *
 * Rules, in order:
 *  1. Only the part before the first `|`, `/` or line break (the name/subject separators —
 *     observed: "Liss| Next stream…", "Polly / Online mostly at 6pm-12am UK Time").
 *  2. Any URL anywhere in the ORIGINAL value means the whole field is an ad — fall back to the
 *     username rather than trying to salvage words around a link.
 *  3. Trim decoration from the edges; collapse runs of whitespace.
 *  4. A result shorter than 2 or longer than 30 chars is a slogan, not a name — username again.
 *
 * Client-safe, pure string logic.
 */

const URL_RE = /(https?:\/\/|www\.|\w+\.(com|net|show|xyz|me|tv|live)\b)/i;

export function cleanDisplayName(raw: string | undefined | null, username: string): string {
  const original = (raw ?? '').trim();
  if (!original) return username;
  if (URL_RE.test(original)) return username;

  const name = original
    .split(/[|/\n\r]/)[0]
    .replace(/\s+/g, ' ')
    // strip leading/trailing decoration (hearts, stars, punctuation) but keep inner characters
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();

  if (name.length < 2 || name.length > 30) return username;
  return name;
}

/**
 * Feed location fields carry the providers' own FAILURE strings ('not found' is Chaturbate's
 * geo-lookup miss — verified live) and empty placeholders ('-', '.', 'xx'). Those are data
 * errors, not locations. Whimsical MODEL-entered values stay — that's the performer talking.
 */
const NO_LOCATION = new Set(['not found', 'unknown', 'n/a', 'na', 'x', 'xx', 'xxx', '']);
export function cleanLocation(v: string | undefined | null): string | undefined {
  const t = (v ?? '').trim();
  if (NO_LOCATION.has(t.toLowerCase())) return undefined;
  if (!/\p{L}|\p{N}/u.test(t)) return undefined; // punctuation-only placeholders: '-', '....', '***'
  return t;
}
