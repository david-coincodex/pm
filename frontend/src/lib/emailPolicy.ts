import 'server-only';
import { resolveMx, resolve4 } from 'node:dns/promises';
import { isValid as isDeliverableAddress } from 'mailchecker';
import { looksLikeEmail } from '@/lib/accountPolicy';

/**
 * Server-side gate on WHICH email addresses may open an account (the isomorphic shape/identity
 * rules live in `accountPolicy.ts`).
 *
 * Why here and not in the CMS: in staging and production the CMS sits behind Cloudflare
 * Access, so these BFF routes are the only public door to registration — a check enforced
 * here cannot be walked around by calling Strapi directly.
 *
 * Two layers, both cheap, neither authoritative on its own — the confirmation email is still
 * what actually proves ownership:
 *   1. a disposable-mailbox blocklist (mailchecker, ~56k domains, actively maintained), and
 *   2. a DNS check that the domain can receive mail at all, which is what catches typos.
 */

export type EmailRejection = 'invalid' | 'disposable' | 'no_mx';

const DNS_TIMEOUT_MS = 5000;

/** Rejects only if DNS gave a definitive "this domain cannot take mail". */
async function mailDomainExists(domain: string): Promise<boolean> {
  try {
    const mx = await withTimeout(resolveMx(domain));
    if (mx.length > 0) return true;
  } catch (err) {
    // ENODATA/ENOTFOUND fall through to the A-record check below; anything else (timeout,
    // SERVFAIL, a resolver outage) means we learned nothing — see the fail-open note.
    if (!isNoRecord(err)) return true;
  }

  // No MX is not proof: RFC 5321 says a host with only an A record still accepts mail on
  // port 25 (implicit MX). Rare in practice, but cheap to honour and it keeps small
  // self-hosted domains from being told their address is fake.
  try {
    const a = await withTimeout(resolve4(domain));
    return a.length > 0;
  } catch (err) {
    return !isNoRecord(err);
  }
}

function isNoRecord(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN';
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS),
    ),
  ]);
}

/**
 * null = accept. Takes the ALREADY-normalized address (see `normalizeEmail`).
 *
 * FAIL-OPEN by design on anything inconclusive: a flaky resolver or a Cloudflare-side hiccup
 * must never stop real people from signing up. The cost of letting a bad address through is
 * one unconfirmed row that expires unused; the cost of blocking a good one is a lost user.
 */
export async function checkEmail(email: string): Promise<EmailRejection | null> {
  if (!looksLikeEmail(email)) return 'invalid';

  // mailchecker folds "malformed" and "known disposable" into one boolean; shape is already
  // known-good above, so a false here means the domain is on the blocklist.
  if (!isDeliverableAddress(email)) return 'disposable';

  const domain = email.slice(email.lastIndexOf('@') + 1);
  return (await mailDomainExists(domain)) ? null : 'no_mx';
}
