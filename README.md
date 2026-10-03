# Animeweb — KKPhim

Run PostgreSQL with the existing .env configuration, then npm run server and npm run dev.
Build: npm run build. Adapter tests: node --test server/kkphim.test.js.

All active catalog, search, details, artwork and episode playback use KKPhim
(https://phimapi.com). Anime listings retain the Japanese animation scope.
The app uses KKPhim slugs as IDs, with no AniList/sample catalog fallback or
cross-provider title matching. Responses are cached for five minutes and
concurrent requests share the same upstream request.

The recent section supports pagination through GET /api/catalog?page=2.
Home sections are selections, not a download of the entire upstream library.
Only episodes from a Vietsub server with an approved KKPhim embed URL appear.
Titles without such episodes show an unavailable message.

Favorites and recently opened episodes persist in separate PostgreSQL tables
kk_watchlist and kk_history. Old AniList-based data remains untouched in the
legacy tables; it is not automatically associated with KKPhim titles.
The iframe does not provide a documented progress API: history records the
opened episode, not exact playback position; auto-next is disabled.

Poster and banner URLs come from KKPhim. Title logos use the IMDb ID supplied
by KKPhim with MetaHub, falling back to a text title if unavailable.
Legacy adapter files are retained but are no longer imported by the server.
