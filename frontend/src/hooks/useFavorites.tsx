'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';
import { siteSettings } from '@/lib/siteSettings';

/**
 * Client-side favorites state, shared app-wide through one provider so every heart button
 * agrees. Loaded once per session from the BFF; toggles are optimistic with rollback.
 * `user === null` + `loaded` means logged out — hearts then deep-link to the login page.
 */

export type Favorite = {
  documentId: string;
  provider: string;
  username: string;
  displayName?: string;
  thumbUrl?: string;
  gender?: string;
};

type FavoritesApi = {
  loaded: boolean;
  loggedIn: boolean;
  favorites: Favorite[];
  isFavorite(provider: string, username: string): boolean;
  toggle(model: { provider: string; username: string; displayName?: string; thumbUrl?: string; gender?: string }): Promise<void>;
};

const Ctx = createContext<FavoritesApi | null>(null);

const keyOf = (provider: string, username: string) => `${provider}:${username}`;

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  // In-flight creates by model key. An unfavorite that lands while the create is still on the
  // wire must wait for the REAL documentId — deleting the optimistic placeholder id would leave
  // the row alive on the server while the UI shows it gone.
  const pendingCreates = useRef(new Map<string, Promise<string | null>>());

  useEffect(() => {
    // Accounts disabled for launch: stay inert — no session probe, hearts render null anyway.
    if (!siteSettings.features.accounts) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch('/api/auth/me/').then((r) => r.json());
        if (cancelled) return;
        if (!me.user) {
          setLoggedIn(false);
          setLoaded(true);
          return;
        }
        setLoggedIn(true);
        const res = await fetch('/api/favorites/').then((r) => r.json());
        if (!cancelled) setFavorites(res.favorites ?? []);
      } catch {
        /* logged-out view on any failure */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteKeys = useMemo(() => new Set(favorites.map((f) => keyOf(f.provider, f.username))), [favorites]);

  const isFavorite = useCallback(
    (provider: string, username: string) => favoriteKeys.has(keyOf(provider, username)),
    [favoriteKeys],
  );

  const remove = useCallback(async (current: Favorite) => {
    // Filter by model key, not documentId: a click handler from a stale render can still
    // hold the optimistic placeholder id after the create swapped in the real one.
    setFavorites((prev) => prev.filter((f) => keyOf(f.provider, f.username) !== keyOf(current.provider, current.username)));
    trackEvent('cam_unfavorite', { provider: current.provider, username: current.username });
    let documentId: string | null = current.documentId;
    if (documentId.startsWith('optimistic-')) {
      documentId = (await pendingCreates.current.get(keyOf(current.provider, current.username))) ?? null;
      if (!documentId) return; // create failed → nothing exists server-side, nothing to delete
    }
    const res = await fetch(`/api/favorites/?documentId=${encodeURIComponent(documentId)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) setFavorites((prev) => [...prev, { ...current, documentId: documentId! }]); // rollback
  }, []);

  const add = useCallback(
    async (model: { provider: string; username: string; displayName?: string; thumbUrl?: string; gender?: string }) => {
      const key = keyOf(model.provider, model.username);
      const optimistic: Favorite = { documentId: `optimistic-${key}`, ...model };
      setFavorites((prev) => [...prev, optimistic]);
      trackEvent('cam_favorite', { provider: model.provider, username: model.username });
      const create = (async (): Promise<string | null> => {
        try {
          const res = await fetch('/api/favorites/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(model),
          });
          const data = await res.json();
          if (!res.ok) throw new Error('failed');
          const documentId: string = data.data.documentId;
          setFavorites((prev) => prev.map((f) => (f === optimistic ? { ...f, documentId } : f)));
          return documentId;
        } catch {
          setFavorites((prev) => prev.filter((f) => f !== optimistic)); // rollback
          return null;
        }
      })();
      // The resolved promise stays in the map: a click handler holding a stale render's
      // optimistic id can still resolve it to the real documentId after the create settles.
      pendingCreates.current.set(key, create);
      await create;
    },
    [],
  );

  const toggle = useCallback(
    async (model: { provider: string; username: string; displayName?: string; thumbUrl?: string; gender?: string }) => {
      const current = favorites.find((f) => f.provider === model.provider && f.username === model.username);
      await (current ? remove(current) : add(model));
    },
    [favorites, remove, add],
  );

  const api = useMemo(
    () => ({ loaded, loggedIn, favorites, isFavorite, toggle }),
    [loaded, loggedIn, favorites, isFavorite, toggle],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFavorites requires <FavoritesProvider>');
  return ctx;
}
