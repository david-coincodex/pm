import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { type Commercial, type Offer, strapiMediaUrl } from '@/lib/strapi';
import { ARTICLE_COLUMN_SIZES, strapiImgSources } from '@/lib/strapiImage';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';
import ImageGallery from '@/components/ImageGallery';
import CommercialPlayer from './CommercialPlayer';

interface CommercialBlockProps {
  commercial: Commercial;
  /** 1-based position, computed from document order by RichText. */
  ordinal: number;
  canonicalPath?: string;
}

/**
 * One ad in full: heading, clip, description, which scene it advertised, extra stills.
 *
 * The heading is rendered here rather than typed into the editor so that the `id`, the
 * index's `href` and the JSON-LD `@id` are all derived from the same `slug` — hand-writing
 * 20 matching anchor pairs is exactly how deep links silently break. It also means renaming
 * a clip in Strapi fixes every article that embeds it, and the ordinal follows document
 * order instead of being manually renumbered.
 */
export default async function CommercialBlock({ commercial, ordinal, canonicalPath }: CommercialBlockProps) {
  const t = await getTranslations('commercials');
  const c = commercial;

  const still = c.poster ?? c.gallery?.[0] ?? null;
  // Hand-built srcset (plain <img>) instead of a flat `medium` src: with the optimizer off,
  // next/image ignores `sizes`, so every viewport paid for the 750px file. This also lets the
  // article hero and the first ad block (often the same poster) resolve to one cached file.
  const stillSources = still ? strapiImgSources(still) : null;
  const stillSizes = ARTICLE_COLUMN_SIZES;
  const clipUrl = c.clip ? strapiMediaUrl(c.clip) : null;

  // Cheapest active offer for the advertised site — "lowest deal price". Routed through
  // OfferLink inside the player so the CTA behaves exactly like the site card's Buy Now.
  const cheapest = (c.site?.offers ?? [])
    .filter((o) => o.isActive)
    .reduce<Offer | null>((best, o) => (!best || o.price < best.price ? o : best), null);

  const promo =
    cheapest && c.site
      ? {
          offer: {
            id: cheapest.id,
            siteName: c.site.name,
            siteSlug: c.site.slug,
            price: cheapest.price,
            fullPrice: cheapest.full_price,
            offerType: cheapest.offerType,
            offerKind: cheapest.offerKind,
            credits: cheapest.credits,
          },
          label: t('getFullAccess', { price: `$${cheapest.price.toFixed(2)}` }),
        }
      : undefined;

  const videoObject = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: c.title,
    description: c.description,
    ...(still && { thumbnailUrl: [strapiMediaUrl(still)] }),
    uploadDate: c.releaseDate ?? undefined,
    ...(c.durationSeconds && { duration: `PT${c.durationSeconds}S` }),
    ...(clipUrl && { contentUrl: clipUrl }),
    isFamilyFriendly: false,
    // The scene this clip advertised — a semantically accurate use of isBasedOn, and the
    // key data point visitors are searching for.
    ...(c.sceneUrl && { isBasedOn: c.sceneUrl }),
    ...(c.performers && {
      actor: c.performers.split(',').map((n) => ({ '@type': 'Person', name: n.trim() })),
    }),
    ...(c.site && { publisher: { '@type': 'Organization', name: c.site.name } }),
    ...(canonicalPath && { '@id': `${siteSettings.baseUrl}${canonicalPath}#clip-${c.slug}` }),
  };

  return (
    <section className="not-prose my-10">
      {/* scroll-mt clears the sticky header (56px mobile / 64px desktop) so a deep link
          doesn't land the heading underneath it. */}
      <h2
        id={`clip-${c.slug}`}
        className="mt-5 mb-2 scroll-mt-20 text-xl font-bold text-slate-900 md:scroll-mt-24 dark:text-white"
      >
        {ordinal}. {c.title}
      </h2>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        {clipUrl && stillSources ? (
          <CommercialPlayer clipUrl={clipUrl} label={c.title} mode="inview" promo={promo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...stillSources}
              sizes={stillSizes}
              alt={still?.alternativeText ?? c.title}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </CommercialPlayer>
        ) : stillSources ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...stillSources}
            sizes={stillSizes}
            alt={still?.alternativeText ?? c.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>

      {/* Reachable without JavaScript: native controls instead of hover/scroll autoplay.
          preload="none" keeps the no-JS page from pulling 20 clips. */}
      {clipUrl && (
        <noscript>
          <video
            src={clipUrl}
            controls
            preload="none"
            muted
            loop
            playsInline
            className="mt-2 w-full rounded-2xl"
          />
        </noscript>
      )}

      <p className="mt-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">{c.description}</p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {c.performers && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">{t('performers')}:</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">{c.performers}</dd>
          </div>
        )}
        {c.sceneTitle && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">{t('fromScene')}:</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">{c.sceneTitle}</dd>
          </div>
        )}
        {c.sceneSite && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">{t('onSite')}:</dt>
            <dd className="font-medium">
              <Link
                href={routes.site(c.sceneSite.slug)}
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {c.sceneSite.name}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      {c.gallery?.length > 0 && <ImageGallery images={c.gallery} className="mt-4" />}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoObject) }} />
    </section>
  );
}
