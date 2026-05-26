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
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-3 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {showAll ? showLessLabel : showMoreLabel}
        </button>
      )}
    </div>
  );
}
