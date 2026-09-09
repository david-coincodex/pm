/**
 * Adds confirmed accounts to the Mailgun mailing list.
 *
 * WHEN: only once an address is CONFIRMED — either by clicking the link in the confirmation
 * email (which is where the consent copy lives) or by arriving through Google, which verifies
 * the address itself. Never at registration: an unconfirmed row is an unproven address, and
 * mailing it would be both consent-less and a bounce risk against the sending domain.
 *
 * WHERE FROM: one database lifecycle subscription (src/index.ts) rather than a call inside each
 * flow, so email signup, Google sign-in and any future provider are all covered by the same
 * code — and nothing has to remember to call it.
 *
 * Failures are swallowed and logged. A marketing-list write must never break, or even slow,
 * the account flow that triggered it.
 */

const LIST = process.env.MAILGUN_LIST_ADDRESS ?? 'newsletter@pornmode.com';

export async function subscribeToNewsletter(email: string, strapi: { log: { info: (m: string) => void; warn: (m: string) => void } }): Promise<void> {
  const key = process.env.MAILGUN_API_KEY;
  if (!key) return; // no mailer configured (dev without secrets, or a fresh checkout)

  const base = process.env.MAILGUN_URL ?? 'https://api.mailgun.net';
  const body = new URLSearchParams({
    address: email,
    subscribed: 'yes',
    // `upsert` makes re-confirmation idempotent instead of a 400 for an existing member.
    upsert: 'yes',
  });

  try {
    const res = await fetch(`${base}/v3/lists/${encodeURIComponent(LIST)}/members`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      strapi.log.warn(`[newsletter] could not add a member to ${LIST}: ${res.status} ${(await res.text()).slice(0, 120)}`);
      return;
    }
    strapi.log.info(`[newsletter] confirmed account added to ${LIST}`);
  } catch (error) {
    strapi.log.warn(`[newsletter] add failed: ${(error as Error).message}`);
  }
}

/**
 * Removes an address from the list — used when an account is deleted, because keeping someone
 * on a marketing list after they closed their account is both wrong and a GDPR problem.
 */
export async function unsubscribeFromNewsletter(email: string, strapi: { log: { info: (m: string) => void; warn: (m: string) => void } }): Promise<void> {
  const key = process.env.MAILGUN_API_KEY;
  if (!key) return;
  const base = process.env.MAILGUN_URL ?? 'https://api.mailgun.net';
  try {
    const res = await fetch(`${base}/v3/lists/${encodeURIComponent(LIST)}/members/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000),
    });
    // 404 is fine: they were never on the list (deleted before confirming, say).
    if (res.ok || res.status === 404) {
      strapi.log.info(`[newsletter] removed a deleted account from ${LIST} (${res.status})`);
      return;
    }
    strapi.log.warn(`[newsletter] could not remove a member: ${res.status}`);
  } catch (error) {
    strapi.log.warn(`[newsletter] remove failed: ${(error as Error).message}`);
  }
}
