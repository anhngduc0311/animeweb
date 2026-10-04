import express from 'express';
import { pool } from './db/db.js';
import { seriesKey, seriesTitle, seasonNumber } from '../../shared/series.js';
const cache = new Map(), pending = new Map();
export async function kkRequest(path) {
  const hit = cache.get(path);
  if (hit?.until > Date.now()) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const task = (async () => {
    const r = await fetch('https://phimapi.com' + path, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('KKPhim HTTP ' + r.status);
    const data = await r.json();
    if (data.status === false || data.status === 'error') throw new Error('KKPhim không có dữ liệu');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(path, { data, until: Date.now() + 300000 });
    return data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}
const slugOK = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length < 200;
const image = value => {
  if (!value) return '/poster-placeholder.svg';
  try { const url = new URL(value, 'https://phimimg.com/'); return url.protocol === 'https:' ? url.href : '/poster-placeholder.svg'; } catch { return '/poster-placeholder.svg'; }
};
export function mapMovie(m) {
  const movie = m.tmdb?.type === 'movie' || m.type === 'single';
  return { id: m.slug, title: { english: m.origin_name || m.name, vietnamese: m.name, romaji: m.origin_name || m.name },
    seriesId: !movie && m.tmdb?.type === 'tv' ? m.tmdb.id || null : null,
    seasonNumber: !movie ? Number(m.tmdb?.season) || null : null,
    logo: /^tt\d+$/.test(m.imdb?.id || '') ? 'https://images.metahub.space/logo/medium/' + m.imdb.id + '/img' : null,
    coverImage: image(m.poster_url), bannerImage: image(m.thumb_url),
    score: Number(m.imdb?.vote_average || m.tmdb?.vote_average || 0), studio: 'KKPhim',
    genres: (m.category || []).map(x => x.name), format: movie ? 'MOVIE' : 'TV',
    duration: m.time || 'Đang cập nhật', status: m.status === 'completed' ? 'Finished Airing' : 'Currently Airing',
    year: m.year, startDate: String(m.year || ''), season: String(m.year || ''),
    totalEpisodes: Number(m.episode_total) || null, currentEpisode: m.episode_current?.match(/\d+/)?.[0] || '',
    nextAiring: null, description: (m.content || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    isMovie: movie, language: m.lang || '', source: 'KKPhim' };
}
export function extractEpisodes(detail) {
  const server = detail.episodes?.find(s => /^vietsub$/i.test(s.server_name.trim()));
  return (server?.server_data || []).filter(ep => {
    try { const url = new URL(ep.link_embed); return url.origin === 'https://player.phimapi.com' && url.pathname === '/player/'; } catch { return false; }
  }).map((ep, index) => ({ number: index + 1, id: ep.slug, title: ep.name, embed: ep.link_embed, duration: detail.movie?.time || '' }));
}
export async function movieDetail(slug) {
  if (!slugOK(slug)) throw new Error('Mã phim KKPhim không hợp lệ');
  const detail = await kkRequest('/phim/' + slug);
  if (!detail.movie) throw new Error('Không tìm thấy phim');
  return { ...mapMovie(detail.movie), episodes: extractEpisodes(detail) };
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
  try { await fn(req,res); } catch (err) { console.warn('KKPhim:', err.message); res.status(502).json({ success:false, message:'Không tải được dữ liệu KKPhim. Hãy thử lại.' }); }
});
const send = (res, data) => res.json({ success:true, data, total: Array.isArray(data) ? data.length : undefined });
route('get','/anime/spotlight', async (req,res) => {
  const {items} = await listing();
  const details = await Promise.allSettled(items.slice(0,4).map(m => movieDetail(m.id)));
  send(res, details.map((r,i) => r.status === 'fulfilled' ? r.value : items[i]));
});
route('get','/anime/trending', async (req,res) => send(res,(await listing({limit:'36'})).items));
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
route('get','/anime/:id', async (req,res) => send(res,await movieDetail(req.params.id)));
route('get','/anime/:id/seasons', async (req,res) => send(res,await relatedSeasons(await movieDetail(req.params.id))));
route('get','/anime/:id/episodes', async (req,res) => send(res,(await movieDetail(req.params.id)).episodes));
route('post','/watch/sources', async (req,res) => {
  const {anime_id,episode_number} = req.body;
  if (!slugOK(anime_id) || !Number.isInteger(Number(episode_number)) || Number(episode_number)<1) return res.status(400).json({success:false,message:'Phim hoặc tập không hợp lệ'});
  const movie = await movieDetail(anime_id);
  const ep = movie.episodes.find(ep => ep.number === Number(episode_number));
  if (!ep) return res.status(404).json({success:false,message:'KKPhim chưa có tập Vietsub này.'});
  res.json({success:true,type:'embed',provider:'KKPhim',language:'vi',embed_url:ep.embed});
});
route('get','/search', async (req,res) => {
  const keyword = String(req.query.q || '').slice(0,150);
  if (!keyword.trim()) return send(res,[]);
  const data = await kkRequest('/v1/api/tim-kiem?' + new URLSearchParams({keyword,limit:'64',country:'nhat-ban'}));
  send(res,(data.data?.items || []).filter(m => m.type === 'hoathinh').map(mapMovie));
});
// Separate slug-based tables preserve legacy AniList records without false mappings.
export async function initKKUserData() {
  await pool.query('CREATE TABLE IF NOT EXISTS kk_watchlist (slug TEXT PRIMARY KEY, anime JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())');
  await pool.query('CREATE TABLE IF NOT EXISTS kk_history (slug TEXT PRIMARY KEY, anime JSONB NOT NULL, episode INTEGER NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())');
}
route('get','/watchlist',async(req,res)=>send(res,(await pool.query('SELECT anime FROM kk_watchlist ORDER BY created_at DESC')).rows.map(r=>r.anime)));
route('post','/watchlist/toggle',async(req,res)=>{
  const anime = await movieDetail(req.body.animeId);
  const deleted = await pool.query('DELETE FROM kk_watchlist WHERE slug=$1 RETURNING slug',[anime.id]);
  const saved = !deleted.rowCount;
  if(saved) await pool.query('INSERT INTO kk_watchlist(slug,anime) VALUES($1,$2) ON CONFLICT DO NOTHING',[anime.id,JSON.stringify(anime)]);
  res.json({success:true,saved,message:saved?'Đã lưu phim':'Đã bỏ lưu phim'});
});
route('get','/history',async(req,res)=>send(res,(await pool.query('SELECT * FROM kk_history ORDER BY updated_at DESC LIMIT 20')).rows.map(r=>({animeId:r.slug,anime:r.anime,episodeNumber:r.episode,currentTime:0,duration:0}))));
route('post','/history',async(req,res)=>{
  const anime = await movieDetail(req.body.animeId);
  const episode=Number(req.body.episodeNumber);
  if(!anime.episodes.some(ep=>ep.number===episode)) return res.status(400).json({success:false});
  await pool.query('INSERT INTO kk_history(slug,anime,episode) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET anime=$2,episode=$3,updated_at=NOW()',[anime.id,JSON.stringify(anime),episode]);
  res.json({success:true});
});
