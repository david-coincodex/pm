/**
 * Load a third-party script exactly once per page, no matter how many components ask.
 *
 * Provider SDK players need this: two cards (or a card and the model player) mounting at the
 * same time must share one script tag and one in-flight load, and a failed load must reject
 * every waiter so each can fall back to its facade rather than hang.
 */
const loads = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = loads.get(src);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    // A tag may already exist from a previous mount whose promise was evicted by a hot reload.
    const prior = document.querySelector<HTMLScriptElement>(`script[data-shared-src="${src}"]`);
    if (prior?.dataset.loaded === 'true') return resolve();

    const el = prior ?? document.createElement('script');
    el.addEventListener('load', () => {
      el.dataset.loaded = 'true';
      resolve();
    });
    el.addEventListener('error', () => {
      // Drop the cached promise so a later mount can retry (a blocker or a blip may pass).
      loads.delete(src);
      el.remove();
      reject(new Error(`script failed to load: ${src}`));
    });
    if (!prior) {
      el.src = src;
      el.async = true;
      el.dataset.sharedSrc = src;
      document.head.appendChild(el);
    }
  });

  loads.set(src, p);
  return p;
}
