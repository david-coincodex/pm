export type SpotlightTheme = 'purple' | 'cyan' | 'emerald' | 'rose' | 'amber';

export type ThemeConfig = {
  eyebrow: string;        // eyebrow label text color
  badge: string;          // pill badge bg + text
  solidButton: string;    // solid filled CTA button
  outlineButton: string;  // outlined ghost CTA button
  discountBadge: string;  // discount % badge background
  cardHover: string;      // card hover border
  cardNameHover: string;  // site card name hover text
  tabActive: string;      // active tab pill bg + shadow
  accentText: string;     // prices, primary accent text
  accentMuted: string;    // separators, muted accents
  progressBar: string;    // active progress dot / bar
};

export const themes: Record<SpotlightTheme, ThemeConfig> = {
  purple: {
    eyebrow: 'text-purple-400',
    badge: 'bg-purple-500/20 text-purple-400',
    solidButton: 'bg-purple-600 shadow-purple-900/40 hover:bg-purple-500 focus-visible:outline-purple-400',
    outlineButton: 'border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 focus-visible:outline-purple-400',
    discountBadge: 'bg-purple-600',
    cardHover: 'hover:border-purple-400/50',
    cardNameHover: 'group-hover:text-purple-300',
    tabActive: 'bg-purple-600 text-white shadow-md shadow-purple-900/40',
    accentText: 'text-purple-400',
    accentMuted: 'text-purple-400/70',
    progressBar: 'bg-purple-400',
  },
  cyan: {
    eyebrow: 'text-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-400',
    solidButton: 'bg-cyan-600 shadow-cyan-900/40 hover:bg-cyan-500 focus-visible:outline-cyan-400',
    outlineButton: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 focus-visible:outline-cyan-400',
    discountBadge: 'bg-cyan-600',
    cardHover: 'hover:border-cyan-400/50',
    cardNameHover: 'group-hover:text-cyan-300',
    tabActive: 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40',
    accentText: 'text-cyan-400',
    accentMuted: 'text-cyan-400/70',
    progressBar: 'bg-cyan-400',
  },
  emerald: {
    eyebrow: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-400',
    solidButton: 'bg-emerald-600 shadow-emerald-900/40 hover:bg-emerald-500 focus-visible:outline-emerald-400',
    outlineButton: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 focus-visible:outline-emerald-400',
    discountBadge: 'bg-emerald-600',
    cardHover: 'hover:border-emerald-400/50',
    cardNameHover: 'group-hover:text-emerald-300',
    tabActive: 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40',
    accentText: 'text-emerald-400',
    accentMuted: 'text-emerald-400/70',
    progressBar: 'bg-emerald-400',
  },
  rose: {
    eyebrow: 'text-rose-400',
    badge: 'bg-rose-500/20 text-rose-400',
    solidButton: 'bg-rose-600 shadow-rose-900/40 hover:bg-rose-500 focus-visible:outline-rose-400',
    outlineButton: 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-rose-400',
    discountBadge: 'bg-rose-600',
    cardHover: 'hover:border-rose-400/50',
    cardNameHover: 'group-hover:text-rose-300',
    tabActive: 'bg-rose-600 text-white shadow-md shadow-rose-900/40',
    accentText: 'text-rose-400',
    accentMuted: 'text-rose-400/70',
    progressBar: 'bg-rose-400',
  },
  amber: {
    eyebrow: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400',
    solidButton: 'bg-amber-600 shadow-amber-900/40 hover:bg-amber-500 focus-visible:outline-amber-400',
    outlineButton: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 focus-visible:outline-amber-400',
    discountBadge: 'bg-amber-600',
    cardHover: 'hover:border-amber-400/50',
    cardNameHover: 'group-hover:text-amber-300',
    tabActive: 'bg-amber-500 text-white shadow-md shadow-amber-900/40',
    accentText: 'text-amber-400',
    accentMuted: 'text-amber-400/70',
    progressBar: 'bg-amber-400',
  },
};
