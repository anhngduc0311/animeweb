// Prefer provider series IDs; only remove explicit season markers in title fallback.
const marker = /\s*[([]?\s*(?:season|phần|mùa|ss)\s*(\d+)\s*[)\]]?/giu;
export function seriesTitle(title = '') {
  return title.replace(marker, ' ').replace(/\s+/g, ' ').trim();
}
export function seriesKey(anime) {
  if (anime.isMovie || anime.format === 'MOVIE') return `movie:${anime.id}`;
  if (anime.seriesId) return `tv:${anime.seriesId}`;
  const title = seriesTitle(anime.title?.vietnamese || anime.title?.english || '');
  return title ? `title:${title.normalize('NFKC').toLocaleLowerCase('vi')}` : `item:${anime.id}`;
}
export function groupSeries(items) {
  const groups = new Map();
  for (const item of items) {
    const key = seriesKey(item);
    if (!groups.has(key)) groups.set(key, { ...item, seasons: [] });
    const group = groups.get(key);
    if (!group.seasons.some(season => season.id === item.id)) group.seasons.push(item);
  }
  return [...groups.values()];
}
export function seasonNumber(anime) {
  const explicit = `${anime.title?.vietnamese || ''} ${anime.title?.english || ''}`.match(/(?:season|phần|mùa|ss)\s*(\d+)/iu);
  return Number(explicit?.[1] || anime.seasonNumber) || 1;
}
