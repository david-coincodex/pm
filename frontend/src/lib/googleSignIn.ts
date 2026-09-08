/**
 * Google sign-in wiring, safe to import from client components.
 *
 * TWO paths, both ending in the SAME stock Strapi endpoint
 * (`GET /api/auth/google/callback?access_token=…`), so neither reimplements any auth logic:
 *
 *  1. **Popup (preferred).** Google Identity Services' token client opens Google's own popup,
 *     the visitor picks an account, and the browser gets an OAuth access token back without
 *     ever leaving the page. We hand that token to our BFF, which exchanges it server-side.
 *  2. **Redirect (fallback).** The classic chain: our button links to the CMS's
 *     `/api/connect/google`, Strapi bounces through Google and back to our callback route.
 *     Used when the Google script cannot load — a content blocker, a flaky CDN — so the
 *     button is never dead.
 *
 * The CLIENT ID is not a build-time constant on purpose. It arrives as a prop from a server
 * component (see the chrome layout → AuthModalProvider) and reaches the browser in the RSC
 * payload, which means turning Google on is a restart, not an image rebuild — the mistake
 * `NEXT_PUBLIC_*` build args have caused here twice. A client id is public by design; the
 * secret half never leaves the CMS.
 */

/** Google's script. Loaded on demand, once per page. */
const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Where the redirect fallback starts (the CMS owns the stock provider flow). */
export const googleRedirectUrl = (): string =>
  `${process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1339'}/api/connect/google`;

type TokenClient = { requestAccessToken: () => void };
type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string }) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

let loading: Promise<GoogleAccounts> | null = null;

/**
 * Resolves with Google's `accounts` API, or rejects if the script cannot load. Memoised, so
 * several buttons on one page share a single request.
 */
export function loadGoogleScript(): Promise<GoogleAccounts> {
  if (typeof window === 'undefined') return Promise.reject(new Error('server'));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (loading) return loading;

  loading = new Promise<GoogleAccounts>((resolve, reject) => {
    const done = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('gsi missing')));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('gsi failed')), { once: true });
    } else {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = done;
      script.onerror = () => reject(new Error('gsi failed'));
      document.head.appendChild(script);
    }
    // A hung CDN must not leave the button spinning forever.
    setTimeout(() => reject(new Error('gsi timeout')), 8000);
  }).catch((err) => {
    loading = null; // let a later click retry
    throw err;
  });

  return loading;
}

/**
 * Opens Google's account-picker popup and resolves with an OAuth access token.
 *
 * `scope: 'email'` matches what stock users-permissions asks for — its provider reads the
 * address off Google's tokeninfo and nothing else, so requesting more would be a consent
 * screen asking for permissions we never use.
 */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  const google = await loadGoogleScript();
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'email',
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error ?? 'no token'));
      },
      // Fires when the visitor closes the popup, or it never opened (blocked).
      error_callback: (error) => reject(new Error(error.type ?? 'popup closed')),
    });
    client.requestAccessToken();
  });
}
