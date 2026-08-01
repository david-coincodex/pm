import type { Schema, Struct } from '@strapi/strapi';

export interface ContentProsCons extends Struct.ComponentSchema {
  collectionName: 'components_content_pros_cons';
  info: {
    description: 'A list of pros and cons';
    displayName: 'Pros & Cons';
    icon: 'thumbs-up';
  };
  attributes: {
    cons: Schema.Attribute.JSON;
    pros: Schema.Attribute.JSON;
  };
}

export interface ContentRichText extends Struct.ComponentSchema {
  collectionName: 'components_content_rich_texts';
  info: {
    description: 'A block of rich text content';
    displayName: 'Rich Text';
    icon: 'align-left';
  };
  attributes: {
    body: Schema.Attribute.Blocks;
  };
}

export interface PaymentMethod extends Struct.ComponentSchema {
  collectionName: 'components_payment_methods';
  info: {
    displayName: 'Payment Method';
    icon: 'creditCard';
  };
  attributes: {
    method: Schema.Attribute.Enumeration<
      [
        'american-express',
        'cartes-bancaires',
        'dankort',
        'diners',
        'discover',
        'elo',
        'hipercard',
        'jcb',
        'maestro',
        'mastercard',
        'uatp',
        'unionpay',
        'visa',
        'vpay',
        'apple-pay',
        'google-pay',
        'alipay',
        'amazon-pay',
        'availabill',
        'bancontact',
        'blik',
        'boncard',
        'bonus-card',
        'butterfly-card',
        'cembrapay',
        'crif',
        'crypto',
        'ebill',
        'eps',
        'giropay',
        'half-fare-plus',
        'ideal',
        'klarna',
        'lunch-check',
        'mediamarkt',
        'migros-giftcard',
        'mobilepay',
        'paycard',
        'paypal',
        'paysafecard',
        'pointspay',
        'postfinance-card',
        'postfinance-efinance',
        'postfinance-pay',
        'powerpay',
        'przelewy24',
        'reka',
        'samsung-pay',
        'sepa',
        'skrill',
        'swish',
        'swisscom-pay',
        'swisspass',
        'twint',
        'vipps',
        'wechat-pay',
        'wero',
      ]
    >;
  };
}

export interface ReviewCamsiteScores extends Struct.ComponentSchema {
  collectionName: 'components_review_camsite_scores';
  info: {
    description: 'Score breakdown for cam site reviews (each field 1-10)';
    displayName: 'Cam Site Scores';
    icon: 'star';
  };
  attributes: {
    features: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    interactivity: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    mobileExperience: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    modelVariety: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    privacy: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    privateShows: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    streamQuality: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    value: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
  };
}

export interface ReviewPaysiteScores extends Struct.ComponentSchema {
  collectionName: 'components_review_paysite_scores';
  info: {
    description: 'Score breakdown for paysite reviews (each field 1-10)';
    displayName: 'Paysite Scores';
    icon: 'star';
  };
  attributes: {
    contentAmount: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    contentQuality: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    downloads: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    exclusivity: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    features: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    mobileExperience: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    streaming: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    updates: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    value: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
  };
}

export interface ReviewReviewSource extends Struct.ComponentSchema {
  collectionName: 'components_review_review_sources';
  info: {
    description: 'External review source URL for a site';
    displayName: 'Review Source';
    icon: 'link';
  };
  attributes: {
    sourceName: Schema.Attribute.String & Schema.Attribute.Required;
    sourceUrl: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedFaq extends Struct.ComponentSchema {
  collectionName: 'components_shared_faqs';
  info: {
    description: 'A single frequently-asked question and its answer';
    displayName: 'FAQ';
    icon: 'question';
  };
  attributes: {
    answer: Schema.Attribute.Text & Schema.Attribute.Required;
    question: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SiteDetailsCamSiteDetails extends Struct.ComponentSchema {
  collectionName: 'components_site_details_cam_site_details';
  info: {
    description: 'Fields specific to cam sites';
    displayName: 'CamSiteDetails';
  };
  attributes: {
    freeCams: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    hasApp: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    modelCount: Schema.Attribute.Integer;
    privateShows: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    tokenBased: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
  };
}

export interface SiteDetailsDatingSiteDetails extends Struct.ComponentSchema {
  collectionName: 'components_site_details_dating_site_details';
  info: {
    description: 'Fields specific to dating sites';
    displayName: 'DatingSiteDetails';
  };
  attributes: {
    freeMessages: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    hasApp: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    monthlyPrice: Schema.Attribute.Decimal;
    targetAudience: Schema.Attribute.Enumeration<
      ['straight', 'gay', 'lesbian', 'bisexual', 'all']
    > &
      Schema.Attribute.DefaultTo<'all'>;
    verifiedProfiles: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
  };
}

export interface SiteDetailsPaySiteDetails extends Struct.ComponentSchema {
  collectionName: 'components_site_details_pay_site_details';
  info: {
    description: 'Fields specific to pay/membership sites';
    displayName: 'PaySiteDetails';
  };
  attributes: {
    exclusive: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    monthlyPrice: Schema.Attribute.Decimal;
    networkName: Schema.Attribute.String;
    niche: Schema.Attribute.String;
    trialDays: Schema.Attribute.Integer;
    trialPrice: Schema.Attribute.Decimal;
    yearlyPrice: Schema.Attribute.Decimal;
  };
}

export interface SiteDetailsTubeSiteDetails extends Struct.ComponentSchema {
  collectionName: 'components_site_details_tube_site_details';
  info: {
    description: 'Fields specific to tube sites';
    displayName: 'TubeSiteDetails';
  };
  attributes: {
    adsSupported: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    has4K: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    hasHD: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    hasPremium: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    videoCount: Schema.Attribute.Integer;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'content.pros-cons': ContentProsCons;
      'content.rich-text': ContentRichText;
      'payment.method': PaymentMethod;
      'review.camsite-scores': ReviewCamsiteScores;
      'review.paysite-scores': ReviewPaysiteScores;
      'review.review-source': ReviewReviewSource;
      'shared.faq': SharedFaq;
      'site-details.cam-site-details': SiteDetailsCamSiteDetails;
      'site-details.dating-site-details': SiteDetailsDatingSiteDetails;
      'site-details.pay-site-details': SiteDetailsPaySiteDetails;
      'site-details.tube-site-details': SiteDetailsTubeSiteDetails;
    }
  }
}
