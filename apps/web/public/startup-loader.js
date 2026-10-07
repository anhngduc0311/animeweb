// Discover homepage data before the application bundle finishes downloading.
// Resolve failures so the app can retry without an unhandled rejection.
(() => {
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
