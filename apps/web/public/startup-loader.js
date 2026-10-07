// Discover homepage data before the application bundle finishes downloading.
// Resolve failures so the app can retry without an unhandled rejection.
(() => {
  const root = document.documentElement;
  root.classList.add('is-starting');
  let finished = false;
  // A slow API or failed bundle must never leave the page locked indefinitely.
  const timeout = window.setTimeout(finish, 6000);
  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    const loader = document.getElementById('startup-loader');
    loader?.classList.add('is-leaving');
    root.classList.add('startup-leaving');
    window.setTimeout(() => {
      root.classList.remove('is-starting', 'startup-leaving');
      loader?.remove();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
  }
  window.finishStartupLoading = finish;

  if (window.location.pathname !== '/') return;
  window.anidokiSpotlightRequest = fetch('/api/anime/spotlight', {
    signal: AbortSignal.timeout(10000),
  }).then(response => response.ok ? response.json() : null)
    .then(data => {
      const anime = data?.success ? data.data?.[0] : null;
      const image = anime?.bannerImage || anime?.coverImage;
      if (image) {
        const preload = document.createElement('link');
        preload.rel = 'preload';
        preload.as = 'image';
        preload.fetchPriority = 'high';
        preload.href = image;
        document.head.appendChild(preload);
      }
      return data;
    })
    .catch(() => null);
})();
