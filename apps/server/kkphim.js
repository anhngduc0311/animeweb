import express from 'express';
import { pool } from './db/db.js';
import { seriesKey, seriesTitle, seasonNumber, groupSeries } from '../../shared/series.js';
import { requireAuth, extractBearerToken, getUserByToken } from './authService.js';
import { runMigrations } from './db/migrations.js';
const cache = new Map(), pending = new Map();
export async function kkRequest(path) {
  const hit = cache.get(path);
  if (hit?.until > Date.now()) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const task = (async () => {
    const r = await fetch('https://phimapi.com' + path, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('AniDoki HTTP ' + r.status);
    const data = await r.json();
    if (data.status === false || data.status === 'error') throw new Error('AniDoki không có dữ liệu');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(path, { data, until: Date.now() + 300000 });
    return data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}
export const slugOK = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length < 200;
const image = value => {
  if (!value) return '/poster-placeholder.svg';
  try { const url = new URL(value, 'https://phimimg.com/'); return url.protocol === 'https:' ? url.href : '/poster-placeholder.svg'; } catch { return '/poster-placeholder.svg'; }
};
export function mapMovie(m) {
  const movie = m.tmdb?.type === 'movie' || m.type === 'single';
  return { id: m.slug, title: { english: m.origin_name || m.name, vietnamese: m.name, romaji: m.origin_name || m.name },
    seriesId: !movie && m.tmdb?.type === 'tv' ? m.tmdb.id || null : null,
    seasonNumber: !movie ? Number(m.tmdb?.season) || null : null,
    updatedAt: m.modified?.time || null,
    logo: /^tt\d+$/.test(m.imdb?.id || '') ? 'https://images.metahub.space/logo/medium/' + m.imdb.id + '/img' : null,
    coverImage: image(m.poster_url), bannerImage: image(m.thumb_url),
    score: Number(m.imdb?.vote_average || m.tmdb?.vote_average || 0), studio: 'AniDoki',
    genres: (m.category || []).map(x => x.name), format: movie ? 'MOVIE' : 'TV',
    duration: m.time || 'Đang cập nhật', status: m.status === 'completed' ? 'Finished Airing' : 'Currently Airing',
    year: m.year, startDate: String(m.year || ''), season: String(m.year || ''),
    totalEpisodes: Number(m.episode_total) || null, currentEpisode: m.episode_current?.match(/\d+/)?.[0] || '',
    nextAiring: null, description: (m.content || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    isMovie: movie, language: m.lang || '', source: 'AniDoki' };
}
export function extractEpisodes(detail) {
  const server = detail.episodes?.find(s => /^vietsub$/i.test(s.server_name.trim()));
  return (server?.server_data || []).filter(ep => {
    try { const url = new URL(ep.link_embed); return url.origin === 'https://player.phimapi.com' && url.pathname === '/player/'; } catch { return false; }
  }).map((ep, index) => ({ number: index + 1, id: ep.slug, title: ep.name, embed: ep.link_embed, duration: detail.movie?.time || '' }));
}
export function applyAnimeOverride(anime, override) {
  if (!override) return anime;
  const copy = { ...anime };
  if (override.title_vietnamese) {
    copy.title = { ...(copy.title || {}), vietnamese: override.title_vietnamese };
  }
  if (override.title_english) {
    copy.title = { ...(copy.title || {}), english: override.title_english };
  }
  if (override.description !== undefined && override.description !== null) {
    copy.description = override.description;
  }
  if (override.cover_image) copy.coverImage = override.cover_image;
  if (override.banner_image) copy.bannerImage = override.banner_image;
  if (Array.isArray(override.genres) && override.genres.length) copy.genres = override.genres;
  if (override.status) copy.status = override.status;
  if (Array.isArray(override.custom_seasons) && override.custom_seasons.length) {
    copy.seasons = override.custom_seasons;
  }
  copy.is_hidden = Boolean(override.is_hidden);
  copy.has_override = true;
  copy.notes = override.notes;
  return copy;
}

export async function movieDetail(slug) {
  if (!slugOK(slug)) throw new Error('Mã phim AniDoki không hợp lệ');

  // Kiểm tra can thiệp từ quản trị viên (Admin Overrides)
  let override = null;
  try {
    const oRes = await pool.query('SELECT * FROM anime_overrides WHERE anime_id = $1', [slug]);
    override = oRes.rows[0];
  } catch {}

  if (override && override.is_hidden) {
    const error = new Error('Nội dung không còn khả dụng hoặc đã bị ẩn');
    error.status = 404;
    throw error;
  }

  const detail = await kkRequest('/phim/' + slug);
  if (!detail.movie) throw new Error('Không tìm thấy phim');
  let anime = { ...mapMovie(detail.movie), episodes: extractEpisodes(detail) };

  if (override) {
    anime = applyAnimeOverride(anime, override);
  }

  return anime;
}
export async function relatedSeasons(anime, request = kkRequest) {
  if (anime.isMovie) return [anime];
  const keyword = seriesTitle(anime.title.vietnamese || anime.title.english);
  const matches = new Map([[anime.id, anime]]);
  let page = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ keyword, country: 'nhat-ban', limit: '64', page: String(page) });
    const result = await request('/v1/api/tim-kiem?' + query);
    if (!Array.isArray(result.data?.items)) throw new Error('Không tải được các mùa phim');
    for (const raw of result.data.items) {
      if (raw.type !== 'hoathinh') continue;
      const candidate = mapMovie(raw);
      if (seriesKey(candidate) === seriesKey(anime)) matches.set(candidate.id, candidate);
    }
    totalPages = Number(result.data.params?.pagination?.totalPages) || page;
    page++;
  } while (page <= totalPages);
  return [...matches.values()].sort((a, b) => seasonNumber(a) - seasonNumber(b) || (a.year || 0) - (b.year || 0));
}
async function listing(params = {}) {
  const query = new URLSearchParams({ country: 'nhat-ban', limit: '24', ...params });
  const json = await kkRequest('/v1/api/danh-sach/hoat-hinh?' + query);
  return { items: (json.data?.items || []).map(mapMovie), pagination: json.data?.params?.pagination || {} };
}
export function selectSpotlights(items) {
  const updated = item => Date.parse(item.updatedAt) || 0;
  // Use the newest entry of each series from the recent catalog, then rank it.
  const latest = [...items].sort((a, b) => updated(b) - updated(a));
  return groupSeries(latest)
    .filter(item => Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score || updated(b) - updated(a))
    .slice(0, 7);
}
export function selectTrending(items) {
  return groupSeries(items).filter(item => Number.isFinite(item.score) && item.score >= 7);
}
export async function trendingCatalog(page = 1, limit = 12, request = kkRequest) {
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const series = new Map();
  let upstreamPage = 1, totalPages = 1;
  let eligible = [];
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    if (!Array.isArray(json.data?.items)) throw new Error('Danh sách thịnh hành không hợp lệ');
    totalPages = Number(json.data.params?.pagination?.totalPages) || upstreamPage;
    for (const raw of json.data.items) {
      const item = mapMovie(raw);
      const key = seriesKey(item);
      // The first entry is the latest update, even when it fails the rating filter.
      if (slugOK(item.id) && !series.has(key)) series.set(key, item);
    }
    eligible = selectTrending([...series.values()]);
    upstreamPage++;
  } while (eligible.length <= end && upstreamPage <= totalPages);
  return { data: eligible.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: eligible.length > end } };
}
export async function genreOptions(request = kkRequest) {
  const json = await request('/the-loai');
  if (!Array.isArray(json.data?.items)) throw new Error('Danh sách thể loại không hợp lệ');
  return json.data.items.filter(item => slugOK(item.slug)).map(({ name, slug }) => ({ name, slug }));
}
export async function genreCatalog(categories, page = 1, limit = 12, request = kkRequest) {
  const chosen = [...new Set(categories)];
  const options = await genreOptions(request);
  if (!chosen.length || chosen.some(slug => !options.some(option => option.slug === slug))) {
    const error = new Error('Vui lòng chọn thể loại hợp lệ');
    error.status = 400;
    throw error;
  }
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const series = new Map();
  let upstreamPage = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', category: chosen[0], limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    if (!Array.isArray(json.data?.items)) throw new Error('Danh sách anime không hợp lệ');
    totalPages = Number(json.data.params?.pagination?.totalPages) || upstreamPage;
    for (const raw of json.data.items) {
      const slugs = new Set((raw.category || []).map(category => category.slug));
      if (!chosen.every(slug => slugs.has(slug))) continue;
      const item = mapMovie(raw);
      if (slugOK(item.id) && !series.has(seriesKey(item))) series.set(seriesKey(item), item);
    }
    upstreamPage++;
  } while (series.size <= end && upstreamPage <= totalPages);
  const items = [...series.values()];
  return { data: items.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: items.length > end } };
}
// Paginate matching movies, not the mixed TV/movie upstream pages.
export async function movieCatalog(page = 1, limit = 12, request = kkRequest) {
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const movies = new Map();
  let upstreamPage = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    const items = json.data?.items;
    if (!Array.isArray(items)) throw new Error('Danh sách phim không hợp lệ');
    totalPages = Number(json.data?.params?.pagination?.totalPages) || upstreamPage;
    for (const item of items) {
      const movie = mapMovie(item);
      if (movie.isMovie && slugOK(movie.id)) movies.set(movie.id, movie);
    }
    upstreamPage++;
  } while (movies.size <= end && upstreamPage <= totalPages);
  const all = [...movies.values()];
  return { data: all.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: all.length > end } };
}
export const router = express.Router();
const route = (method, path, fn) => router[method](path, async (req,res) => {
  try {
    await fn(req,res);
  } catch (err) {
    console.warn('AniDoki:', err.message);
    const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
    res.status(status).json({ success: false, message: err.message || 'Không tải được dữ liệu AniDoki. Hãy thử lại.' });
  }
});
const send = (res, data) => res.json({ success:true, data, total: Array.isArray(data) ? data.length : undefined });
route('get','/anime/spotlight', async (req,res) => {
  let customSlugs = [];
  try {
    const cfg = await pool.query('SELECT spotlight_slugs FROM homepage_config WHERE id = $1', ['default']);
    if (cfg.rows.length && Array.isArray(cfg.rows[0].spotlight_slugs) && cfg.rows[0].spotlight_slugs.length) {
      customSlugs = cfg.rows[0].spotlight_slugs;
    }
  } catch (err) {
    // ignore
  }

  if (customSlugs.length > 0) {
    const details = await Promise.allSettled(customSlugs.map(slug => movieDetail(slug)));
    const fulfilled = details.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    if (fulfilled.length > 0) {
      return send(res, fulfilled);
    }
  }

  const {items} = await listing({limit:'36'});
  const selected = selectSpotlights(items);
  const details = await Promise.allSettled(selected.map(m => movieDetail(m.id)));
  send(res, details.map((r,i) => r.status === 'fulfilled'
    ? { ...r.value, score: selected[i].score, updatedAt: selected[i].updatedAt }
    : selected[i]));
});
route('get','/anime/trending', async (req,res) => {
  const result = await trendingCatalog(req.query.page, req.query.limit);
  res.json({ success: true, ...result, total: result.data.length });
});
route('get','/anime/recently-updated', async (req,res) => send(res,(await listing({limit:'36'})).items));
route('get','/catalog', async (req,res) => {
  const page = Math.min(1000,Math.max(1,parseInt(req.query.page) || 1));
  const result = await listing({page:String(page)});
  res.json({success:true,data:result.items,pagination:result.pagination});
});
route('get','/anime/seasonal', async (req,res) => {
  const page = Math.min(100, Math.max(1, parseInt(req.query.page) || 1));
  const [psychological, romance] = await Promise.all([
    listing({ category: 'tam-ly', limit: '24', page: String(page) }),
    listing({ category: 'tinh-cam', limit: '24', page: String(page) })
  ]);
  const seen = new Set();
  const items = [];
  for (const item of [...psychological.items, ...romance.items]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  const totalPages = Math.max(
    Number(psychological.pagination?.totalPages) || 1,
    Number(romance.pagination?.totalPages) || 1
  );
  res.json({
    success: true,
    data: items,
    total: items.length,
    pagination: { page, totalPages, hasMore: page < totalPages }
  });
});
route('get','/anime/movies', async (req,res) => {
  const result = await movieCatalog(req.query.page, req.query.limit);
  res.json({ success: true, ...result, total: result.data.length });
});
route('get','/anime/genres', async (req,res) => {
  const [action,romance] = await Promise.all([listing({category:'hanh-dong',limit:'8'}),listing({category:'tinh-cam',limit:'8'})]);
  send(res,{Action:action.items,Romance:romance.items});
});
route('get','/genre-options', async (req,res) => send(res, await genreOptions()));
route('get','/anime/by-genres', async (req,res) => {
  const categories = String(req.query.categories || '').split(',').filter(Boolean);
  const result = await genreCatalog(categories, req.query.page, req.query.limit);
  res.json({ success: true, ...result });
});
route('get','/anime/:id', async (req,res) => send(res,await movieDetail(req.params.id)));
route('get','/anime/:id/seasons', async (req,res) => send(res,await relatedSeasons(await movieDetail(req.params.id))));
route('get','/anime/:id/episodes', async (req,res) => send(res,(await movieDetail(req.params.id)).episodes));
route('post','/watch/sources', async (req,res) => {
  const {anime_id,episode_number} = req.body;
  if (!slugOK(anime_id) || !Number.isInteger(Number(episode_number)) || Number(episode_number)<1) return res.status(400).json({success:false,message:'Phim hoặc tập không hợp lệ'});

  // Kiểm tra can thiệp từ quản trị viên cho tập phim cụ thể (Episode Override)
  try {
    const epOverrideRes = await pool.query(
      'SELECT * FROM episode_overrides WHERE anime_id = $1 AND episode_number = $2',
      [anime_id, Number(episode_number)]
    );
    const epOverride = epOverrideRes.rows[0];
    if (epOverride) {
      if (epOverride.is_hidden) {
        return res.status(404).json({ success: false, message: 'Tập phim này đang tạm ẩn hoặc bảo trì.' });
      }
      if (epOverride.embed_url) {
        return res.json({ success: true, type: 'embed', provider: 'AniDoki', language: 'vi', embed_url: epOverride.embed_url });
      }
    }
  } catch (err) {
    console.error('Error checking episode override:', err);
  }

  const movie = await movieDetail(anime_id);
  const ep = movie.episodes.find(ep => ep.number === Number(episode_number));
  if (!ep) return res.status(404).json({success:false,message:'AniDoki chưa có tập Vietsub này.'});
  res.json({success:true,type:'embed',provider:'AniDoki',language:'vi',embed_url:ep.embed});
});
route('get','/search', async (req,res) => {
  const keyword = String(req.query.q || '').slice(0,150);
  if (!keyword.trim()) return send(res,[]);
  const data = await kkRequest('/v1/api/tim-kiem?' + new URLSearchParams({keyword,limit:'64',country:'nhat-ban'}));
  send(res,(data.data?.items || []).filter(m => m.type === 'hoathinh').map(mapMovie));
});

// Endpoint Khám phá phim tổng hợp (/browse) hỗ trợ tìm kiếm, lọc thể loại, năm, trạng thái, sắp xếp và phân trang
export async function browseCatalog(params = {}) {
  const {
    q = '',
    category = '',
    year = '',
    status = '',
    sort = 'updated',
    page = 1,
    limit = 24
  } = params;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(48, Math.max(1, parseInt(limit) || 24));

  // Lấy danh sách can thiệp của admin để lọc phim ẩn và áp dụng chỉnh sửa
  let hiddenSet = new Set();
  let overridesMap = new Map();
  try {
    const oRes = await pool.query('SELECT * FROM anime_overrides');
    oRes.rows.forEach(r => {
      if (r.is_hidden) hiddenSet.add(r.anime_id);
      else overridesMap.set(r.anime_id, r);
    });
  } catch (err) {
    console.error('Error fetching anime overrides for browse:', err);
  }

  if (q && q.trim()) {
    const keyword = q.trim().slice(0, 150);
    const query = new URLSearchParams({ keyword, limit: '64', country: 'nhat-ban' });
    const data = await kkRequest('/v1/api/tim-kiem?' + query);
    let items = (data.data?.items || []).filter(m => m.type === 'hoathinh').map(mapMovie);

    // Lọc phim ẩn và áp dụng override
    items = items.filter(m => !hiddenSet.has(m.id)).map(m => {
      const o = overridesMap.get(m.id);
      return o ? applyAnimeOverride(m, o) : m;
    });

    if (category) {
      const catLower = category.toLowerCase();
      items = items.filter(m => (m.genres || []).some(g => g.toLowerCase() === catLower || g.toLowerCase().includes(catLower)));
    }
    if (year) {
      items = items.filter(m => String(m.year) === String(year));
    }
    if (status) {
      if (status === 'completed') items = items.filter(m => m.status === 'Finished Airing');
      else if (status === 'ongoing') items = items.filter(m => m.status === 'Currently Airing');
    }

    if (sort === 'score') {
      items.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    } else if (sort === 'year') {
      items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    }

    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = items.slice(startIndex, startIndex + limitNum);

    return {
      items: paginatedItems,
      pagination: {
        page: pageNum,
        totalPages,
        totalItems,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    };
  } else {
    const queryObj = {
      country: 'nhat-ban',
      limit: String(limitNum),
      page: String(pageNum)
    };
    if (category) queryObj.category = category;
    if (year) queryObj.year = year;

    const query = new URLSearchParams(queryObj);
    const json = await kkRequest('/v1/api/danh-sach/hoat-hinh?' + query);
    let items = (json.data?.items || []).map(mapMovie);

    // Lọc phim ẩn và áp dụng override
    items = items.filter(m => !hiddenSet.has(m.id)).map(m => {
      const o = overridesMap.get(m.id);
      return o ? applyAnimeOverride(m, o) : m;
    });

    if (status) {
      if (status === 'completed') items = items.filter(m => m.status === 'Finished Airing');
      else if (status === 'ongoing') items = items.filter(m => m.status === 'Currently Airing');
    }

    if (sort === 'score') {
      items.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    } else if (sort === 'year') {
      items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    }

    const totalPages = Number(json.data?.params?.pagination?.totalPages) || pageNum;
    const totalItems = Number(json.data?.params?.pagination?.totalItems) || items.length;

    return {
      items,
      pagination: {
        page: pageNum,
        totalPages,
        totalItems,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    };
  }
}

route('get', '/browse', async (req, res) => {
  const result = await browseCatalog(req.query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

// Separate slug-based tables with user_id preserve isolated user watchlists and histories.
export async function initKKUserData() {
  await runMigrations();
}

router.get('/watchlist', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT anime FROM kk_watchlist WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    send(res, result.rows.map(r => r.anime));
  } catch (err) {
    console.error('Watchlist fetch error:', err);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách yêu thích' });
  }
});

router.post('/watchlist/toggle', requireAuth, async (req, res) => {
  try {
    const { animeId } = req.body;
    if (!slugOK(animeId)) {
      return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
    }
    const anime = await movieDetail(animeId);
    const deleted = await pool.query(
      'DELETE FROM kk_watchlist WHERE user_id = $1 AND slug = $2 RETURNING slug',
      [req.user.id, anime.id]
    );
    const saved = !deleted.rowCount;
    if (saved) {
      await pool.query(
        'INSERT INTO kk_watchlist (user_id, slug, anime, status) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, slug) DO NOTHING',
        [req.user.id, anime.id, JSON.stringify(anime), 'plan_to_watch']
      );
    }
    res.json({
      success: true,
      saved,
      message: saved ? 'Đã lưu phim vào danh sách yêu thích' : 'Đã bỏ lưu phim khỏi danh sách yêu thích'
    });
  } catch (err) {
    console.error('Watchlist toggle error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật danh sách yêu thích' });
  }
});

// ==========================================
// THƯ VIỆN CÁ NHÂN (/library)
// ==========================================
router.get('/library', requireAuth, async (req, res) => {
  try {
    const { status = 'all', q = '' } = req.query;
    let sql = 'SELECT slug, anime, status, created_at, updated_at FROM kk_watchlist WHERE user_id = $1';
    const params = [req.user.id];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY updated_at DESC';
    const result = await pool.query(sql, params);

    let items = result.rows.map(r => ({
      ...r.anime,
      libraryStatus: r.status || 'plan_to_watch',
      savedAt: r.created_at,
      updatedAt: r.updated_at
    }));

    if (q && q.trim()) {
      const keyword = q.trim().toLowerCase();
      items = items.filter(a => {
        const eng = (a.title?.english || '').toLowerCase();
        const vie = (a.title?.vietnamese || '').toLowerCase();
        return eng.includes(keyword) || vie.includes(keyword);
      });
    }

    const countRes = await pool.query(
      'SELECT status, count(*) FROM kk_watchlist WHERE user_id = $1 GROUP BY status',
      [req.user.id]
    );
    const counts = { all: 0, plan_to_watch: 0, watching: 0, completed: 0 };
    for (const row of countRes.rows) {
      const s = row.status || 'plan_to_watch';
      const count = parseInt(row.count) || 0;
      counts[s] = (counts[s] || 0) + count;
      counts.all += count;
    }

    res.json({ success: true, data: items, counts });
  } catch (err) {
    console.error('Library error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải thư viện cá nhân' });
  }
});

router.post('/library/status', requireAuth, async (req, res) => {
  try {
    const { animeId, status = 'plan_to_watch' } = req.body;
    if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
    if (!['plan_to_watch', 'watching', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái theo dõi không hợp lệ' });
    }
    let anime = null;
    try {
      anime = await movieDetail(animeId);
    } catch {
      anime = {
        id: animeId,
        title: { vietnamese: animeId, english: animeId },
        coverImage: '/poster-placeholder.svg',
        bannerImage: '/poster-placeholder.svg',
        episodes: [{ number: 1, title: 'Tập 1' }]
      };
    }
    await pool.query(`
      INSERT INTO kk_watchlist (user_id, slug, anime, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, slug)
      DO UPDATE SET status = EXCLUDED.status, anime = EXCLUDED.anime, updated_at = NOW()
    `, [req.user.id, anime.id, JSON.stringify(anime), status]);

    res.json({ success: true, message: 'Đã cập nhật trạng thái trong thư viện', status });
  } catch (err) {
    console.error('Library update error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái thư viện' });
  }
});

router.delete('/library/:animeId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM kk_watchlist WHERE user_id = $1 AND slug = $2', [req.user.id, req.params.animeId]);
    res.json({ success: true, message: 'Đã xóa phim khỏi thư viện' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi xóa khỏi thư viện' });
  }
});

// ==========================================
// LỊCH SỬ XEM (PHÂN TRANG & XÓA)
// ==========================================
router.get('/history', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT count(*) FROM kk_history WHERE user_id = $1', [req.user.id]);
    const total = parseInt(countRes.rows[0].count) || 0;

    const result = await pool.query(
      'SELECT slug, anime, episode, progress_seconds, duration, updated_at FROM kk_history WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
      [req.user.id, limit, offset]
    );
    const items = result.rows.map(r => ({
      animeId: r.slug,
      anime: r.anime,
      episodeNumber: r.episode,
      currentTime: r.progress_seconds || 0,
      duration: r.duration || 0,
      updatedAt: r.updated_at
    }));

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + items.length < total
      }
    });
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ success: false, message: 'Không thể tải lịch sử xem' });
  }
});

router.post('/history', requireAuth, async (req, res) => {
  try {
    const { animeId, episodeNumber, currentTime = 0, duration = 0 } = req.body;
    if (!slugOK(animeId)) {
      return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
    }
    const epNum = Number(episodeNumber);
    if (!Number.isInteger(epNum) || epNum < 1) {
      return res.status(400).json({ success: false, message: 'Tập phim không hợp lệ' });
    }

    let anime = null;
    try {
      anime = await movieDetail(animeId);
    } catch {
      anime = {
        id: animeId,
        title: { vietnamese: animeId, english: animeId },
        coverImage: '/poster-placeholder.svg',
        bannerImage: '/poster-placeholder.svg',
        episodes: [{ number: epNum, title: `Tập ${epNum}` }]
      };
    }

    const progress = Math.max(0, Math.floor(Number(currentTime) || 0));
    const dur = Math.max(0, Math.floor(Number(duration) || 0));

    await pool.query(`
      INSERT INTO kk_history (user_id, slug, anime, episode, progress_seconds, duration, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, slug)
      DO UPDATE SET
        anime = EXCLUDED.anime,
        episode = EXCLUDED.episode,
        progress_seconds = EXCLUDED.progress_seconds,
        duration = EXCLUDED.duration,
        updated_at = NOW()
    `, [req.user.id, anime.id, JSON.stringify(anime), epNum, progress, dur]);

    res.json({ success: true });
  } catch (err) {
    console.error('History save error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu tiến độ xem' });
  }
});

router.delete('/history/:animeId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM kk_history WHERE user_id = $1 AND slug = $2', [req.user.id, req.params.animeId]);
    res.json({ success: true, message: 'Đã xóa phim khỏi lịch sử xem' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi xóa lịch sử xem' });
  }
});

router.delete('/history', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM kk_history WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử xem' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi xóa toàn bộ lịch sử' });
  }
});

// ==========================================
// TIẾP NHẬN BÁO LỖI NGUỒN PHÁT (/reports)
// ==========================================
const reportRateLimits = new Map();
function checkReportRateLimit(key) {
  const now = Date.now();
  const times = (reportRateLimits.get(key) || []).filter(t => now - t < 60000);
  if (times.length >= 5) {
    return false;
  }
  times.push(now);
  reportRateLimits.set(key, times);
  return true;
}

router.post('/reports', async (req, res) => {
  try {
    const token = extractBearerToken(req);
    let userId = null;
    if (token) {
      const user = await getUserByToken(token);
      if (user) userId = user.id;
    }

    // Giới hạn tần suất gửi báo lỗi tránh spam (tối đa 5 báo lỗi / phút)
    const rateLimitKey = userId || req.ip || req.socket?.remoteAddress || 'anon';
    if (!checkReportRateLimit(rateLimitKey)) {
      return res.status(429).json({
        success: false,
        message: 'Bạn đã gửi quá nhiều báo lỗi gần đây. Vui lòng thử lại sau 1 phút.'
      });
    }

    const animeId = req.body.animeId || req.body.anime_id;
    const animeTitle = req.body.animeTitle || req.body.anime_title;
    const episodeNumber = req.body.episodeNumber || req.body.episode_number;
    const provider = req.body.provider || 'AniDoki';
    const issueType = req.body.issueType || req.body.issue_type || 'other';
    const description = req.body.description || '';

    if (!animeId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin anime cần báo lỗi' });
    }

    const insertRes = await pool.query(`
      INSERT INTO reports (user_id, anime_slug, anime_title, episode_number, provider, issue_type, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      userId,
      String(animeId).slice(0, 200),
      String(animeTitle || animeId).slice(0, 255),
      parseInt(episodeNumber) || 1,
      String(provider).slice(0, 100),
      String(issueType).slice(0, 50),
      String(description || '').slice(0, 1000)
    ]);

    res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã báo lỗi! Đội ngũ kỹ thuật sẽ kiểm tra và khắc phục sớm.',
      report: insertRes.rows[0]
    });
  } catch (err) {
    console.error('Report submission error:', err);
    res.status(500).json({ success: false, message: 'Lỗi gửi báo cáo sự cố' });
  }
});

