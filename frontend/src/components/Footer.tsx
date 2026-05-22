import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import LanguageSwitcher from './LanguageSwitcher';
import { routes } from '@/lib/routes';

export default async function Footer() {
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      {/* Main footer content */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">

          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href={routes.home()} className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Porn<span className="text-slate-400 dark:text-slate-500">Mode</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {t('tagline')}
            </p>
            <div className="mt-5">
              <LanguageSwitcher showLabel />
            </div>
          </div>

          {/* Deals */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t('deals')}
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: routes.home(), label: t('pornDeals') },
                { href: routes.bundles(), label: t('bundles') },
                { href: routes.category('cam-sites'), label: t('liveSex') },
                { href: routes.discounts(), label: 'All Discounts' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t('categories')}
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: routes.category('ai-porn'), label: t('aiPorn') },
                { href: routes.category('vr-porn'), label: t('vrPorn') },
                { href: routes.category('premium-networks'), label: t('premiumNetworks') },
                { href: routes.category('artsy-erotic'), label: t('artsyErotic') },
                { href: routes.category('cam-sites'), label: t('camSites') },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company + Legal */}
          <div className="space-y-8">
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {t('company')}
              </h3>
              <ul className="space-y-2.5">
                {[
                  { href: routes.page('about'), label: t('about') },
                  { href: routes.page('advertise'), label: t('advertise') },
                  { href: routes.page('contact'), label: t('contact') },
                  { href: routes.blog(), label: t('blog') },
                ].map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {t('legal')}
              </h3>
              <ul className="space-y-2.5">
                {[
                  { href: routes.page('terms'), label: t('terms') },
                  { href: routes.page('privacy'), label: t('privacy') },
                  { href: routes.page('cookies'), label: t('cookies') },
                  { href: routes.page('disclaimer'), label: t('disclaimer') },
                  { href: routes.page('affiliate-disclaimer'), label: t('affiliateDisclaimer') },
                ].map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t('copyright', { year })}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            This site is intended for adults 18+ only.
          </p>
        </div>
      </div>
    </footer>
  );
}
