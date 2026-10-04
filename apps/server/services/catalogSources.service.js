import { kkRequest, mapMovie, relatedSeasons } from './kkphim.service.js';
import { searchNguonc } from './nguonc.service.js';
import { seriesKey, seriesTitle, seasonNumber } from '../../../shared/series.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';

const cleanTitle = title => seriesTitle(title.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, 'Season $1')).normalize('NFKC').toLocaleLowerCase('vi').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
const aliases = anime => [...Object.values(anime.title || {}), ...(anime.aliases || [])].filter(Boolean).map(cleanTitle);
export function sameSeries(a, b) {
  if (a.isMovie || b.isMovie) return a.id === b.id;
  if (a.seriesId && b.seriesId) return seriesKey(a) === seriesKey(b);
  const titles = aliases(a);
  return aliases(b).some(t => t.length > 3 && titles.includes(t));
}

export function mergeSeasons(anime, candidates) {
  const seasons = new Map();
  for (const item of [anime, ...candidates]) {
    if (!sameSeries(anime, item)) continue;
    const number = seasonNumber(item);
    // A differing release year may indicate a special/remake, so keep it separate.
    const key = `${number}:${item.year || ''}`;
    if (!seasons.has(key)) seasons.set(key, { ...item, sources: [] });
    const season = seasons.get(key);
    if (!season.sources.some(s => s.id === item.id)) season.sources.push({ id: item.id, source: item.source });
  }
  return [...seasons.values()].sort((a, b) => seasonNumber(a) - seasonNumber(b) || a.year - b.year);
}

export async function allRelatedSeasons(anime) {
  if (anime.isMovie) return [anime];
  const keyword = anime.seriesSearch || seriesTitle(anime.title.english || anime.title.vietnamese).replace(/\s*\([^)]*\)\s*$/u, '');
  const results = await Promise.allSettled([
    relatedSeasons(anime),
    searchNguonc(keyword),
    ...(anime.seriesSearch === 'Honzuki' && anime.source === 'NguonC'
      ? [kkRequest('/phim/co-nang-mot-sach').then(d => [mapMovie(d.movie)])] : [])
  ]);
  let candidates = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    candidates = candidates.filter(item => !overrides.get(item.id)?.is_hidden);
  } catch {}
  return mergeSeasons(anime, candidates);
}
