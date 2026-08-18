/**
 * The light/dark theme mechanism — ALL of it lives in this file so the resolution policy
 * ("stored choice, else system preference") exists exactly once.
 *
 * How it fits together:
 * - THEME_SCRIPT is injected into <head> by the root layout and runs BEFORE first paint:
 *   it stamps data-theme on <html>, follows live OS theme changes (only effective while no
 *   explicit choice is stored — apply() re-derives from storage each time), and syncs the
 *   theme across tabs via the storage event. Because it runs on every page, bare routes
 *   without a nav (e.g. /offer) behave identically to chrome routes.
 * - toggleTheme() is what the ThemeToggle button calls. When the user's choice happens to
 *   match the current system preference the stored override is CLEARED instead of written,
 *   so "follow the OS" is restored the moment their preference and the system agree — the
 *   toggle is never a one-way trapdoor out of system-following.
 * - CSS keys on [data-theme="dark"] via the @custom-variant in globals.css, which also
 *   carries a prefers-color-scheme fallback for :root:not([data-theme]) — visitors without
 *   JavaScript keep their system theme.
 */

export const THEME_STORAGE_KEY = 'theme';

// Self-contained pre-paint IIFE (no modern syntax beyond what every supported browser has;
// matchMedia listener registration feature-detects addListener for old WebKit).
export const THEME_SCRIPT =
  `(function(){` +
  `var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');` +
  `function s(){try{return localStorage.${THEME_STORAGE_KEY}}catch(e){return null}}` +
  `function a(){var t=s();d.dataset.theme=t==='dark'||(t!=='light'&&m.matches)?'dark':'light'}` +
  `a();` +
  `m.addEventListener?m.addEventListener('change',a):m.addListener&&m.addListener(a);` +
  `addEventListener('storage',function(e){if(e.key===null||e.key==='${THEME_STORAGE_KEY}')a()});` +
  `})()`;

/** Flip the theme and persist — or un-persist, when the choice equals the system theme. */
export function toggleTheme(): boolean {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (next === system) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable (private mode / blocked): the theme still flips for this page */
  }
  return next === 'dark';
}
