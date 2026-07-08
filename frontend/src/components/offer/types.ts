/** Details about the offer the user clicked — shown in the popup's feedback question. */
export interface OfferInfo {
  id: number;
  /** Slug of the offer's site — used to exclude it from the cross-sell. */
  siteSlug?: string | null;
  siteName?: string | null;
  price?: number | null;
  fullPrice?: number | null;
  /** Raw offerType key ('monthly' | 'yearly' | …); translated in the popup. */
  offerType?: string | null;
  offerKind?: 'subscription' | 'credits' | null;
  credits?: number | null;
}

/** Compact featured-site shape used for the "you might also like" cross-sell. */
export interface CrossSellSite {
  slug: string;
  name: string;
  price: number | null;
  fullPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
}
