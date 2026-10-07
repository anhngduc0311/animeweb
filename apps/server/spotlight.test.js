import test from 'node:test';
import assert from 'node:assert/strict';
import { spotlightSummary } from './services/spotlight.service.js';
import { groupSeries } from '../../shared/series.js';

test('spotlights exclude large playback payloads while preserving series and presentation data', () => {
  const anime = {
    id: 'season-2', title: { english: 'Example Season 2' }, seriesId: '123', seasonNumber: 2,
    bannerImage: 'https://example.com/banner.webp', description: 'Synopsis', score: 8.5,
    episodes: Array.from({ length: 1200 }, (_, number) => ({ number, stream: 'https://example.com/video.m3u8' })),
    servers: [{ episodes: ['private-playback-data'] }], notes: 'Admin only',
    seasons: [{ episodes: ['nested-playback-data'] }],
  };
  const summary = spotlightSummary(anime);
  assert.equal(summary.episodes, undefined);
  assert.equal(summary.servers, undefined);
  assert.equal(summary.seasons, undefined);
  assert.equal(summary.notes, undefined);
  assert.equal(summary.bannerImage, anime.bannerImage);
  assert.equal(summary.description, 'Synopsis');
  assert.equal(summary.score, 8.5);
  assert.equal(summary.seasonNumber, 2);
  assert.equal(groupSeries([summary, { ...summary, id: 'season-1', seasonNumber: 1 }]).length, 1);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(anime).length / 100);
  assert.equal(anime.episodes.length, 1200);
});
