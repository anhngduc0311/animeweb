import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMovie, extractEpisodes, kkRequest, movieCatalog } from './kkphim.js';

test('movie pagination scans past TV-only pages, deduplicates and keeps page boundaries', async () => {
  const film = slug => ({ slug, name: slug, tmdb: { type: 'movie' } });
  const pages = [
    [{ slug: 'series', tmdb: { type: 'tv' } }],
    [film('film-a'), film('film-b')],
    [film('film-b'), film('film-c'), film('film-d')]
  ];
  const request = async path => {
    const url = new URL(path, 'https://phimapi.com');
    assert.equal(url.searchParams.get('country'), 'nhat-ban');
    return { data: { items: pages[Number(url.searchParams.get('page')) - 1], params: { pagination: { totalPages: 3 } } } };
  };
  const first = await movieCatalog(1, 2, request);
  assert.deepEqual(first.data.map(m => m.id), ['film-a', 'film-b']);
  assert.equal(first.pagination.hasMore, true);
  const second = await movieCatalog(2, 2, request);
  assert.deepEqual(second.data.map(m => m.id), ['film-c', 'film-d']);
  assert.equal(second.pagination.hasMore, false);
  assert.deepEqual((await movieCatalog(3, 2, request)).data, []);
});

test('movie catalog returns empty only for valid data and propagates upstream errors', async () => {
  const empty = await movieCatalog(-1, 999, async () => ({ data: { items: [] } }));
  assert.deepEqual(empty.pagination, { page: 1, limit: 24, hasMore: false });
  await assert.rejects(movieCatalog(1, 12, async () => ({ data: {} })), /không hợp lệ/);
  await assert.rejects(movieCatalog(1, 12, async () => { throw new Error('upstream offline'); }), /upstream offline/);
});

test('catalog uses native slugs and resolves relative artwork', () => {
  const movie = mapMovie({slug:'test-film',name:'Phim',origin_name:'Film',poster_url:'uploads/test.webp',tmdb:{type:'movie'}});
  assert.equal(movie.id,'test-film');
  assert.equal(movie.coverImage,'https://phimimg.com/uploads/test.webp');
  assert.equal(movie.format,'MOVIE');
  assert.equal(movie.nextAiring,null);
});
test('Vietsub episodes retain specials and exclude other servers or unsafe URLs', () => {
  const episodes=extractEpisodes({episodes:[
    {server_name:'Lồng Tiếng',server_data:[{name:'Dub',link_embed:'https://player.phimapi.com/player/?url=dub'}]},
    {server_name:'Vietsub',server_data:[
      {name:'Tập 01',slug:'tap-01',link_embed:'https://player.phimapi.com/player/?url=1'},
      {name:'Special',slug:'special',link_embed:'https://player.phimapi.com/player/?url=2'},
      {name:'Bad',slug:'bad',link_embed:'https://example.com/player/'}
    ]}
  ]});
  assert.deepEqual(episodes.map(ep=>ep.id),['tap-01','special']);
  assert.deepEqual(episodes.map(ep=>ep.number),[1,2]);
});
test('concurrent catalog requests share cached upstream work', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({status:true,data:{items:[]}})};});
  await Promise.all([kkRequest('/test-cache'),kkRequest('/test-cache')]);
  await kkRequest('/test-cache');
  assert.equal(calls,1);
});
