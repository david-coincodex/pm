import type { Core } from '@strapi/strapi';
import { subscribeToNewsletter } from '../../../utils/newsletter';

/**
 * The endpoints stock users-permissions does not provide. Each delegates to plugin services —
 * no auth logic is reimplemented here (see routes/01-custom.ts for why they exist).
 */

/** Mirrors the frontend's rule (frontend/src/lib/emailPolicy.ts) so both ends agree. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Best-effort mailbomb guard, in memory on purpose: it protects a stranger's inbox, not our
 * data, so losing the window on restart is harmless and it is not worth a table or the write
 * load. Two windows, because the two emails have different costs to the recipient:
 *
 *  - the "someone tried to sign up" notice: once an hour. Nobody needs to be told twice, and
 *    without a cap this endpoint would be a way to mailbomb any address that has an account.
 *  - a re-sent confirmation link: 2 minutes, enough to swallow a double-click while keeping
 *    the flow usable for someone genuinely waiting on the email. (The popup's own resend
 *    button goes to the stock endpoint, which has no cooldown at all, so nobody is stuck.)
 */
const NOTICE_COOLDOWN_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const SENT_CACHE_MAX = 5000;
const lastSent = new Map<string, number>();

function sentRecently(key: string, windowMs: number): boolean {
  const previous = lastSent.get(key);
  return previous !== undefined && Date.now() - previous < windowMs;
}

/** Recorded only AFTER a send succeeds — a relay hiccup must not start the cooldown. */
function markSent(key: string): void {
  const now = Date.now();
  if (lastSent.size >= SENT_CACHE_MAX) {
    // First drop everything past its cooldown — those entries no longer suppress anything.
    for (const [k, at] of lastSent) if (now - at > NOTICE_COOLDOWN_MS) lastSent.delete(k);
    // Still at the cap (a burst of >5000 DISTINCT fresh addresses inside the window — i.e. the
    // mailbomb this map exists to bound) means nothing was old enough to evict, so drop the
    // OLDEST entries by insertion order. A Map iterates in insertion order, so this is O(1)
    // amortized and the cap actually holds instead of leaking.
    while (lastSent.size >= SENT_CACHE_MAX) {
      const oldest = lastSent.keys().next().value;
      if (oldest === undefined) break;
      lastSent.delete(oldest);
    }
  }
  lastSent.set(key, now);
}

type UserRow = {
  id: number;
  email: string;
  provider: string | null;
  passwordSet: boolean | null;
  blocked: boolean | null;
  /** Only selected where it is needed — see each query below. */
  confirmed?: boolean | null;
  /** The bcrypt hash. Selected ONLY by deleteAccount, to re-check the current password. */
  password?: string | null;
};

// The `Core.Controller` return annotation is load-bearing: it contextually types every `ctx`
// below as koa's Context without importing koa here (it is only a transitive dependency).
export default ({ strapi }: { strapi: Core.Strapi }): Core.Controller => ({
  /**
   * Confirm an email address AND return a session.
   *
   * The stock content-api route answers a 302 to a configured redirect, which cannot carry a
   * JWT — so a visitor who just proved they own the address would still have to log in with a
   * password they have not chosen yet. The controller's third parameter switches the response
   * to `{ jwt, user }` (verified in @strapi/plugin-users-permissions 5.48
   * controllers/auth.js), which is exactly the session the "choose your password" step needs.
   *
   * Invalid or already-used tokens fall through to the plugin's own ValidationError (400) —
   * we deliberately do not translate it, so token handling stays entirely stock.
   */
  async confirmEmail(ctx, next) {
    // Cast because the registry types every plugin controller as the generic two-argument
    // handler; `emailConfirmation` really does take the extra flag (plugin source, 5.48).
    const auth = strapi.plugin('users-permissions').controller('auth') as unknown as {
      emailConfirmation: (c: typeof ctx, n: typeof next, returnUser: boolean) => Promise<unknown>;
    };
    return auth.emailConfirmation(ctx, next, /* returnUser */ true);
  },

  /**
   * Which third-party sign-in providers are actually usable, read from the plugin's own store —
   * the same rows Settings → Users & Permissions plugin → Providers writes.
   *
   * This exists so the SITE follows the CMS. Stock exposes no public endpoint for it, and the
   * frontend cannot see the CMS's environment, so without this the button had to be driven by
   * a separate frontend flag: enabling Google in the admin panel changed nothing on the site
   * until somebody also rebuilt the frontend image. Now the panel is enough.
   *
   * Public, and safe to be: an OAuth client id is public by construction (it travels in every
   * authorization URL the browser makes). The secret is never read here. Deliberately NOT
   * rate-limited either — it is a read of two config values, our BFF caches it, and a shared
   * per-IP bucket would 429 the whole site the moment a few visitors opened the popup.
   */
  async authProviders(ctx) {
    const grant = ((await strapi.store({ type: 'plugin', name: 'users-permissions' }).get({ key: 'grant' })) ??
      {}) as Record<string, { enabled?: boolean; key?: string } | undefined>;
    const google = grant.google ?? {};
    return ctx.send({
      google: {
        enabled: Boolean(google.enabled && google.key),
        clientId: google.enabled ? (google.key ?? '') : '',
      },
    });
  },

  /**
   * Tell the owner of an existing account that someone tried to sign up with their address.
   *
   * This exists so REGISTRATION CAN STOP ANSWERING THE QUESTION. Reporting "email already
   * taken" to whoever typed it turns signup into an account-existence oracle, and on this site
   * "does this person have an account here" is itself sensitive information about them. So the
   * frontend says the same thing for every address, and the only place the difference appears
   * is the mailbox — where just the owner can read it.
   *
   * What gets sent depends on state the caller is never told:
   *   - no such account → nothing at all;
   *   - never confirmed → the stock confirmation email again, since finishing signup is
   *     exactly what the attempt was after;
   *   - already confirmed → the notice below: nothing changed, no second account exists, and
   *     here is what to do if it wasn't you;
   *   - blocked → nothing.
   *
   * Deliberately NOT a password-reset mail (the obvious stock-only alternative): that would
   * put a live reset token in the inbox of someone who never asked for one.
   *
   * Always answers 200 with a fixed body — the response cannot depend on any of the above.
   */
  async notifySignupAttempt(ctx) {
    const { email } = (ctx.request.body ?? {}) as { email?: unknown };
    if (typeof email !== 'string' || !email.includes('@')) return ctx.badRequest('email is required.');
    const address = email.trim().toLowerCase();

    try {
      const user: UserRow | null = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { email: address },
        select: ['id', 'email', 'provider', 'passwordSet', 'blocked', 'confirmed'],
      });

      if (user && !user.blocked) {
        if (!user.confirmed) {
          // Mid-signup: finishing it is what the attempt was after, so re-send the link.
          if (!sentRecently(`resend:${address}`, RESEND_COOLDOWN_MS)) {
            await strapi.plugin('users-permissions').service('user').sendConfirmationEmail(user);
            markSent(`resend:${address}`);
            strapi.log.info(`[account] signup attempt on unconfirmed account ${user.id}: confirmation re-sent`);
          }
        } else if (!sentRecently(`notice:${address}`, NOTICE_COOLDOWN_MS)) {
          const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:3002').replace(/\/+$/, '');
          // A REPLYABLE address, not EMAIL_FROM — telling someone to write to a no-reply
          // mailbox about a security notice is worse than saying nothing.
          const support = process.env.SUPPORT_EMAIL ?? 'info@pornmode.com';
          // How this account actually signs in, so the advice fits: a Google account has no
          // password, and pointing its owner at "reset your password" would send them down a
          // flow that CONVERTS how they sign in.
          const viaGoogle = user.provider !== null && user.provider !== 'local';

          /**
           * Sent BY TEMPLATE NAME: this call is ours, so it passes `template` and the variables
           * straight through (the Mailgun provider spreads unknown keys into its payload) —
           * no marker indirection needed, unlike the stock-triggered emails.
           * The styled markup lives at Mailgun; see scripts/lib/email-templates.mjs.
           */
          await strapi.plugin('email').service('email').send({
            // Branded, matching the seeded templates: an unexpected security notice from a
            // bare address reads like phishing.
            from: `PornMode <${process.env.EMAIL_FROM ?? 'noreply@pornmode.com'}>`,
            replyTo: support,
            to: user.email,
            subject: 'Someone tried to sign up with your email',
            template: 'pm-signup-notice',
            'h:X-Mailgun-Variables': JSON.stringify({
              login_url: `${frontendUrl}/?auth=login`,
              reset_url: `${frontendUrl}/account/forgot-password/`,
              support_email: support,
              via_google: viaGoogle,
            }),
            // Text alternative: Mailgun renders the template for the HTML part, and a message
            // with no text part scores worse with spam filters.
            text: [
              'Someone just tried to create a PornMode account with this email address.',
              'Nothing has changed: you already have an account, so no second one was created.',
              viaGoogle
                ? `If that was you, sign in with Google as before: ${frontendUrl}/?auth=login`
                : `If that was you, sign in here: ${frontendUrl}/?auth=login\nForgotten your password? ${frontendUrl}/account/forgot-password/`,
              `If it was not you, there is nothing to do. If these keep arriving, tell us at ${support}.`,
            ].join('\n\n'),
          });
          markSent(`notice:${address}`);
          strapi.log.info(`[account] signup attempt on existing account ${user.id}: owner notified`);
        }
      }
    } catch (error) {
      // Swallowed on purpose: a mail failure (no provider configured, relay down) must not
      // change the answer, or the failure itself becomes the oracle. Logged at ERROR though,
      // because "silently sends nothing" is indistinguishable from working from the outside —
      // a broken build in here once looked like a perfectly successful signup.
      strapi.log.error(`[account] signup-attempt notice failed: ${(error as Error).message}`);
    }

    return ctx.send({ ok: true });
  },

  /**
   * Delete the visitor's own account, permanently.
   *
   * Stock users-permissions has no self-delete: its `/users/:id` DELETE is the admin-shaped
   * route, and opening that to the authenticated role would let any signed-in visitor delete
   * ANY user by id. So this endpoint exists, and it can only ever delete `ctx.state.user`.
   *
   * TWO gates, because a session alone should not be enough to destroy an account:
   *   1. the caller must literally type DELETE (the client asks for it; re-checked here, so a
   *      scripted call is held to the same bar as the UI);
   *   2. an account with a password of its own must re-enter it. A Google account has no
   *      password to re-enter — for it the Google-issued session IS the proof of identity,
   *      which is the same asymmetry set-password lives by.
   *
   * Favorites go first: they hold a relation to the user, and deleting the user out from under
   * them would leave rows pointing at a missing id.
   */
  async deleteAccount(ctx) {
    const authUser = ctx.state.user as { id: number } | undefined;
    if (!authUser) return ctx.unauthorized();

    const { password, confirm } = (ctx.request.body ?? {}) as { password?: unknown; confirm?: unknown };
    if (confirm !== 'DELETE') return ctx.badRequest('Type DELETE to confirm.');

    const user: UserRow | null = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: authUser.id },
      select: ['id', 'email', 'provider', 'passwordSet', 'blocked', 'password'],
    });
    if (!user) return ctx.unauthorized();

    const hasOwnPassword = user.provider === 'local' && user.passwordSet === true;
    if (hasOwnPassword) {
      if (typeof password !== 'string' || !password) return ctx.badRequest('Password is required.');
      const valid = await strapi
        .plugin('users-permissions')
        .service('user')
        .validatePassword(password, user.password ?? '');
      // 400 rather than 401: the session is fine, the confirmation was not — a 401 would make
      // the client think it had been signed out.
      if (!valid) return ctx.badRequest('Invalid password.');
    }

    const favorites = await strapi.db
      .query('api::cam-favorite.cam-favorite')
      .deleteMany({ where: { user: user.id } });
    await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: user.id } });

    strapi.log.info(
      `[account] account ${user.id} deleted by its owner (provider "${user.provider}", ${favorites?.count ?? 0} favorite(s) removed)`,
    );
    return ctx.send({ ok: true });
  },

  /**
   * Set a password on an account that has none.
   *
   * AUTHORIZATION — the interesting part. A session alone must not be enough: otherwise a
   * hijacked cookie could silently overwrite the password of a fully set-up account without
   * knowing the current one, which is precisely what stock change-password prevents by
   * demanding `currentPassword`. So this route is allowed only when the account genuinely has
   * no usable password of its own:
   *
   *   - `passwordSet === false` — signed up by email and still mid-signup (registration
   *     assigns a random password the user never learns), or created by Google sign-in.
   *   - `provider !== 'local'` — a Google account, whose password field cannot be used to log
   *     in anyway (stock /auth/local requires provider 'local').
   *
   * Anyone who already chose a password goes through stock change-password instead. Writing
   * `provider: 'local'` alongside is what makes the new password actually usable, since
   * /auth/local filters on it; the trade-off (the account converts to email+password
   * sign-in) is surfaced in the UI before the user commits.
   */
  async setPassword(ctx) {
    const authUser = ctx.state.user as { id: number } | undefined;
    if (!authUser) return ctx.unauthorized();

    const { password } = (ctx.request.body ?? {}) as { password?: unknown };
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return ctx.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const user: UserRow | null = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: authUser.id },
      select: ['id', 'email', 'provider', 'passwordSet', 'blocked'],
    });
    if (!user) return ctx.unauthorized();
    if (user.blocked) return ctx.forbidden('This account is disabled.');

    // Fails CLOSED on purpose: `passwordSet === false` (not `!== true`), so a NULL — a row
    // predating the field whose bootstrap backfill somehow did not run — is refused rather
    // than treated as password-less. Those owners know their password and can use
    // change-password; the opposite default would let a session alone replace it.
    const maySet = user.passwordSet === false || user.provider !== 'local';
    if (!maySet) {
      // 400, not 403: the client asked for the wrong endpoint, and the message tells it which
      // one to use. Nothing is leaked — the caller already holds this account's session.
      return ctx.badRequest('This account already has a password. Use change-password instead.');
    }

    // The plugin's user service hashes the password (its own lifecycle handles it); writing
    // through strapi.db.query would store it in plain text.
    await strapi.plugin('users-permissions').service('user').edit(user.id, {
      password,
      provider: 'local',
      passwordSet: true,
    });
    strapi.log.info(`[account] password set for user ${user.id} (was provider "${user.provider}")`);

    return ctx.send({ ok: true });
  },

  /**
   * Stamp the signup country on the caller's account and tag its newsletter member.
   *
   * The country (Cloudflare's CF-IPCountry) reaches email signups through the register call and
   * is on the row by confirmation time. Google sign-in has no such hook — stock creates the
   * user, and the subscribe lifecycle has already fired without a country — so the BFF's Google
   * token route calls this straight after the exchange.
   *
   * Idempotent and write-once: it only stores the country the FIRST time (so a later login from
   * another country never rewrites where they signed up), and only then re-subscribes — which
   * upserts the existing Mailgun member to add the `country` var. Always 200, even with nothing
   * to do: this is a fire-and-forget enrichment the caller must not have to handle.
   */
  async setSignupCountry(ctx) {
    const authUser = ctx.state.user as { id: number } | undefined;
    if (!authUser) return ctx.unauthorized();

    const { country } = (ctx.request.body ?? {}) as { country?: unknown };
    const cc = typeof country === 'string' ? country.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(cc)) return ctx.send({ ok: true }); // no usable country — nothing to do

    const user: UserRow & { signupCountry?: string | null; confirmed?: boolean | null } = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: authUser.id }, select: ['id', 'email', 'signupCountry', 'confirmed', 'blocked'] });
    if (!user || user.blocked) return ctx.send({ ok: true });

    // Write-once: an existing value wins, so this is safe to call on every Google login.
    if (!user.signupCountry) {
      await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data: { signupCountry: cc } });
      // Only now — first stamp — re-tag the member the lifecycle already added country-less.
      if (user.confirmed && user.email) void subscribeToNewsletter(user.email, cc, strapi);
      strapi.log.info(`[account] signup country ${cc} stored for user ${user.id}`);
    }

    return ctx.send({ ok: true });
  },
});
