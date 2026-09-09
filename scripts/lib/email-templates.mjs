/**
 * The transactional email templates, as ONE source of truth, deployed to Mailgun by
 * scripts/deploy-mailgun-templates.mjs. Mailgun renders them with handlebars, so the backend
 * only ever passes a template name plus variables (see backend/src/extensions/email).
 *
 * Why the markup looks like 2005: email clients are not browsers.
 *  - TABLES for layout. Outlook (Word rendering engine) ignores flex/grid entirely.
 *  - INLINE styles on every element. Gmail strips <style> in some contexts, and any client
 *    showing a "view entire message" clip can drop the head.
 *  - 600px max width — the safe reading column in every desktop client.
 *  - NO images, including the logo: the wordmark is live text. Most clients block remote
 *    images by default for an unknown sender, and a first-contact confirmation email whose
 *    branding is a grey box is worse than one with none. Text also survives dark mode.
 *  - A "bulletproof" button: a table cell with a background colour and a padded <a>, which
 *    renders in Outlook where a styled <a> alone collapses.
 *  - Explicit colours everywhere (never relying on a default) so forced dark modes in Apple
 *    Mail and Outlook.com invert predictably instead of producing black-on-black.
 *  - A preheader: the hidden line clients show next to the subject in the inbox list. Without
 *    it they scrape the first visible text, which would be the logo.
 */

/** Site palette, matching frontend/src/app/globals.css and the Tailwind emerald the UI uses. */
const C = {
  pageBg: '#f1f5f9', // slate-100
  cardBg: '#ffffff',
  headerBg: '#0f172a', // the site's dark background
  text: '#171717',
  muted: '#64748b', // slate-500
  footerText: '#94a3b8', // slate-400
  accent: '#10b981', // emerald-500 — the "Mode" in the wordmark
  button: '#059669', // emerald-600 — the site's primary button
  border: '#e2e8f0',
};

const SITE = 'https://pornmode.com';

/**
 * Legal pages live under the CMS's `/page/<slug>/` segment — the same URLs the site footer
 * builds with `routes.page(slug)` (frontend/src/lib/routes.ts). Bare `/terms/` etc. 404, which
 * is what these links used to point at. Kept as ONE helper so a footer and a consent paragraph
 * cannot disagree, and with the trailing slash the site's `trailingSlash: true` expects (without
 * it every click costs a 308 hop).
 */
const legal = (slug) => `${SITE}/page/${slug}/`;

/**
 * Hidden inbox-preview line, followed by filler that pushes the body text out of the snippet.
 *
 * The filler is the fiddly part. Gmail COLLAPSES runs of whitespace when it builds the snippet,
 * so padding with `&nbsp;` (or `&nbsp;&zwnj;`) shrinks to a single space and the scraper carries
 * straight on into the visible markup — which is why the inbox showed
 * "…finish creating your account. PornMode Choose a new password": the wordmark and the H1
 * leaking in after the preheader.
 *
 * So the run interleaves characters that are invisible but NOT whitespace, and therefore cannot
 * be collapsed away:
 *   U+034F combining grapheme joiner (&#847;) · zero-width non-joiner · soft hyphen
 * with a non-breaking and a figure space for width. This is the long-standing Litmus recipe.
 * 40 cycles ≈ 200 characters, comfortably past Gmail's snippet length even on a wide window
 * like the one in the screenshot.
 *
 * `mso-hide:all` keeps Outlook from rendering the block, which `display:none` alone does not
 * guarantee there.
 */
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;&#8199;&shy;'.repeat(40);

const preheader = (text) =>
  `<div style="display:none;font-size:1px;color:${C.cardBg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${text}${PREHEADER_FILLER}</div>`;

/** The wordmark, as live text — identical construction to the site header. */
const header = () => `
  <tr>
    <td style="background-color:${C.headerBg};padding:28px 32px;text-align:center;">
      <a href="${SITE}" style="text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:bold;letter-spacing:-0.5px;color:#ffffff;">Porn<span style="color:${C.accent};">Mode</span></a>
    </td>
  </tr>`;

/** Bulletproof CTA: the colour lives on the <td>, so Outlook still paints it. */
const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center" bgcolor="${C.button}" style="border-radius:12px;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;">${label}</a>
      </td>
    </tr>
  </table>`;

const paragraph = (html, { muted = false, small = false } = {}) =>
  `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:${small ? '13px' : '16px'};line-height:1.6;color:${muted ? C.muted : C.text};">${html}</p>`;

/** Same link on every email: the legal pages plus a human to reply to. */
const footer = () => `
  <tr>
    <td style="padding:24px 32px 32px;border-top:1px solid ${C.border};">
      <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.footerText};">
        <a href="${legal('terms')}" style="color:${C.footerText};text-decoration:underline;">Terms of Service</a> &nbsp;·&nbsp;
        <a href="${legal('privacy')}" style="color:${C.footerText};text-decoration:underline;">Privacy Policy</a> &nbsp;·&nbsp;
        <a href="${legal('cookies')}" style="color:${C.footerText};text-decoration:underline;">Cookie Policy</a>
      </p>
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.footerText};">
        You received this because someone used this address on ${SITE.replace('https://', '')}.
        Questions? Reply to this email or write to {{support_email}}.
      </p>
    </td>
  </tr>`;

/** The shell every template shares. */
const layout = ({ preview, body }) => `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>PornMode</title>
</head>
<body style="margin:0;padding:0;background-color:${C.pageBg};">
${preheader(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.pageBg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:${C.cardBg};border-radius:16px;overflow:hidden;">
        ${header()}
        <tr>
          <td style="padding:32px;">
${body}
          </td>
        </tr>
        ${footer()}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

/**
 * Consent, stated at the moment of confirmation.
 *
 * This is the click that creates the account, so it is the honest place to say what the visitor
 * is agreeing to — the terms, and that the address may be used for marketing as well as the
 * transactional mail they just asked for. Both are spelled out with links rather than buried.
 */
const consent = () =>
  paragraph(
    `By confirming you agree to our <a href="${legal('terms')}" style="color:${C.button};text-decoration:underline;">Terms of Service</a> and <a href="${legal('privacy')}" style="color:${C.button};text-decoration:underline;">Privacy Policy</a>, and you agree that we may email you offers, deals and new cam-site news. You can unsubscribe from marketing at any time using the link in those emails — it never affects your account.`,
    { muted: true, small: true },
  );

/** name → { subject, html }. The name is what the backend passes to Mailgun. */
export const TEMPLATES = {
  'pm-confirm': {
    subject: 'Confirm your PornMode account',
    description: 'Signup email verification (includes terms + marketing consent)',
    html: layout({
      preview: 'One click to confirm your email and finish creating your account.',
      body: [
        paragraph('<strong style="font-size:20px;">Confirm your email</strong>'),
        paragraph('Thanks for signing up. Confirm this address and you can choose a password and start saving your favourite cam models.'),
        button('{{confirm_url}}', 'Confirm my email'),
        paragraph(`Or paste this into your browser:<br><a href="{{confirm_url}}" style="color:${C.button};word-break:break-all;">{{confirm_url}}</a>`, { muted: true, small: true }),
        paragraph('If you did not sign up, ignore this email — no account is created until the link is clicked.', { muted: true, small: true }),
        consent(),
      ].join('\n'),
    }),
  },

  'pm-reset': {
    subject: 'Reset your PornMode password',
    description: 'Password reset link',
    html: layout({
      preview: 'Choose a new password for your PornMode account.',
      body: [
        paragraph('<strong style="font-size:20px;">Choose a new password</strong>'),
        paragraph('Someone (hopefully you) asked for a new password for your PornMode account.'),
        button('{{reset_url}}', 'Choose a new password'),
        paragraph(`Or paste this into your browser:<br><a href="{{reset_url}}" style="color:${C.button};word-break:break-all;">{{reset_url}}</a>`, { muted: true, small: true }),
        paragraph('If it was not you, nothing has changed and you can ignore this email. The link expires in an hour.', { muted: true, small: true }),
      ].join('\n'),
    }),
  },

  'pm-signup-notice': {
    subject: 'Someone tried to sign up with your email',
    description: 'Sent when a signup is attempted on an address that already has an account',
    html: layout({
      preview: 'Nothing has changed — you already have an account with this address.',
      body: [
        paragraph('<strong style="font-size:20px;">Someone tried to sign up with your email</strong>'),
        paragraph('Someone just tried to create a PornMode account with this email address.'),
        paragraph('<strong>Nothing has changed.</strong> You already have an account, so no second one was created and nothing was altered.'),
        '{{#if via_google}}',
        paragraph('If that was you, just sign in with Google the same way you did before.'),
        button('{{login_url}}', 'Sign in with Google'),
        '{{else}}',
        paragraph('If that was you, sign in below — or set a new password if you have forgotten yours.'),
        button('{{login_url}}', 'Sign in'),
        paragraph(`Forgotten your password? <a href="{{reset_url}}" style="color:${C.button};text-decoration:underline;">Set a new one</a>.`, { muted: true, small: true }),
        '{{/if}}',
        paragraph('If it was not you, there is nothing to do — trying to sign up with an address grants no access to the account that owns it. If these keep arriving, tell us at {{support_email}}.', { muted: true, small: true }),
      ].join('\n'),
    }),
  },
};

/** Plain-text alternative. Built per send by the backend, since it needs the real URLs. */
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
