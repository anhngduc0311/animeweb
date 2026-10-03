# Animeweb

Run `npm run server` and `npm run dev` with PostgreSQL configured in `.env`.
Build with `npm run build`. Check the streaming adapter with
`node --test server/streamService.test.js`.

## Video provider

Playback uses [Anikoto / MegaPlay](https://megaplay.buzz/api). No requests,
cookies, stream decryption or proxying through the previous website are needed.
The local catalog and watch history remain in PostgreSQL; local anime IDs are
AniList IDs, not Anikoto series IDs.

The backend reads the latest 100 entries from `https://anikotoapi.site/recent-anime`
and matches `ani_id` before requesting `/series/{id}`. It caches responses for
five minutes and combines concurrent requests. Matched series use the actual
episode list, available SUB/DUB languages and `episode_embed_id`.

Titles outside this recent feed, or an unavailable Anikoto API, use the documented
MegaPlay `/stream/ani/{anilist-id}/{episode}/{sub|dub}` endpoint and local episode
metadata. MegaPlay does not guarantee mapping coverage for every AniList title;
an iframe URL alone does not confirm video availability. This is not a full
Anikoto catalog synchronization.

The browser embeds MegaPlay directly, with its own playback controls. Trusted
player messages update history and advance episodes when auto-next is enabled.
Programmatic seek/resume is not documented by this API; users can seek inside
the embedded player. SUB does not guarantee Vietnamese subtitles.
