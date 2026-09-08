/**
 * Account rules that BOTH the browser forms and the BFF routes need — pure string work only,
 * so this module stays isomorphic (the server-only half, which does DNS and blocklists, lives
 * in `emailPolicy.ts`). Keeping the two ends on one definition is the point: a password the
 * form accepts must not be rejected by the API, and the email the user types must resolve to
 * the same account whichever door they came through.
 */

/** Strapi's own floor is 6; 8 is ours, enforced in the form, the BFF and the CMS controller. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Deliberately permissive: one @, a dot-bearing domain, no whitespace. Real validation is
 * "can it receive mail" (MX lookup) plus "did the confirmation link get clicked" — a stricter
 * regex here only ever rejects valid exotic addresses.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_SHAPE.test(value);
}

/**
 * The canonical form of an address — ONE account per real mailbox.
 *
 * Plus-aliasing (`you+anything@…`) is standard across Gmail, Outlook, Fastmail, iCloud and
 * most self-hosted setups: everything from `+` to `@` is a tag the provider ignores when
 * delivering, so treating it as part of the identity would let one mailbox mint unlimited
 * accounts (`you+1@`, `you+2@`, …). Gmail additionally ignores dots in the local part and
 * treats googlemail.com as gmail.com.
 *
 * Delivery is unaffected — mail to the canonical form reaches the same inbox — and the
 * normalized address is what we store, so login works whichever variant is typed.
 */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);

  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '');

  return `${local}@${domain}`;
}

/** null = acceptable. The single password rule, shared by every form and route. */
export function passwordProblem(password: unknown): 'required' | 'too_short' | null {
  if (typeof password !== 'string' || password.length === 0) return 'required';
  return password.length < MIN_PASSWORD_LENGTH ? 'too_short' : null;
}
