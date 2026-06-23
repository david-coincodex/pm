'use client';

import { useEffect, useState } from 'react';
import type { Faq } from '@/lib/strapi';

/**
 * Renders the FAQ list expanded on the server (so crawlers read the answers in
 * the initial HTML) and collapses it on the client after hydration. Uses native
 * <details> so the answer text is always present in the DOM.
 */
export default function FaqAccordion({ items }: { items: Faq[] }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(true); }, []);

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
      {items.map((faq) => (
        <details key={faq.id} className="group" open={!collapsed}>
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-slate-900 dark:text-white [&::-webkit-details-marker]:hidden">
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
  );
}
