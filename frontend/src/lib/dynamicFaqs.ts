import {
  getDiscountPercent,
  getMaxDiscountPercent,
  type Faq,
  type Offer,
  type Site,
} from '@/lib/strapi';

/**
 * Dynamic, offer-driven FAQs computed at render time from a site's live offers and
 * platform data. Because they're derived (never stored), the answers stay current
 * automatically when offers/prices/payment methods change — no regeneration needed.
 *
 * Each template is only emitted when its underlying data exists, so we never render
 * an empty or "N/A" answer. These are merged ahead of the AI-generated static FAQs
 * on the discounts page. IDs are negative to avoid colliding with Strapi `Faq.id`.
 */

/** How each billing type reads inside a price sentence. */
const BILLING_PHRASE: Record<NonNullable<Offer['offerType']>, string> = {
  trial: 'for the trial',
  monthly: 'per month',
  quarterly: 'per quarter',
  yearly: 'per year',
  lifetime: 'for lifetime access',
  credits: 'for a credits package',
};

/** Brand-name overrides for payment-method slugs; everything else is title-cased. */
const PAYMENT_LABELS: Record<string, string> = {
  'american-express': 'American Express',
  'apple-pay': 'Apple Pay',
  'google-pay': 'Google Pay',
  'amazon-pay': 'Amazon Pay',
  'samsung-pay': 'Samsung Pay',
  'wechat-pay': 'WeChat Pay',
  'diners': 'Diners Club',
  'unionpay': 'UnionPay',
  'paypal': 'PayPal',
  'jcb': 'JCB',
  'sepa': 'SEPA',
  'vpay': 'V PAY',
  'ideal': 'iDEAL',
  'twint': 'TWINT',
  'uatp': 'UATP',
  'eps': 'EPS',
  'blik': 'BLIK',
  'crypto': 'Crypto',
};

function paymentLabel(method: string): string {
  return (
    PAYMENT_LABELS[method] ??
    method
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/** Format a price like the UI does ($X.XX). */
function fmtPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Join a list naturally: "A, B and C". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function buildDynamicFaqs(site: Site): Faq[] {
  const name = site.name;
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive && o.price > 0);
  const faqs: Faq[] = [];
  let id = -1; // synthetic, negative ids never collide with Strapi's

  // Price — from the cheapest active offer.
  const cheapest = activeOffers.reduce<Offer | null>(
    (min, o) => (min === null || o.price < min.price ? o : min),
    null
  );
  if (cheapest) {
    const billing = cheapest.offerType ? BILLING_PHRASE[cheapest.offerType] : '';
    const discount = getDiscountPercent(cheapest);
    let answer = `${name} starts at ${fmtPrice(cheapest.price)}${billing ? ` ${billing}` : ''} through this deal.`;
    if (discount && cheapest.full_price) {
      answer += ` That's ${discount}% off the regular price of ${fmtPrice(cheapest.full_price)}.`;
    }
    faqs.push({ id: id--, question: `How much does ${name} cost?`, answer });
  }

  // Discount — highest across active offers.
  const maxDiscount = getMaxDiscountPercent(activeOffers);
  if (maxDiscount) {
    faqs.push({
      id: id--,
      question: `Is there a ${name} discount?`,
      answer: `Yes. Through this deal you can save up to ${maxDiscount}% compared to ${name}'s regular price.`,
    });
  }

  // Free trial — if a trial offer exists.
  const trial = activeOffers.find((o) => o.offerType === 'trial');
  if (trial) {
    faqs.push({
      id: id--,
      question: `Does ${name} offer a trial?`,
      answer: `Yes — you can try ${name} with a trial for ${fmtPrice(trial.price)}.`,
    });
  }

  // Downloads — only assert the positive case to avoid false negatives.
  if (activeOffers.some((o) => o.allowsDownloads)) {
    faqs.push({
      id: id--,
      question: `Can I download videos from ${name}?`,
      answer: `Yes — ${name} lets you download videos so you can keep and watch them offline.`,
    });
  }

  // Payment methods — from the platform.
  const methods = (site.platform?.paymentMethods ?? []).map((m) => m.method).filter(Boolean);
  if (methods.length) {
    faqs.push({
      id: id--,
      question: `What payment methods does ${name} accept?`,
      answer: `${name} accepts ${joinList(methods.map(paymentLabel))}.`,
    });
  }

  return faqs;
}
