import { getTranslations } from 'next-intl/server';

interface FeaturedHeaderProps {
  locale?: string;
}

export default async function FeaturedHeader({ locale = 'en' }: FeaturedHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'featured' });

  return (
    <div className="mb-8">
      <span className="inline-block rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">
        {t('eyebrow')}
      </span>
      <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{t('title')}</h2>
      <p className="mt-2 max-w-xl text-slate-400">{t('subtitle')}</p>
    </div>
  );
}
