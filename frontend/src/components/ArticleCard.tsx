import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { Article } from '@/lib/strapi';
import { strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

export type ArticleCardVariant = 'featured' | 'grid' | 'compact';

interface ArticleCardProps {
  article: Article;
  locale: string;
  /**
   * featured – large vertical hero card (16/7 cover, 3-line excerpt).
   * grid – horizontal on mobile, vertical (aspect-video top) at sm+. No excerpt.
   * compact – always horizontal, square thumbnail on the left. Shows excerpt if present.
   */
  variant?: ArticleCardVariant;
  /** Priority-load the cover image (use for the featured hero / LCP). */
  priority?: boolean;
  /** Extra classes merged onto the root link (e.g. "lg:col-span-2", "min-h-0 flex-1", "not-prose my-4"). */
  className?: string;
}

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const PlaceholderIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
  </svg>
);

const cardShell =
  'group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800';
const titleBase = 'font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400';
const dateClass = 'text-xs text-slate-400 dark:text-slate-500';
const chipClass = 'w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300';

export default function ArticleCard({ article, locale, variant = 'grid', priority = false, className = '' }: ArticleCardProps) {
  // postId is the production WordPress id — the canonical URL segment (see the blog route).
  const href = routes.blogArticle(article.postId ?? article.id, article.slug);
  const category = article.categories?.[0];
  const dateStr = article.publishDate ?? article.publishedAt;
  const date = dateStr ? formatDate(dateStr, locale) : '';
  const img = article.coverImage;

  // ── Featured: large vertical hero ────────────────────────────────────────
  if (variant === 'featured') {
    return (
      <Link href={href} className={`block ${cardShell} flex h-full flex-col ${className}`}>
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
          {img ? (
            <Image
              src={strapiMediaUrl(img)}
              alt={img.alternativeText ?? article.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 1024px) 100vw, 66vw"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
              <PlaceholderIcon className="h-14 w-14" />
            </div>
          )}
          {category && (
            <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
              {category.name}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className={`text-lg ${titleBase}`}>{article.title}</h3>
          {article.description && (
            <p className="line-clamp-3 text-sm text-slate-500 dark:text-slate-400">{article.description}</p>
          )}
          <p className={`mt-auto pt-2 ${dateClass}`}>{date}</p>
        </div>
      </Link>
    );
  }

  // ── Grid: horizontal on mobile, vertical (aspect-video) at sm+ ────────────
  if (variant === 'grid') {
    return (
      <Link href={href} className={`flex ${cardShell} sm:flex-col ${className}`}>
        <div className="relative aspect-square w-36 shrink-0 self-center overflow-hidden bg-slate-100 dark:bg-slate-700 sm:aspect-video sm:w-full sm:self-auto">
          {img ? (
            <Image
              src={strapiMediaUrl(img)}
              alt={img.alternativeText ?? article.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 144px, (max-width: 1024px) 50vw, 25vw"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
              <PlaceholderIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
          )}
          {/* sm+ only: emerald badge overlaid on the cover */}
          {category && (
            <span className="absolute left-2 top-2 hidden rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white sm:block">
              {category.name}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3 sm:justify-start sm:gap-1">
          {/* Mobile only: inline chip */}
          {category && <span className={`${chipClass} sm:hidden`}>{category.name}</span>}
          <h3 className={`line-clamp-2 text-sm ${titleBase}`}>{article.title}</h3>
          <p className={`pt-1 ${dateClass} sm:mt-auto`}>{date}</p>
        </div>
      </Link>
    );
  }

  // ── Compact: always horizontal, square thumbnail left ─────────────────────
  return (
    <Link href={href} className={`flex ${cardShell} ${className}`}>
      <div className="relative aspect-square w-36 shrink-0 self-center overflow-hidden bg-slate-100 dark:bg-slate-700">
        {img ? (
          <Image
            src={strapiMediaUrl(img)}
            alt={img.alternativeText ?? article.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="144px"
            priority={priority}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
            <PlaceholderIcon className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3">
        {category && <span className={chipClass}>{category.name}</span>}
        <h3 className={`line-clamp-2 text-sm ${titleBase}`}>{article.title}</h3>
        {article.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{article.description}</p>
        )}
        <p className={`pt-1 ${dateClass}`}>{date}</p>
      </div>
    </Link>
  );
}
