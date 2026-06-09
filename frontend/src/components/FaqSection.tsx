import Container from '@/components/Container';
import SectionTitle from '@/components/SectionTitle';
import type { Faq } from '@/lib/strapi';

interface FaqSectionProps {
  faqs?: Faq[] | null;
  title?: string;
  className?: string;
}

/**
 * Renders a reusable FAQ accordion at the bottom of a page, plus schema.org
 * FAQPage JSON-LD. Native <details>/<summary> so it works without client JS.
 * Returns null when there are no FAQs.
 */
export default function FaqSection({ faqs, title = 'Frequently Asked Questions', className = '' }: FaqSectionProps) {
  const items = (faqs ?? []).filter((f) => f?.question && f?.answer);
  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };

  return (
    <section className={`py-10 lg:py-14 ${className}`}>
      <Container>
        <SectionTitle as="h2" title={title} />
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {items.map((faq) => (
            <details key={faq.id} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:text-white dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                {faq.question}
                <svg
                  className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </summary>
              <p className="whitespace-pre-line px-5 pb-5 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
