// import type { Core } from '@strapi/strapi';

import { normalizeMediaUrls } from './utils/relative-media-urls';
import { subscribeToNewsletter, unsubscribeFromNewsletter } from './utils/newsletter';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: any }) {
    /**
     * Store uploaded-media URLs as root-relative paths, always.
     *
     * A document-service middleware rather than per-content-type `lifecycles.ts` on purpose:
     * there are SIX CKEditor fields across five content types (article.content, category.intro,
     * category.content, page.content, review.content, site.description) plus `blocks` fields on
     * bundle and sale. One registration covers create/update/publish for all of them, and any
     * rich-text field added later is protected without anyone remembering to wire it up.
     *
     * See src/utils/relative-media-urls.ts for why this is necessary: the CKEditor media library
     * always inserts an absolute URL built from whatever host the admin is open on.
     */
    strapi.documents.use(async (context: any, next: any) => {
      // Only OUR content types. In particular `plugin::upload.file` must never pass through
      // here: with a CDN/proxy upload provider its own `url`/`formats` fields hold absolute
      // URLs that can legitimately contain `/uploads/` — normalising those would corrupt the
      // media library's records, not article content.
      if (!context.uid?.startsWith('api::')) return next();
      const isWrite = context.action === 'create' || context.action === 'update';
      if (isWrite && context.params?.data) {
        context.params.data = normalizeMediaUrls(context.params.data);
      }
      return next();
    });

    /**
     * Newsletter membership, from ONE place.
     *
     * Every way an account can become usable ends in a row on this model: email signup flips
     * `confirmed` on confirmation, Google sign-in creates the row already confirmed, and an
     * admin can confirm one by hand. Subscribing here means no flow has to remember to call
     * it, and a future provider is covered for free. Consent is the confirmation click itself
     * — the email that carries the link states the terms and the marketing permission.
     *
     * Deleting an account removes the member again: keeping someone on a marketing list after
     * they closed their account is both wrong and a GDPR problem.
     */
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],

      afterCreate({ result }: any) {
        // Google (and any provider) creates users already confirmed.
        if (result?.confirmed && result?.email) void subscribeToNewsletter(result.email, strapi);
      },

      async afterUpdate({ result, params }: any) {
        // Only the transition INTO confirmed, so ordinary profile writes are not re-posted.
        if (params?.data?.confirmed !== true) return;
        if (result?.email) void subscribeToNewsletter(result.email, strapi);
      },

      async beforeDelete({ params }: any) {
        // Read the address BEFORE the row goes: afterDelete has no reliable result to read.
        const id = params?.where?.id;
        if (!id) return;
        const user = await strapi.db
          .query('plugin::users-permissions.user')
          .findOne({ where: { id }, select: ['email'] });
        if (user?.email) void unsubscribeFromNewsletter(user.email, strapi);
      },
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    /**
     * Route stock-triggered email through MAILGUN-HOSTED TEMPLATES.
     *
     * The confirmation and reset emails are sent by STOCK users-permissions, which renders its
     * own HTML from the plugin store and offers no "use template X" hook. Overriding those
     * flows would mean reimplementing token generation — the auth logic we deliberately keep
     * stock. So instead the seeded store templates carry a marker in an HTML comment:
     *
     *     <!--pm-tpl:pm-confirm|confirm_url=https://…-->
     *
     * and this wrapper turns it into Mailgun's `template` + variables.
     *
     * The hook is the PROVIDER, not the email service: every path funnels through
     * `provider.send` (both `send` and `sendTemplatedEmail`), and it exists by the time
     * bootstrap runs. Decorating the service factory in src/extensions/email did nothing —
     * the container had already resolved the instance — which cost an hour of "why are the
     * variables empty".
     *
     * FAILS SAFE: each store template keeps a complete HTML body after the marker, so if the
     * mapping throws or the template name is wrong, the visitor still gets a working email.
     */
    try {
      const provider = strapi.plugin('email')?.provider;
      if (provider?.send) {
        const originalSend = provider.send.bind(provider);
        const MARKER = /<!--\s*pm-tpl:([a-z0-9-]+)\|([^>]*?)-->/i;
        /**
         * MAILGUN_TESTMODE=yes stamps `o:testmode` on EVERY send: Mailgun accepts and logs the
         * message (visible in events, template rendered, variables applied) but never delivers
         * it. This is what lets the auth flows be exercised end-to-end with throwaway addresses
         * without hard-bouncing them — each bounce hurts the domain's sender reputation and
         * lands the address on Mailgun's suppression list. Dev/test only; announced loudly at
         * boot because a production environment with this set would look exactly like working
         * email while delivering nothing.
         */
        const testmode = /^(1|true|yes)$/i.test(process.env.MAILGUN_TESTMODE ?? '');
        provider.send = async (rawOptions: any) => {
          const options = testmode ? { ...rawOptions, 'o:testmode': 'yes' } : rawOptions;
          try {
            const html = typeof options?.html === 'string' ? options.html : '';
            const match = html.match(MARKER);
            if (match) {
              const [, template, rawVars] = match;
              // Split pairs on ';' and each pair on its FIRST '=', so URLs keep their own
              // query strings intact.
              const variables: Record<string, string> = {};
              for (const pair of rawVars.split(';')) {
                const at = pair.indexOf('=');
                if (at > 0) variables[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
              }
              variables.support_email = process.env.SUPPORT_EMAIL ?? 'info@pornmode.com';
              return await originalSend({
                ...options,
                html: undefined,
                // Keep a text part: a message with no text alternative scores worse with spam
                // filters, and Mailgun only renders the template into the HTML part.
                text: typeof options.text === 'string' ? options.text.replace(MARKER, '').trim() : undefined,
                template,
                'h:X-Mailgun-Variables': JSON.stringify(variables),
              });
            }
          } catch (error) {
            strapi.log.error(`[email] template mapping failed, sending inline HTML: ${(error as Error).message}`);
          }
          return originalSend(options);
        };
        strapi.log.info(
          `[email] Mailgun template mapping installed at the provider.${testmode ? ' TESTMODE ON — messages are accepted by Mailgun but NOT delivered.' : ''}`,
        );
      }
    } catch (error) {
      strapi.log.warn(`[email] could not install template mapping: ${(error as Error).message}`);
    }

    // Grant the Public role read access (find/findOne) on every api:: content type. The frontend
    // fetches Strapi anonymously (no token), so on a fresh DB the Public role has no permissions
    // and every request returns 403 → SSR crashes with "Forbidden". Idempotent + non-destructive:
    // only missing permissions are created, so manual changes / already-configured DBs are untouched.
    // Env-local user data: NEVER publicly readable. Everything else api:: is public content.
    const PUBLIC_READ_EXCLUDED = new Set(['api::cam-favorite.cam-favorite']);

    try {
      const publicRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' }, populate: { permissions: true } });
      if (publicRole) {
        const existing = new Set((publicRole.permissions ?? []).map((p: any) => p.action));
        const apiUids = Object.keys(strapi.contentTypes).filter(
          (uid: string) => uid.startsWith('api::') && !PUBLIC_READ_EXCLUDED.has(uid),
        );
        let created = 0;
        for (const uid of apiUids) {
          for (const verb of ['find', 'findOne']) {
            const action = `${uid}.${verb}`;
            if (!existing.has(action)) {
              await strapi
                .query('plugin::users-permissions.permission')
                .create({ data: { action, role: publicRole.id } });
              created++;
            }
          }
        }
        if (created) strapi.log.info(`[bootstrap] Granted ${created} public read permission(s).`);
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not grant public permissions: ${(error as Error).message}`);
    }

    // Authenticated users manage their own cam favorites (ownership itself is enforced by the
    // cam-favorite controller from ctx.state.user — these grants only open the routes).
    try {
      const authRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'authenticated' }, populate: { permissions: true } });
      if (authRole) {
        const existing = new Set((authRole.permissions ?? []).map((p: any) => p.action));
        let created = 0;
        const authActions = [
          ...['find', 'create', 'delete'].map((verb) => `api::cam-favorite.cam-favorite.${verb}`),
          // Adding a password to an account that has none (Google sign-ins, and email
          // sign-ups still choosing one). Ownership + eligibility are enforced in the
          // controller from ctx.state.user; this grant only opens the route.
          'api::account.account.setPassword',
          // Deleting one's OWN account (the controller can reach no other user).
          'api::account.account.deleteAccount',
        ];
        for (const action of authActions) {
          if (!existing.has(action)) {
            await strapi.query('plugin::users-permissions.permission').create({ data: { action, role: authRole.id } });
            created++;
          }
        }
        if (created) strapi.log.info(`[bootstrap] Granted ${created} authenticated permission(s).`);
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not grant authenticated permissions: ${(error as Error).message}`);
    }

    /**
     * Backfill `passwordSet` on accounts that predate the field.
     *
     * SECURITY-CRITICAL, not cosmetic. Adding the column leaves existing rows NULL, and the
     * set-password gate reads `passwordSet !== true` as "this account has no password of its
     * own" — so every account created before this deploy would be eligible to have its
     * password replaced from a session alone, with no current password required. That is
     * exactly the protection stock change-password exists to provide.
     *
     * NULL means "predates the field" and nothing else: registration and the set-password
     * controller both write the boolean explicitly, so a mid-signup account reads `false` and
     * is deliberately left alone here. Runs before the server accepts traffic.
     */
    try {
      const users = strapi.db.query('plugin::users-permissions.user');
      // A local account with a stored password had one chosen by its owner (the random
      // password our own email signup assigns is always written together with passwordSet
      // false, so it cannot be confused with this case).
      const hadPassword = await users.updateMany({
        where: { passwordSet: null, provider: 'local', password: { $notNull: true } },
        data: { passwordSet: true },
      });
      // Everything else — Google accounts, and any row with no password at all.
      const hadNone = await users.updateMany({
        where: { passwordSet: null },
        data: { passwordSet: false },
      });
      const set = hadPassword?.count ?? 0;
      const unset = hadNone?.count ?? 0;
      if (set || unset) {
        strapi.log.info(`[bootstrap] passwordSet backfilled: ${set} with a password, ${unset} without.`);
      }
    } catch (error) {
      strapi.log.error(`[bootstrap] passwordSet backfill FAILED: ${(error as Error).message}`);
    }

    // ── users-permissions runtime settings ────────────────────────────────────────────────
    // These live in the plugin's own store (the same rows the admin panel writes), NOT in
    // config files, so a fresh database comes up unconfigured: no reset-link target, Google
    // disabled, factory email templates signed "no-reply@strapi.io". Environments would then
    // depend on someone clicking through the admin panel identically in each one.
    //
    // So the ENVIRONMENT is the source of truth and this runs on every boot, writing only
    // when a value actually differs (and logging what changed). The trade-off is explicit:
    // admin-panel edits to THESE keys are overwritten on the next restart — documented in
    // docs/enable-accounts.md.
    try {
      const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
      const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:3002').replace(/\/+$/, '');
      // Confirmation is possible ONLY with the mailer configured (Mailgun is the only path —
      // see config/plugins.ts). Without the key, Strapi's register would create accounts, fail
      // to send, and leave users unable to confirm or re-register — so the flow degrades to
      // immediate login instead.
      const emailEnabled = Boolean(process.env.MAILGUN_API_KEY);
      const fromEmail = process.env.EMAIL_FROM ?? 'noreply@pornmode.com';

      const advanced = (await store.get({ key: 'advanced' })) ?? {};
      const advancedWanted = {
        ...advanced,
        email_confirmation: emailEnabled,
        // The reset email's link is built from THIS value (the template's <%= URL %>), which
        // is why no template surgery is needed for password reset.
        // TRAILING SLASHES throughout: the frontend runs `trailingSlash: true`, so a slashless
        // path answers 308 before the real handler. Harmless for a page, but these URLs travel
        // in emails and in an OAuth callback — one fewer hop for link scanners to mangle and
        // for a token-bearing redirect to survive.
        // The reset LINK target: a route handler that parks the code in an httpOnly cookie and
        // opens the popup on the home page, so the code never lands in a page URL (and the
        // visitor never sees a popup floating over an empty page).
        email_reset_password: `${frontendUrl}/api/auth/reset-link/`,
        // Fallback only: where stock's own confirmation GET would redirect. Our confirmation
        // link points at the frontend directly (see the template below), so this is just a
        // sane landing place if anyone hits the stock endpoint.
        email_confirmation_redirection: `${frontendUrl}/?auth=confirmed`,
      };
      if (JSON.stringify(advancedWanted) !== JSON.stringify(advanced)) {
        await store.set({ key: 'advanced', value: advancedWanted });
        strapi.log.info(
          `[bootstrap] users-permissions advanced settings synced (email_confirmation=${emailEnabled}).`,
        );
      }

      /**
       * Email templates in the plugin store.
       *
       * Each `message` is a MARKER plus a plain-HTML fallback. The marker
       * (`<!--pm-tpl:name|var=value-->`) is picked up by src/extensions/email, which swaps the
       * send onto the matching Mailgun-hosted template — that is where the styled header,
       * footer and consent copy live (scripts/lib/email-templates.mjs, deployed with
       * scripts/deploy-mailgun-templates.mjs). Everything after the marker is what goes out if
       * that mapping ever fails, so the worst case is a plain email with a working link.
       *
       * The CONFIRMATION link is written literally rather than using `<%= URL %>`: the plugin
       * hardcodes that variable to the CMS's own endpoint, and the CMS is not the visitor-facing
       * host. The RESET link keeps `<%= URL %>`, which resolves to advanced.email_reset_password
       * above.
       */
      const emailTemplates = (await store.get({ key: 'email' })) ?? {};
      const from = { name: 'PornMode', email: fromEmail };
      // Same reasoning as the reset link above: a route handler redeems the token server-side,
      // then hands the visitor to the home page with the popup already open.
      const confirmLink = `${frontendUrl}/api/auth/confirm-link/?confirmation=<%= CODE %>`;
      // Legal pages are CMS pages, so they live under `/page/<slug>/` — the same URLs the site
      // footer builds via `routes.page()`. Bare `/terms/` 404s.
      const termsLine =
        `<p style="font-size:13px;color:#64748b;">By confirming you agree to our ` +
        `<a href="${frontendUrl}/page/terms/">Terms of Service</a> and ` +
        `<a href="${frontendUrl}/page/privacy/">Privacy Policy</a>, and you agree that we may email ` +
        `you offers, deals and cam-site news. You can unsubscribe from marketing at any time.</p>`;
      const templatesWanted = {
        ...emailTemplates,
        email_confirmation: {
          ...(emailTemplates.email_confirmation ?? {}),
          display: 'Email.template.email_confirmation',
          icon: 'check-square',
          options: {
            ...((emailTemplates.email_confirmation ?? {}).options ?? {}),
            from,
            response_email: '',
            object: 'Confirm your PornMode account',
            message: [
              `<!--pm-tpl:pm-confirm|confirm_url=${confirmLink}-->`,
              '<p>Thanks for signing up. Confirm your email address to finish creating your account:</p>',
              `<p><a href="${confirmLink}">Confirm my email</a></p>`,
              `<p>Or paste this into your browser:<br>${confirmLink}</p>`,
              '<p>If you did not sign up, you can ignore this email.</p>',
              termsLine,
            ].join(''),
          },
        },
        reset_password: {
          ...(emailTemplates.reset_password ?? {}),
          display: 'Email.template.reset_password',
          icon: 'sync',
          options: {
            ...((emailTemplates.reset_password ?? {}).options ?? {}),
            from,
            response_email: '',
            object: 'Reset your PornMode password',
            message: [
              '<!--pm-tpl:pm-reset|reset_url=<%= URL %>?code=<%= TOKEN %>-->',
              '<p>Someone (hopefully you) asked to reset your PornMode password.</p>',
              '<p><a href="<%= URL %>?code=<%= TOKEN %>">Choose a new password</a></p>',
              '<p>Or paste this into your browser:<br><%= URL %>?code=<%= TOKEN %></p>',
              '<p>If it was not you, nothing has changed — you can ignore this email.</p>',
            ].join(''),
          },
        },
      };
      if (JSON.stringify(templatesWanted) !== JSON.stringify(emailTemplates)) {
        await store.set({ key: 'email', value: templatesWanted });
        strapi.log.info(`[bootstrap] users-permissions email templates synced (from ${fromEmail}, via Mailgun templates).`);
      }

      /**
       * Google sign-in. TWO ways to turn it on, and the environment does NOT win by default:
       *
       *  - `GOOGLE_CLIENT_ID`/`_SECRET` set ⇒ seeded from the environment on every boot, so a
       *    deployed environment is reproducible and a fresh database needs no admin clicks.
       *  - not set ⇒ THE STORE IS LEFT ALONE, which is what makes the stock admin panel work:
       *    Settings → Users & Permissions plugin → Providers → Google. Enabling it there used
       *    to survive exactly until the next restart, when this block blanked the credentials
       *    and set `enabled: false` again.
       *
       * The one repair made without env vars: filling in an empty `callback` on a provider
       * somebody enabled by hand. That field ("The redirect URL to your front-end app") has to
       * point at our BFF route, and an empty one strands the visitor at the CMS.
       */
      const grant = (await store.get({ key: 'grant' })) ?? {};
      const googleKey = process.env.GOOGLE_CLIENT_ID ?? '';
      const googleCallback = `${frontendUrl}/api/auth/google/callback/`;
      const currentGoogle = grant.google ?? {};

      if (googleKey) {
        const googleWanted = {
          ...grant,
          google: {
            ...currentGoogle,
            enabled: true,
            icon: 'google',
            key: googleKey,
            secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            callback: googleCallback,
            scope: ['email'],
          },
        };
        if (JSON.stringify(googleWanted) !== JSON.stringify(grant)) {
          await store.set({ key: 'grant', value: googleWanted });
          strapi.log.info('[bootstrap] Google sign-in seeded from GOOGLE_CLIENT_ID.');
        }
      } else if (currentGoogle.enabled && !currentGoogle.callback) {
        await store.set({
          key: 'grant',
          value: { ...grant, google: { ...currentGoogle, callback: googleCallback } },
        });
        strapi.log.info(`[bootstrap] Google sign-in enabled in the admin panel; callback set to ${googleCallback}.`);
      } else {
        strapi.log.info(
          `[bootstrap] Google sign-in left to the admin panel (currently ${currentGoogle.enabled ? 'enabled' : 'disabled'}); set GOOGLE_CLIENT_ID to manage it from the environment.`,
        );
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not sync users-permissions settings: ${(error as Error).message}`);
    }

    // `overallScore` and `displayTitle` are auto-computed (see review lifecycles).
    // Strapi hardcodes `editable: true` in field metadata and has no schema flag
    // for read-only, so we enforce it on the stored content-manager configuration
    // here (reproducible on any DB). Also use `displayTitle` as the entry label.
    try {
      const ct = strapi.contentTypes['api::review.review'];
      const svc = strapi.plugin('content-manager').service('content-types');
      const conf = await svc.findConfiguration(ct);

      let changed = false;
      for (const field of ['overallScore', 'displayTitle']) {
        const edit = conf?.metadatas?.[field]?.edit;
        if (edit && edit.editable !== false) {
          edit.editable = false;
          changed = true;
        }
      }
      if (conf?.settings && conf.settings.mainField !== 'displayTitle') {
        conf.settings.mainField = 'displayTitle';
        changed = true;
      }
      // Admin list columns: ID, Site, Overall score.
      const listColumns = ['id', 'site', 'overallScore'];
      if (conf?.layouts && JSON.stringify(conf.layouts.list) !== JSON.stringify(listColumns)) {
        conf.layouts.list = listColumns;
        changed = true;
      }

      if (changed) {
        await svc.updateConfiguration(ct, conf);
        strapi.log.info('[bootstrap] Review: overallScore/displayTitle read-only, mainField=displayTitle.');
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not enforce review admin config: ${(error as Error).message}`);
    }
  },
};
