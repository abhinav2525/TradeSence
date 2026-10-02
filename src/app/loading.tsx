import SiteNav from "@/components/SiteNav";

/** While a page's server queries run: the page's shape, softly shimmering, so navigation never looks frozen. */
export default function Loading() {
  return (
    <>
      <SiteNav current={null} ma="sma200" />
      <main className="lg:pl-60" aria-busy="true" aria-label="Loading">
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton mt-3 h-8 w-72 max-w-full rounded" />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28 rounded-lg" />)}
          </div>
          <div className="skeleton mt-4 h-72 rounded-lg" />
        </div>
      </main>
    </>
  );
}
