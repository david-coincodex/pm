'use client';


const STORAGE_KEY = 'pm_recently_viewed';
const MAX_ITEMS = 10;

export interface RecentItem {
  slug: string;
  name: string;
  shortDescription?: string;
  bestPrice?: number;
  bestFullPrice?: number | null;
}

function readStorage(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded or private mode — ignore
  }
}

export function trackView(site: RecentItem) {
  const items = readStorage().filter((i) => i.slug !== site.slug);
  items.unshift(site);
  writeStorage(items.slice(0, MAX_ITEMS));
}
