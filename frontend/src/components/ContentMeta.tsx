import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { strapiMediaUrl, type ArticleAuthor } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import UpdatedOnBadge from '@/components/UpdatedOnBadge';

interface ContentMetaProps {
  author: ArticleAuthor | null;
  publishDate: string | null;
  publishedAt: string | null;
  modifiedDate: string | null;
  locale: string;
  showUpdated: boolean;
}

export default async function ContentMeta({
  author,
  publishDate,
  publishedAt,
  modifiedDate,
  locale,
  showUpdated,
}: ContentMetaProps) {
  const pubIso = publishDate ?? publishedAt;

  if (!author && !pubIso) return null;

  const t = await getTranslations({ locale, namespace: 'blog' });
  const byLabel = t('by');
  const onLabel = t('on');
  const updatedLabel = t('updatedOn');

  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 pb-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {author ? (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white bg-slate-100 dark:ring-slate-900 dark:bg-slate-700">
            {author.avatar ? (
              <Image
                src={strapiMediaUrl(author.avatar)}
                alt={author.name}
                width={32}
                height={32}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300">
                {author.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span>
              {byLabel}{' '}
              <Link href={routes.blogAuthor(author.slug)} className="font-medium text-slate-700 hover:underline dark:text-slate-200">
                {author.name}
              </Link>
              {pubIso && (
                <>
                  {' '}{onLabel}{' '}
                  <time dateTime={pubIso} className="font-medium text-slate-700 dark:text-slate-200">
                    {new Date(pubIso).toLocaleString(locale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'UTC',
                    })}
                  </time>
                </>
              )}
            </span>
            {showUpdated && modifiedDate && (
              <UpdatedOnBadge modifiedDate={modifiedDate} locale={locale} updatedLabel={updatedLabel} />
            )}
          </div>
        </div>
      ) : pubIso ? (
        <div className="flex items-center gap-1.5">
          <span>
            {onLabel}{' '}
            <time dateTime={pubIso} className="font-medium text-slate-700 dark:text-slate-200">
              {new Date(pubIso).toLocaleString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC',
              })}
            </time>
          </span>
          {showUpdated && modifiedDate && (
            <UpdatedOnBadge modifiedDate={modifiedDate} locale={locale} updatedLabel={updatedLabel} />
          )}
        </div>
      ) : null}
    </div>
  );
}
