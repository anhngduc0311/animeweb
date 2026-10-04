import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateBrowseSeries, loadBrowseEntries } from './services/kkphim.service.js';

const entry = (id, seriesId, season, year, updatedAt) => ({ id, seriesId, seasonNumber: season, year, updatedAt, title: { english: `Show ${seriesId} (Season ${season})` }, source: 'AniDoki' });
test('browse groups before pagination, preserves sort and counts series rather than seasons', () => {
  const items = [entry('a2', 'a', 2, 2026, '2026-10-04'), entry('b', 'b', 1, 2025, '2026-10-03'), entry('a1', 'a', 1, 2020, '2026-01-01'), entry('c', 'c', 1, 2024, '2026-10-02')];
  const first = paginateBrowseSeries(items, { page: 1, limit: 2 });
  const second = paginateBrowseSeries(items, { page: 2, limit: 2 });
  assert.deepEqual(first.items.map(m => m.id), ['a2', 'b']);
  assert.deepEqual(second.items.map(m => m.id), ['c']);
  assert.equal(first.items[0].seasonCount, 2);
  assert.equal(first.items[0].title.english, 'Show a');
  assert.equal(first.pagination.totalItems, 3);
  assert.equal(first.pagination.totalPages, 2);
  assert.equal(second.pagination.hasMore, false);
  assert.deepEqual(paginateBrowseSeries(items, { sort: 'year' }).items.map(m => m.year), [2026, 2025, 2024]);
});

test('source variants do not inflate season count, while movies and remakes stay separate', () => {
  const a = entry('a', '1', 1, 2022, '2026-01-01');
  const result = paginateBrowseSeries([a, { ...a, id: 'nguonc-a', source: 'NguonC', seriesId: null }, { ...a, id: 'remake', seriesId: '2' }, { ...a, id: 'movie', isMovie: true, format: 'MOVIE' }]);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].seasonCount, 1);
});

test('browse collects upstream pages including seasons separated by page boundaries', async () => {
  const seen = [];
  const items = await loadBrowseEntries('/catalog', { category: 'tinh-cam' }, async path => {
    const url = new URL(path, 'https://example.test');
    const page = Number(url.searchParams.get('page'));
    seen.push(page);
    assert.equal(url.searchParams.get('category'), 'tinh-cam');
    return { data: { items: [{ slug: `season-${page}`, name: `Show (Season ${page})`, type: 'hoathinh', tmdb: { type: 'tv', id: '1', season: page } }], params: { pagination: { totalPages: 3 } } } };
  });
  assert.deepEqual(seen, [1, 2, 3]);
  const result = paginateBrowseSeries(items);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].seasonCount, 3);
  await assert.rejects(loadBrowseEntries('/catalog', {}, async () => ({ data: {} })), /không hợp lệ/);
});
