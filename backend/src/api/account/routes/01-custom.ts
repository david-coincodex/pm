/**
 * The ONLY custom auth endpoints. Everything else — register, login, forgot/reset password,
 * the confirmation email itself, and Google sign-in — is stock users-permissions; these three
 * exist because stock has no equivalent, and each is a thin delegation rather than a
 * reimplementation:
 *
 *  - GET /account/confirm-email — calls the stock auth controller with its (undocumented but
 *    supported) `returnUser` flag so confirming an address yields `{ jwt, user }` instead of
 *    a bare redirect. That is what lets the confirmation link log the visitor in and hand
 *    them straight to "choose a password", which is the signup flow we want.
 *  - POST /account/set-password — stock offers only change-password, which demands the
 *    CURRENT password. A Google user has none, and neither does an account mid-signup, so
 *    without this there is no way to ever add one.
 *  - POST /account/notify-signup-attempt — lets registration stop reporting "email already
 *    taken", which is an account-existence oracle. The fact goes to the address's owner by
 *    email instead; stock has no notification of that kind, and reusing forgot-password for
 *    it would mail a live reset token to someone who never asked.
 *  - GET /account/auth-providers — reports which providers the admin panel has enabled, so the
 *    site's Google button follows the CMS instead of a duplicated frontend flag.
 *  - POST /account/delete — self-service account deletion. Stock only offers the admin-shaped
 *    `/users/:id` DELETE, which would let any signed-in visitor delete any user by id; this
 *    one can only ever delete ctx.state.user.
 *
 * confirm-email is public (the token IS the credential) and carries the stock rate limiter,
 * the same middleware every /auth/* route uses. set-password requires a session; its
 * additional authorization rule lives in the controller.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/account/confirm-email',
      handler: 'account.confirmEmail',
      config: {
        auth: false,
        middlewares: ['plugin::users-permissions.rateLimit'],
      },
    },
    {
      // Public, unmetered config read: which providers the CMS has enabled. See the controller
      // for why it carries no rate limiter and why exposing the client id is fine.
      method: 'GET',
      path: '/account/auth-providers',
      handler: 'account.authProviders',
      config: { auth: false },
    },
    {
      // Public and rate-limited like the stock auth routes: it takes an address and answers a
      // fixed 200, telling the caller nothing. Its whole purpose is to move the "this address
      // already has an account" fact out of the signup response and into the owner's inbox.
      method: 'POST',
      path: '/account/notify-signup-attempt',
      handler: 'account.notifySignupAttempt',
      config: {
        auth: false,
        middlewares: ['plugin::users-permissions.rateLimit'],
      },
    },
    {
      // Authenticated + rate-limited; it can only delete the caller's own account, and the
      // controller demands the DELETE keyword plus (for password accounts) the password.
      method: 'POST',
      path: '/account/delete',
      handler: 'account.deleteAccount',
      config: {
        middlewares: ['plugin::users-permissions.rateLimit'],
      },
    },
    {
      method: 'POST',
      path: '/account/set-password',
      handler: 'account.setPassword',
      config: {
        middlewares: ['plugin::users-permissions.rateLimit'],
      },
    },
    {
      // Stamps the signup country on the CURRENT account (once) and re-tags its newsletter
      // member. For Google sign-in, whose stock user creation cannot carry the country the way
      // email register does — the BFF calls this right after the token exchange.
      method: 'POST',
      path: '/account/set-signup-country',
      handler: 'account.setSignupCountry',
      config: {
        middlewares: ['plugin::users-permissions.rateLimit'],
      },
    },
  ],
};
