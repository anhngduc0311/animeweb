import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapNguonc, extractNguoncEpisodes, searchNguonc } from './services/nguonc.service.js';
import { mergeSeasons, sameSeries } from './services/catalogSources.service.js';
import { mapMovie } from './services/kkphim.service.js';
import { validEmbed } from '../../shared/providers.js';

const base = 'honzuki-no-gekokujou-shisho-ni-naru-tame-ni-wa-shudan-wo-erandeiraremasen';
test('Bookworm links four seasons and keeps the two 2026 sources in one season', () => {
  const current = mapMovie({ slug: 'co-nang-mot-sach', name: 'Cô Nàng Mọt Sách', year: 2026, tmdb: { type: 'tv', id: '91768', season: 2 } });
  const seasons = [base, base + '-2nd-season', base + '-3rd-season', 'honzuki-no-gekokujou-4th-season'].map((slug, i) => mapNguonc({ slug, name: slug, year: [2019, 2020, 2022, 2026][i] }));
  const merged = mergeSeasons(current, seasons);
  assert.deepEqual(merged.map(s => s.seasonNumber), [1, 2, 3, 4]);
  assert.deepEqual(merged[3].sources.map(s => s.source), ['AniDoki', 'NguonC']);
  assert.equal(mergeSeasons(seasons[0], [current, ...seasons]).length, 4);
  assert.equal(sameSeries(current, { ...seasons[0], seriesId: 'different' }), false);
  assert.equal(sameSeries(current, { ...seasons[0], isMovie: true }), false);
});

test('NguonC episodes retain episode numbers, deduplicate mirrors and reject unsafe embeds', () => {
  const ep = (name, embed = 'https://embed1.streamc.xyz/embed.php?hash=test') => ({ name, embed });
  const result = extractNguoncEpisodes({ episodes: [
    { server_name: 'Vietsub #1', items: [ep('3'), ep('1'), ep('2', 'https://evil.example/embed.php'), ep('OVA')] },
    { server_name: 'Vietsub #2', items: [ep('1')] },
    { server_name: 'Thuyết minh', items: [ep('4')] }
  ] });
  assert.deepEqual(result.map(e => e.number), [1, 3]);
  for (const url of ['http://embed1.streamc.xyz/embed.php', 'https://embed1.streamc.xyz.evil.test/embed.php', 'javascript:alert(1)', 'https://user@embed1.streamc.xyz/embed.php']) assert.equal(validEmbed(url, 'NguonC'), false);
  assert.equal(validEmbed('https://embed14.streamc.xyz/embed.php?hash=test', 'NguonC'), true);
});

test('search hydrates category-free summaries, pages results, tolerates a bad detail and excludes live action', async () => {
  const calls = [];
  const category = { a: { group: { name: 'Thể loại' }, list: [{ name: 'Hoạt hình' }] }, b: { group: { name: 'Quốc gia' }, list: [{ name: 'Nhật Bản' }] } };
  const result = await searchNguonc('test', async path => {
    calls.push(path);
    if (path.startsWith('/films/')) return { items: path.includes('page=1') ? [{ slug: 'anime' }, { slug: 'broken' }] : [{ slug: 'live-action' }], paginate: { total_page: 2 } };
    if (path.endsWith('broken')) throw new Error('offline');
    return { movie: { slug: path.split('/').pop(), name: 'Example 2nd Season', category: path.endsWith('anime') ? category : {} } };
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'nguonc-anime');
  assert.equal(result[0].seasonNumber, 2);
  assert.ok(calls.some(path => path.includes('page=2')));
});
