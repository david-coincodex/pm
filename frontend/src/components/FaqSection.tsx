import Container from '@/components/Container';
import SectionTitle from '@/components/SectionTitle';
import FaqAccordion from '@/components/FaqAccordion';
import type { Faq } from '@/lib/strapi';

interface FaqSectionProps {
  faqs?: Faq[] | null;
  title?: string;
  /** Render without the outer <section>/<Container> wrapper, to sit inside an existing container. */
  bare?: boolean;
  /** Hide the "Frequently Asked Questions" heading. */
  hideTitle?: boolean;
  className?: string;
}

/**
 * Reusable FAQ accordion + schema.org FAQPage JSON-LD. Native <details>/<summary>
 * so it works without client JS. Returns null when there are no FAQs.
 * `bare` drops the section/Container wrapper (for placing below content inside the
 * main container); `hideTitle` omits the heading.
 */
export default function FaqSection({ faqs, title = 'Frequently Asked Questions', bare = false, hideTitle = false, className = '' }: FaqSectionProps) {
  const items = (faqs ?? []).filter((f) => f?.question && f?.answer);
  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const body = (
    <>
      {!hideTitle && <SectionTitle as="h2" title={title} />}
      <FaqAccordion items={items} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );

  if (bare) return <div className={`not-prose mt-10 ${className}`}>{body}</div>;

  return (
    <section className={`py-10 lg:py-14 ${className}`}>
      <Container>{body}</Container>
    </section>
  );
}
