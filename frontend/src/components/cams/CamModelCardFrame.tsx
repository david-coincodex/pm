import type { ReactNode } from 'react';

/**
 * The card's box model, owned in ONE place and rendered by both the real card and its
 * skeleton. That is the whole trick behind zero-layout-shift placeholders: the skeleton is
 * not a lookalike built from guessed sizes, it is literally the same frame with placeholder
 * blocks dropped into the same slots. Change the padding here and both move together.
 */
export default function CamModelCardFrame({
  media,
  name,
  badge,
  overlay,
  interactive = true,
}: {
  /** Fills the 4:3 thumbnail area (image + overlays, or a placeholder block). */
  media: ReactNode;
  /** Left side of the footer row: the model name. */
  name: ReactNode;
  /** Right side of the footer row: the provider chip. */
  badge: ReactNode;
  /** Card-wide absolutely-positioned layer — the stretched navigation link. */
  overlay?: ReactNode;
  /** Hover affordances belong to real cards only — a skeleton must not react to the cursor. */
  interactive?: boolean;
}) {
  return (
    // data-cam-card: the hover/visibility anchor CamCardPreview attaches to — the stretched
    // link paints above the media stack, so listeners must live on the card root.
    <div
      data-cam-card=""
      className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${
        interactive ? 'transition hover:border-slate-300 hover:shadow-md dark:hover:border-slate-600' : ''
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-900">{media}</div>
      <div className="flex h-[38px] items-center justify-between gap-2 px-3">
        {name}
        {badge}
      </div>
      {overlay}
    </div>
  );
}
