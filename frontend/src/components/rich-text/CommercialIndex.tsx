import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { type Commercial, strapiMediaUrl } from '@/lib/strapi';
import { siteSettings } from '@/lib/siteSettings';
import CommercialPlayer from './CommercialPlayer';

interface CommercialIndexProps {
  /** Every ad in the article, in document order. */
  commercials: Commercial[];
  /** Article path, for absolute JSON-LD URLs. */
  canonicalPath?: string;
}

/**
 * Scannable index of every ad in the article: still + title + description, linking down to
 * the full entry. This is the "I remember this one" surface, so **all** items render — no
 * show-more, no client-side reveal. The descriptions are what people match against a Google
 * snippet, so they must be in the server-rendered HTML.
 *
 * A server component: only the small hover-preview player inside each row is client-side.
 */
export default async function CommercialIndex({ commercials, canonicalPath }: CommercialIndexProps) {
  const t = await getTranslations('commercials');
  if (!commercials.length) return null;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: commercials.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: commercials.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.title,
      ...(canonicalPath && { url: `${siteSettings.baseUrl}${canonicalPath}#clip-${c.slug}` }),
    })),
  };

  return (
    <nav aria-label={t('indexTitle')} className="not-prose my-8">
      <ol className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {commercials.map((c, i) => {
          const still = c.poster ?? c.gallery?.[0] ?? null;
          const thumb = still?.formats?.thumbnail?.url
            ? strapiMediaUrl({ url: still.formats.thumbnail.url })
            : still
              ? strapiMediaUrl(still)
              : null;

          return (
            <li key={c.id}>
              <a
                href={`#clip-${c.slug}`}
                className="flex items-start gap-4 p-3 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/60 dark:active:bg-slate-800"
              >
                <span className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:size-30 dark:bg-slate-800">
                  {c.clip && thumb ? (
                    <CommercialPlayer clipUrl={strapiMediaUrl(c.clip)} label={c.title} mode="hover">
                      <Image
                        src={thumb}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 120px, 80px"
                        className="object-cover"
                      />
                    </CommercialPlayer>
                  ) : thumb ? (
                    <Image src={thumb} alt="" fill sizes="(min-width: 640px) 120px, 80px" className="object-cover" />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                      {i + 1}.
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {c.title}
                      {c.sceneTitle && (
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {' '}
                          — {c.sceneTitle}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                    {c.description}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
    </nav>
  );
}
