import 'server-only';
import type { CamModel, CamProvider, CamProviderAdapter } from './types';
import { ALL_ADAPTERS } from './providers/adapters';
import { rankModels } from './ranking';
import { syncModels } from './modelSync';

/**
 * The merge layer over all provider adapters, and the aggregator's hot path.
 *
 * WHY AN IN-PROCESS CACHE AND NOT unstable_cache
 * ----------------------------------------------
 * The snapshot is ~2,000 models (~1 MB). unstable_cache stores it SERIALIZED, so every reader
 * paid a JSON round trip, and — worse — the request that arrived after the TTL expired had to
 * sit through the full upstream refill (4 × 640 KB from Chaturbate, ~0.4-1.5 s) before it got
 * a single byte back. One unlucky visitor per minute per page.
 *
 * This module keeps the parsed objects in memory with stale-while-revalidate semantics:
 * readers ALWAYS get an already-built snapshot back (no await on the network), and an expired
 * snapshot triggers ONE background refresh that the reader does not wait for. The only request
 * that ever blocks on the network is the first one after boot.
 *
 * Everything downstream reads from precomputed views (`byViewers`, `byNewest`, `byId`) built
 * once per refresh, so no page ever sorts 2,000 models to render 48 cards.
 */

/** Each provider gates itself via `enabled()` (credentials present), so adding one never
 * touches this line — see providers/adapters.ts. */
const adapters: CamProviderAdapter[] = ALL_ADAPTERS.filter((a) => a.enabled());

export const adapterById = new Map(adapters.map((a) => [a.id, a]));

/** Providers actually wired up right now — one stays out until its credentials are set. */
export const enabledProviders = new Set<CamProvider>(adapters.map((a) => a.id));

/**
 * How long a snapshot is considered fresh. Beyond it, it is still served — just refreshed.
 * 45 s keeps us inside the affiliate API's polite-polling range (~1 req/min per provider) while
 * bounding how long a model can be gone before it leaves the site.
 */
const TTL_MS = 45_000;
/**
 * The HARD bound. Stale-while-revalidate alone has a failure mode this system got caught by:
 * on a quiet server the "revalidate" only ever starts when someone visits, so the first visitor
 * after an idle gap was served a snapshot as old as the gap — hours of offline models, stamped
 * into a page the ISR cache then re-served. Past this age the snapshot may not be served at
 * all: the reader waits the one provider round trip (~0.5 s) and gets live data. The poller
 * below makes this path nearly unreachable in practice; it exists for the boot gap and as the
 * backstop if the poller ever dies.
 */
const MAX_STALE_MS = 5 * 60_000;
/** After a failed refresh, don't hammer the provider: nothing new is attempted for this long. */
const RETRY_BACKOFF_MS = 15_000;
/** Poller cadence — how often the background tick checks whether the TTL has lapsed. */
const POLL_MS = 45_000;
/**
 * Hard ceiling on ONE refresh attempt, after which the single-flight lock is released whether
 * or not that attempt ever settles.
 *
 * The fix for the 2026-09-08 outage (#90). `refresh()` de-duplicates through `box.inFlight`,
 * which used to be cleared only in that promise's own `finally` — so an attempt that never
 * settled held the lock forever, every reader past MAX_STALE_MS blocked behind it, and every
 * model page without a cached copy became a 524. ~122k URLs, crawlers included, for 3 hours.
 *
 * Deliberately ABOVE the slowest healthy refresh: the feeds run in parallel and the slowest
 * bound is StripChat's 30s fetch timeout, so a legitimate refresh can never trip this. It
 * fires only when something is genuinely stuck.
 */
const REFRESH_TIMEOUT_MS = 40_000;
/**
 * How long a READER waits on a refresh before giving up and serving the stale snapshot.
 *
 * Availability beats freshness on this path: a stale model page still renders and still
 * indexes, while a blocked render is a 524 for the visitor AND for Googlebot. Short enough to
 * stay a defensible TTFB, and only reachable once the snapshot is already past MAX_STALE_MS.
 */
const READER_WAIT_MS = 6_000;

export type OnlineSnapshot = {
  /**
   * All online models in "most popular first" order — the canonical order for every listing.
   * Providers with comparable viewer counts compete on the number; a provider whose count
   * isn't comparable is woven in at its declared cadence (see lib/cams/ranking.ts). Computed
   * once per refresh, so requests never rank.
   */
  byViewers: CamModel[];
  /** The same set, sorted by most-recently-online first. */
  byNewest: CamModel[];
  /** `${provider}:${username}` → model, so a model page is a lookup and not a scan. */
  byId: Map<string, CamModel>;
  degradedProviders: CamProvider[];
  /**
   * Providers whose feed fetch failed on THIS refresh, retained-or-not. Logging/diagnostics
   * only. Distinct from degradedProviders on purpose: that one means "nothing to show" and
   * drives the UI banner, so it stays empty during a warm outage where retention hides the
   * blip from visitors.
   */
  failedProviders: CamProvider[];
  /**
   * Providers that have failed EVERY refresh for at least SUSTAINED_FAILURE_MS — the paging
   * signal (modelSync forwards these; the roster-sync heartbeat pings /fail on them).
   *
   * Not the same as failedProviders, and the difference is the whole point: a single failed
   * poll is routine (measured: all four feeds rejecting together on one cycle from a local
   * network blip, every one of them covered by retention) and it woke someone up for nothing.
   * Retention serves last-known models for the 45s until the next poll, so one miss is
   * invisible to visitors and not actionable. A feed that is still failing minutes later IS
   * actionable — a rotated key, a changed endpoint, a blocked IP — and that is what pages.
   */
  sustainedFailures: CamProvider[];
  fetchedAt: string;
  fetchedAtMs: number;
  /** Changes with every refresh — derived-result caches key off it. */
  version: string;
};

const EMPTY: OnlineSnapshot = {
  byViewers: [],
  byNewest: [],
  byId: new Map(),
  degradedProviders: adapters.map((a) => a.id),
  failedProviders: adapters.map((a) => a.id),
  sustainedFailures: [],
  fetchedAt: new Date(0).toISOString(),
  fetchedAtMs: 0,
  version: 'empty',
};

type SnapshotBox = {
  current: OnlineSnapshot | null;
  inFlight: Promise<OnlineSnapshot> | null;
  lastFailureMs: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  /** Fingerprint of the last refresh's content + how many refreshes it has survived unchanged. */
  lastContentKey: string;
  identicalRefreshes: number;
};

/**
 * The mutable state lives on globalThis, not in module scope. Six route entries import this
 * module, and the bundler is allowed to give entries their own copy of it (dev HMR does so on
 * every recompile). Two copies would mean two snapshots: double the upstream polling and two
 * pages disagreeing about who is online. globalThis is the one object every copy shares.
 */
const g = globalThis as typeof globalThis & { __pmCamSnapshot?: SnapshotBox };
const box: SnapshotBox = (g.__pmCamSnapshot ??= {
  current: null,
  inFlight: null,
  lastFailureMs: 0,
  pollTimer: null,
  lastContentKey: '',
  identicalRefreshes: 0,
});

/**
 * Keep the snapshot fresh whether or not anyone is visiting. Without this, refreshes only ran
 * inside requests — fine under steady traffic, but the whole point of a 45 s TTL is defeated
 * if freshness depends on the previous visitor having shown up recently.
 *
 * Started lazily on first read (a booted-but-unvisited server polls nothing), unref'd so it
 * never holds the process open, and skipped during `next build` — the build needs one snapshot,
 * not a heartbeat.
 */
function startPolling(): void {
  if (box.pollTimer || process.env.NEXT_PHASE === 'phase-production-build') return;
  const timer = setInterval(() => {
    const now = Date.now();
    const due = !box.current || now - box.current.fetchedAtMs > TTL_MS;
    if (due && !box.inFlight && now - box.lastFailureMs >= RETRY_BACKOFF_MS) void refresh();
  }, POLL_MS);
  timer.unref?.();
  box.pollTimer = timer;
}

/**
 * How long a feed must be failing CONTINUOUSLY before it pages. Two full sync cadences: long
 * enough that a blip or a single slow response never alerts, short enough that a genuinely
 * broken feed is reported inside the check's own 10-minute period.
 */
const SUSTAINED_FAILURE_MS = 10 * 60 * 1000;

/** provider → when its current unbroken run of failures started. Cleared on any success. */
const failingSince = new Map<CamProvider, number>();

function build(
  models: CamModel[],
  degradedProviders: CamProvider[],
  failedProviders: CamProvider[],
  sustainedFailures: CamProvider[],
): OnlineSnapshot {
  const byViewers = rankModels(models);
  const byNewest = [...models].sort((a, b) => (b.onlineSince ?? '').localeCompare(a.onlineSince ?? ''));
  const fetchedAtMs = Date.now();
  return {
    byViewers,
    byNewest,
    byId: new Map(models.map((m) => [m.id, m])),
    degradedProviders,
    failedProviders,
    sustainedFailures,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    fetchedAtMs,
    version: `${fetchedAtMs}-${models.length}`,
  };
}

/**
 * Monotonic tag per refresh attempt, so a late-settling attempt cannot release a lock that a
 * newer attempt now owns. Module-scoped rather than on `box`: each bundle copy only ever
 * compares its own tags against its own locks, and sharing it on globalThis would let one
 * copy's abandoned attempt clear another's.
 */
let refreshGeneration = 0;

/** One refresh at a time, whoever asks for it. Never rejects — failures keep the old snapshot. */
function refresh(): Promise<OnlineSnapshot> {
  if (box.inFlight) return box.inFlight;
  const generation = ++refreshGeneration;

  // No `finally` clearing box.inFlight in here any more: the watchdog below owns the lock's
  // lifetime. A promise that never settles never runs its own finally, which is exactly how
  // the lock leaked.
  const attempt = (async () => {
    try {
      const results = await Promise.allSettled(adapters.map((a) => a.fetchOnline()));
      const models: CamModel[] = [];
      const degradedProviders: CamProvider[] = [];
      // Diagnostics: every provider whose fetch rejected this cycle, retained or not.
      const failedProviders: CamProvider[] = [];
      results.forEach((r, i) => {
        const id = adapters[i].id;
        if (r.status === 'fulfilled') {
          models.push(...r.value);
          // Recovery resets the clock, so an intermittent feed never accumulates its way to a
          // page: only an UNBROKEN run of failures counts.
          failingSince.delete(id);
          return;
        }
        // This provider's feed failed this cycle. Rather than drop all its models — which
        // empties its category/language/platform pages and lets ISR cache that empty page for a
        // full revalidate window (the "empty on first load, fine on refresh" bug) — retain its
        // last-known-good models from the previous snapshot. They age out the moment the feed
        // recovers. Only when there is NOTHING to retain (e.g. cold boot) do we mark it degraded
        // and show the "temporarily unavailable" banner.
        const retained = box.current?.byViewers.filter((m) => m.provider === id) ?? [];
        models.push(...retained);
        failedProviders.push(id);
        if (!failingSince.has(id)) failingSince.set(id, Date.now());
        if (retained.length === 0) degradedProviders.push(id);
        console.error(
          `[cams] ${id} feed failed${retained.length ? ` (serving ${retained.length} last-known)` : ''}:`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      });
      // Every provider down: never BUILD an empty snapshot — at boot that would stamp
      // "0 cams live" as fresh and seed ISR with it for a full TTL. Keep the previous
      // snapshot when one exists, otherwise return EMPTY unstamped so the 15s backoff
      // in getOnlineModels retries instead of trusting the blank.
      if (models.length === 0) {
        box.lastFailureMs = Date.now();
        return box.current ?? EMPTY;
      }
      box.lastFailureMs = 0;
      const now = Date.now();
      const sustainedFailures = failedProviders.filter(
        (id) => now - (failingSince.get(id) ?? now) >= SUSTAINED_FAILURE_MS,
      );
      const built = build(models, degradedProviders, failedProviders, sustainedFailures);
      /**
       * An attempt the watchdog already abandoned must NOT publish.
       *
       * Its models were fetched before the hang, but `build()` stamps `fetchedAtMs = Date.now()`
       * — so publishing here would re-brand data as old as the hang as brand new, and overwrite
       * whatever fresher snapshot the recovering attempt just installed. That is precisely the
       * "silently served hours-old data" failure this file warns about, arriving through the
       * back door of its own fix.
       */
      if (refreshGeneration !== generation) {
        console.warn(
          `[cams] discarding refresh #${generation}: abandoned by the watchdog, ${models.length} models dropped`,
        );
        return box.current ?? built;
      }
      box.current = built;
      // One line per refresh so freshness is VISIBLE in logs — this system silently served
      // hours-old data once; never again without a trace.
      console.log(
        `[cams] snapshot refreshed: ${models.length} models` +
          (degradedProviders.length ? ` (degraded: ${degradedProviders.join(', ')})` : '') +
          (sustainedFailures.length ? ` (SUSTAINED failure: ${sustainedFailures.join(', ')})` : ''),
      );
      // Tripwire: a live roster never repeats exactly. When the data-cache incident froze the
      // feeds, the count sat at the same number for hours in plain sight — this makes a frozen
      // feed shout instead of whisper.
      const contentKey = `${models.length}:${box.current.byViewers[0]?.id ?? ''}`;
      box.identicalRefreshes = contentKey === box.lastContentKey ? box.identicalRefreshes + 1 : 0;
      box.lastContentKey = contentKey;
      if (box.identicalRefreshes >= 4) {
        console.warn(
          `[cams] snapshot content unchanged across ${box.identicalRefreshes} refreshes — feed data may be frozen`,
        );
      }
      // Ride the refresh cadence to keep the persistent model registry (Strapi) current —
      // existence, lastSeenAt, peak viewers. Fire-and-forget with its own throttle, and the
      // build-phase guard lives inside syncModels.
      syncModels(box.current);
      return box.current;
    } catch (err) {
      box.lastFailureMs = Date.now();
      console.error('[cams] snapshot refresh failed:', err instanceof Error ? err.message : err);
      return box.current ?? EMPTY;
    }
  })();

  /**
   * The watchdog. Whichever settles first releases the lock, so a stuck attempt costs one
   * refresh cycle instead of every subsequent read. The stuck promise is abandoned rather than
   * cancelled (nothing here can cancel it), and stamping `lastFailureMs` puts the retry backoff
   * in front of the next attempt so a permanently-stuck feed cannot spin.
   */
  const guarded = (async (): Promise<OnlineSnapshot> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        attempt,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`refresh exceeded ${REFRESH_TIMEOUT_MS}ms`)),
            REFRESH_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      box.lastFailureMs = Date.now();
      console.error('[cams] snapshot refresh abandoned:', err instanceof Error ? err.message : err);
      return box.current ?? EMPTY;
    } finally {
      clearTimeout(timer);
      // ONLY if we still own it: an attempt that settles minutes late must not clear the lock
      // a newer, healthy attempt is holding.
      if (refreshGeneration === generation) box.inFlight = null;
    }
  })();

  box.inFlight = guarded;
  return guarded;
}

/**
 * The online snapshot. Returns instantly from memory whenever one exists — a stale snapshot is
 * served as-is while the refresh runs in the background.
 */
export async function getOnlineModels(): Promise<OnlineSnapshot> {
  startPolling();
  const now = Date.now();
  if (box.current) {
    const age = now - box.current.fetchedAtMs;
    const backingOff = now - box.lastFailureMs < RETRY_BACKOFF_MS;
    /**
     * Past the hard bound the snapshot is no longer fit to serve, so we do wait for live data —
     * but only for READER_WAIT_MS. Waiting unboundedly is what turned one wedged refresh into
     * a 524 on every uncached model page (#90). Falling back to the stale snapshot keeps the
     * page rendering and indexable, and the refresh we started still lands for the next reader.
     */
    if (age > MAX_STALE_MS && !backingOff) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fresh = await Promise.race([
          refresh(),
          new Promise<null>((resolve) => {
            timer = setTimeout(resolve, READER_WAIT_MS, null);
          }),
        ]);
        return fresh ?? box.current;
      } finally {
        // The loser of the race must not leave a live timer behind: under load this path runs
        // per request, and an uncleared one keeps a task queued for the full budget.
        clearTimeout(timer);
      }
    }
    if (age > TTL_MS && !backingOff && !box.inFlight) void refresh();
    return box.current; // fresh or slightly stale — the reader never waits inside the TTL band
  }
  if (now - box.lastFailureMs < RETRY_BACKOFF_MS) return EMPTY;
  // Cold boot: nothing stale to fall back on, so this one genuinely must wait — but the
  // watchdog bounds it at REFRESH_TIMEOUT_MS instead of forever.
  return refresh();
}

/** One model by (provider, username) — from the live snapshot, or null when offline. */
export async function findOnlineModel(provider: CamProvider, username: string): Promise<CamModel | null> {
  const { byId } = await getOnlineModels();
  return byId.get(`${provider}:${username}`) ?? null;
}
