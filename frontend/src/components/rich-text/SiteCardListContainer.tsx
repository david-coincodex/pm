'use client';

import React, { useState } from 'react';

interface Props {
  children: React.ReactNode;
  initialShow: number;
  showMoreLabel: string;
  showLessLabel: string;
}

export default function SiteCardListContainer({ children, initialShow, showMoreLabel, showLessLabel }: Props) {
  const [showAll, setShowAll] = useState(false);
  const childArray = React.Children.toArray(children);
  const visible = showAll ? childArray : childArray.slice(0, initialShow);
  const remaining = childArray.length - initialShow;

  return (
    <div className="not-prose my-4">
      {visible}
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="cursor-pointer rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
          >
            {showAll ? showLessLabel : showMoreLabel}
          </button>
        </div>
      )}
    </div>
  );
}
