import { getTranslations } from 'next-intl/server';
import { type Site } from '@/lib/strapi';
import SiteCardInline from '@/components/rich-text/SiteCardInline';
import SiteCardListContainer from '@/components/rich-text/SiteCardListContainer';

interface Props {
  sites: Site[];
  initialShow?: number;
}

export default async function SiteCardInlineList({ sites, initialShow = 5 }: Props) {
  if (!sites.length) return null;
  const t = await getTranslations('richText');
  const remaining = Math.max(0, sites.length - initialShow);

  return (
    <SiteCardListContainer
      initialShow={initialShow}
      showMoreLabel={t('showMore', { count: remaining })}
      showLessLabel={t('showLess')}
    >
      {sites.map((site) => (
        <SiteCardInline key={site.id} site={site} />
      ))}
    </SiteCardListContainer>
  );
}
