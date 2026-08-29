/**
 * The visitor's cam sound preference, shared by the header sound button and the player
 * (same module-singleton + useSyncExternalStore pattern as gridCols). Streams default to
 * muted; once the visitor unmutes, the choice persists — the next stream starts with sound.
 * The server snapshot is always muted, so prerendered pages hydrate without mismatch.
 */
const KEY = 'pm_cam_sound';

let muted: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(KEY) !== 'on';
    } catch {
      muted = true;
    }
  }
  return muted;
}

export const getMuted = (): boolean => read();
export const getServerMuted = (): boolean => true;

export function setMuted(v: boolean, opts: { persist?: boolean } = {}): void {
  muted = v;
  if (opts.persist !== false) {
    try {
      window.localStorage.setItem(KEY, v ? 'off' : 'on');
    } catch {
      // Private mode etc. — the choice still applies for this page's lifetime.
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeMuted(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
