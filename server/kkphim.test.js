import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMovie, extractEpisodes, kkRequest } from './kkphim.js';

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
