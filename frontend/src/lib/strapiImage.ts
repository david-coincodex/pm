import { strapiMediaUrl } from '@/lib/strapi';

/**
 * The minimum shape needed to build responsive sources. Structurally satisfied by
 * `StrapiMedia`, but looser on purpose: gallery items parsed from article HTML carry no
 * `width`, and video posters may carry no `formats`.
 */
export type StrapiImgSource = {
  url: string;
  /** Original pixel width, when known — used as the srcset descriptor for the original file. */
  width?: number | null;
  formats?: {
    thumbnail?: { url: string; width: number };
    small?: { url: string; width: number };
    medium?: { url: string; width: number };
    large?: { url: string; width: number };
  };
};

/**
 * `sizes` for a full-width image in the article/main column of a SidebarLayout page:
 * ~92vw below the lg breakpoint (full width minus container padding), capped at the
 * ~740px column above it. The article hero and the ad blocks share this ON PURPOSE —
 * identical sizes + identical srcset make the browser resolve the same poster to the
 * same file, so an image used by both downloads once.
 */
export const ARTICLE_COLUMN_SIZES = '(min-width: 1024px) 740px, 92vw';

/**
 * `src` + hand-built `srcSet` for a Strapi image, from its pre-generated resizes.
 *
 * With the image optimizer off (`images.unoptimized` in next.config), next/image emits no
 * srcset, so every image renders at its `src` size on every viewport. Responsive images
 * therefore use a plain <img> fed by this: thumbnail/small/medium/large plus the original,
 * and the browser picks per viewport and DPR (pair it with an accurate `sizes`).
 *
 * `srcSet` is undefined when the media carries no usable formats (SVGs, video uploads,
 * items parsed from legacy HTML) — render the bare `src` then.
 */
export function strapiImgSources(media: StrapiImgSource): { src: string; srcSet?: string } {
  const f = media.formats ?? {};
  const candidates = [f.thumbnail, f.small, f.medium, f.large].filter(
    (x): x is { url: string; width: number } => Boolean(x?.url && x?.width),
  );
  const src = strapiMediaUrl({ url: candidates[0]?.url ?? media.url });
  if (candidates.length === 0) return { src };

  const srcSet = candidates
    .map((c) => `${strapiMediaUrl({ url: c.url })} ${c.width}w`)
    // Original as the top step. When its true width is unknown, an inflated descriptor keeps
    // the correct "largest available" semantics: it is only picked when nothing smaller suffices.
    .concat(`${strapiMediaUrl({ url: media.url })} ${media.width ?? 10000}w`)
    .join(', ');
  return { src, srcSet };
}
