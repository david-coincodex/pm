import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getReviewBySiteSlug, PaysiteScores, CamsiteScores, strapiMediaUrl } from '@/lib/strapi';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import RichText from '@/components/RichText';
import ProsConsList from '@/components/review/ProsConsList';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const review = await getReviewBySiteSlug(slug, locale);
  if (!review) return {};

  const canonical =
    locale === routing.defaultLocale ? `/reviews/${slug}/` : `/${locale}/reviews/${slug}/`;

  return {
    title: review.metaTitle ?? review.title,
    description: review.description ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale ? `/reviews/${slug}/` : `/${loc}/reviews/${slug}/`,
        ])
      ),
    },
  };
}

function calcOverall(scores: PaysiteScores | CamsiteScores): number {
  const vals = Object.entries(scores)
    .filter(([key]) => key !== 'id')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number' && v !== null);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 6) return 'bg-amber-400';
  return 'bg-red-400';
}

function overallRingColor(score: number): string {
  if (score >= 8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 6) return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

interface ScoreRowProps {
  label: string;
  score: number;
}

function ScoreRow({ label, score }: ScoreRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{score}/10</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-2 rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

export default async function ReviewDetailPage({ params }: Props) {
  const { locale, slug } = await params;

  const [review, t, tScores] = await Promise.all([
    getReviewBySiteSlug(slug, locale),
    getTranslations({ locale, namespace: 'reviews' }),
    getTranslations({ locale, namespace: 'scores' }),
  ]);

  if (!review) notFound();

  const site = review.site;
  const siteImage = site.cover_image ?? site.logo;
  const scores = review.paysiteScores ?? review.camsiteScores;
  const overall = scores ? calcOverall(scores) : null;

  const paysiteEntries: [keyof PaysiteScores, string][] = [
    ['contentQuality', tScores('contentQuality')],
    ['contentAmount', tScores('contentAmount')],
    ['value', tScores('value')],
    ['updates', tScores('updates')],
    ['exclusivity', tScores('exclusivity')],
    ['features', tScores('features')],
    ['downloads', tScores('downloads')],
    ['streaming', tScores('streaming')],
    ['mobileExperience', tScores('mobileExperience')],
  ];

  const camsiteEntries: [keyof CamsiteScores, string][] = [
    ['modelVariety', tScores('modelVariety')],
    ['streamQuality', tScores('streamQuality')],
    ['features', tScores('features')],
    ['value', tScores('value')],
    ['interactivity', tScores('interactivity')],
    ['mobileExperience', tScores('mobileExperience')],
    ['privacy', tScores('privacy')],
    ['privateShows', tScores('privateShows')],
  ];

  const pros = review.pros?.split('\n').map((s) => s.trim()).filter(Boolean) ?? [];
  const cons = review.cons?.split('\n').map((s) => s.trim()).filter(Boolean) ?? [];

  const publishDate = review.publishDate
    ? new Date(review.publishDate).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const sidebar = (
    <div className="space-y-6">
      {/* Overall score */}
      {overall !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {t('overallScore')}
          </p>
          <p className={`text-6xl font-black tabular-nums ${overallRingColor(overall)}`}>
            {overall}
          </p>
          <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">/10</p>
        </div>
      )}

      {/* Score breakdown */}
      {scores && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="space-y-3">
            {review.paysiteScores &&
              paysiteEntries.map(([key, label]) => {
                const val = review.paysiteScores![key];
                if (val === null) return null;
                return <ScoreRow key={key} label={label} score={val} />;
              })}
            {review.camsiteScores &&
              camsiteEntries.map(([key, label]) => {
                const val = review.camsiteScores![key];
                if (val === null) return null;
                return <ScoreRow key={key} label={label} score={val} />;
              })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Container className="py-10 lg:py-14">
      <SidebarLayout sidebar={sidebar}>
        {/* Cover image */}
        {siteImage && (
          <div className="mb-8 overflow-hidden rounded-2xl">
            <Image
              src={strapiMediaUrl(siteImage)}
              alt={siteImage.alternativeText ?? site.name}
              width={siteImage.width}
              height={siteImage.height}
              className="w-full object-cover"
            />
          </div>
        )}

        {/* Meta */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          {review.authors.length > 0 && (
            <span>
              {t('by')}{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {review.authors.map((a) => a.name).join(', ')}
              </span>
            </span>
          )}
          {review.editors.length > 0 && (
            <span>
              · {t('editedBy')}{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {review.editors.map((e) => e.name).join(', ')}
              </span>
            </span>
          )}
          {publishDate && (
            <span>· {t('publishedOn')} {publishDate}</span>
          )}
        </div>

        <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {review.title}
        </h1>

        {review.description && (
          <p className="mb-8 text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            {review.description}
          </p>
        )}

        {/* Pros / Cons */}
        {(pros.length > 0 || cons.length > 0) && (
          <div className="mb-8">
            <ProsConsList pros={pros} cons={cons} />
          </div>
        )}

        {/* Main content */}
        {review.content && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={review.content} />
          </div>
        )}
      </SidebarLayout>
    </Container>
  );
}
