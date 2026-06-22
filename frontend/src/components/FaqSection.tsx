import Container from '@/components/Container';
import FaqAccordion from '@/components/FaqAccordion';
import type { Faq } from '@/lib/strapi';

interface FaqSectionProps {
  faqs?: Faq[] | null;
  /** Render without the outer <section>/<Container> wrapper, to sit inside an existing container. */
  bare?: boolean;
  className?: string;
}

/**
 * Reusable FAQ accordion + schema.org FAQPage JSON-LD. Native <details>/<summary>
 * so it works without client JS. Returns null when there are no FAQs.
 * `bare` drops the section/Container wrapper (for placing below content inside the main container).
 */
export default function FaqSection({ faqs, bare = false, className = '' }: FaqSectionProps) {
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
