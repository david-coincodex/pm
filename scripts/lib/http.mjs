/**
 * Shared HTTP helpers for the scripts.
 *
 * Every generator currently copy-pastes its own fetch handling and none of them retry, so a
 * single 429 or transient 5xx abandons an entire article mid-batch. New code uses this.
 */

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry with exponential backoff + jitter, honouring `Retry-After` when the server sends it.
 *
 * `fn` may either throw (network error) or return a `Response`; a retryable status is treated
 * as a failure so callers don't have to duplicate the status check.
 */
export async function withRetry(fn, { tries = 4, baseMs = 1000, label = '' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fn();
      if (res && typeof res.status === 'number' && RETRY_STATUS.has(res.status)) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseMs * 2 ** (attempt - 1) + Math.random() * 250;
        if (attempt === tries) return res; // let the caller see the final status
        console.warn(`    ↻ ${label || 'request'}: ${res.status}, retry ${attempt}/${tries - 1} in ${Math.round(waitMs)}ms`);
        await sleep(waitMs);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === tries) break;
      const waitMs = baseMs * 2 ** (attempt - 1) + Math.random() * 250;
      console.warn(`    ↻ ${label || 'request'}: ${err.message}, retry ${attempt}/${tries - 1} in ${Math.round(waitMs)}ms`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

/** GET with retry. Throws on a non-OK final status so callers can't silently proceed. */
export async function getText(url, { label } = {}) {
  const res = await withRetry(() => fetch(url, { headers: { 'User-Agent': USER_AGENT } }), {
    label: label ?? url,
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** GET binary with retry. Returns a Buffer. */
export async function getBuffer(url, { label } = {}) {
  const res = await withRetry(() => fetch(url, { headers: { 'User-Agent': USER_AGENT } }), {
    label: label ?? url,
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Minimal per-host rate limiter: serialises calls for a host and enforces a minimum gap.
 * Politeness for external hosts; pornmode.com is ours so it can run tighter.
 */
export function createLimiter(minGapMs = 500) {
  let last = 0;
  // The gate is kept deliberately separate from the caller's result promise. Chaining the
  // caller's promise directly (`chain = chain.then(fn); return chain`) means one rejection
  // poisons the chain: every subsequent call returns that same rejected promise WITHOUT ever
  // running its own fn. A single dead image then fails every later request.
  let gate = Promise.resolve();
  return (fn) => {
    const turn = gate.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    gate = turn.then(
      () => {},
      () => {},
    );
    return turn.then(fn);
  };
}
