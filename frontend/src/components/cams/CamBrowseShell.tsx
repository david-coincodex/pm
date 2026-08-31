import { Suspense, type ReactNode } from 'react';
import SidebarCategorySites from '@/components/SidebarCategorySites';

/**
 * The full-width three-zone shell shared by the hub and every category page: filter rail left
 * (lg and up — below lg the SAME rail opens in a bottom sheet from the controls row), content
 * center, live-sex deals right (xl and up). Deliberately NOT the site-wide Container
 * (max-w-7xl) — this section exists to fit more content, so it spans the viewport with only
 * edge padding.
 *
 * The deals sidebar is the only block here that waits on Strapi, so it sits behind its own
 * Suspense boundary: the models grid (in-memory, instant) is flushed to the browser without
 * waiting for it, and the sidebar streams in a moment later. The boundary is INSIDE the page
 * rather than a route-level loading.tsx on purpose — a route-level boundary makes Next answer
 * 200 before the page can call notFound(), turning every bad cam URL into a soft 404.
 */
export default function CamBrowseShell({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8 lg:pb-14">
      <div className={`${rail ? 'lg:grid lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[270px_minmax(0,1fr)_320px]' : 'xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-8'}`}>
        {rail && (
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.300)_transparent] dark:[scrollbar-color:theme(colors.slate.600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              {rail}
            </div>
          </aside>
        )}

        {/* div, not <main>: the chrome layout already provides the page's single main landmark */}
        <div className="min-w-0">{children}</div>

        {/* lg has 2 columns but 3 grid children — without the span this aside auto-places
            into the 270px rail column on row 2. Full row at lg, own track at xl. */}
        <aside className={`mt-10 xl:mt-0 ${rail ? 'lg:col-span-2 xl:col-span-1' : ''}`}>
          <div className="xl:sticky xl:top-24">
            <Suspense>
              <SidebarCategorySites siteType="camsite" />
            </Suspense>
          </div>
        </aside>
      </div>
    </div>
  );
}
