import { lazy, Suspense } from 'react';

// Keep the app shell available while loading only the requested screen.
export function lazyPage(load, exportName = 'default') {
  const Page = lazy(() => load().then(module => ({ default: module[exportName] })));
  function LazyPage(props) {
    return <Suspense fallback={<div role="status" className="p-6 text-sm text-slate-500" aria-busy="true">Loading…</div>}><Page {...props} /></Suspense>;
  }
  LazyPage.displayName = `Lazy(${exportName})`;
  return LazyPage;
}
