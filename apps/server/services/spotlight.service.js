// The homepage needs presentation metadata, never episode streams or admin notes.
const fields = ['id', 'title', 'seriesId', 'seasonNumber', 'isMovie', 'format',
  'bannerImage', 'coverImage', 'logo', 'score', 'studio', 'status', 'description',
  'year', 'updatedAt', 'currentEpisode', 'totalEpisodes'];

export function spotlightSummary(anime) {
  return Object.fromEntries(fields.filter(key => anime[key] !== undefined)
    .map(key => [key, anime[key]]));
}
