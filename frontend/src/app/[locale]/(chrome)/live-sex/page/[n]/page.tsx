import CamListingPage, { generateMetadata as listingGenerateMetadata } from '../../[[...path]]/page';

/**
 * Hub pagination: /live-sex/page/N (internal — the proxy rewrites external /live-sex/?page=N
 * here). This thin STATIC-segment route exists because route precedence would otherwise hand
 * the 2-segment path to the [site]/[username] model route (site='page' → 404): static beats
 * dynamic, so 'page/N' is reclaimed for the listing. Category pagination
 * (/live-sex/<slug>/page/N) is 3 segments and reaches the [[...path]] catch-all directly.
 * Everything renders through the catch-all's component with the same path grammar.
 */
export const revalidate = 30;

type Props = { params: Promise<{ locale: string; n: string }> };

const toListingParams = async (params: Props['params']) => {
  const { locale, n } = await params;
  return { locale, path: ['page', n] };
};

export async function generateMetadata({ params }: Props) {
  return listingGenerateMetadata({ params: toListingParams(params) });
}

export default async function CamHubPaginationPage({ params }: Props) {
  return CamListingPage({ params: toListingParams(params) });
}
