import test from 'node:test';
import assert from 'node:assert/strict';
import { AniDokiAPI } from './api.js';

test('spotlight consumes early request without downloading the same catalog again', async t => {
  globalThis.window = { anidokiSpotlightRequest: Promise.resolve({ success: true, data: [{ id: 'early' }] }) };
  t.after(() => { delete globalThis.window; });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Duplicate request'); });
  assert.deepEqual(await AniDokiAPI.getSpotlight(), [{ id: 'early' }]);
  assert.equal(window.anidokiSpotlightRequest, undefined);
});

test('failed early spotlight request retries through the API with a timeout', async t => {
  globalThis.window = { anidokiSpotlightRequest: Promise.resolve(null) };
  t.after(() => { delete globalThis.window; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, '/api/anime/spotlight');
    assert.ok(options.signal instanceof AbortSignal);
    return { json: async () => ({ success: true, data: [{ id: 'retry' }] }) };
  });
  assert.deepEqual(await AniDokiAPI.getSpotlight(), [{ id: 'retry' }]);
  assert.equal(calls, 1);
});

test('browse reuses identical filters but refetches after expiry or filter changes', async t => {
  let now = 0;
  const calls = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ success: true, data: [{ id: 'example' }] }) };
  });
  const controller = new AbortController();
  await AniDokiAPI.getBrowse({ sort: 'updated', page: 1 }, { signal: controller.signal });
  await AniDokiAPI.getBrowse({ page: 1, sort: 'updated' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal, controller.signal);
  await AniDokiAPI.getBrowse({ page: 2, sort: 'updated' });
  assert.equal(calls.length, 2);
  now = 60001;
  await AniDokiAPI.getBrowse({ page: 1, sort: 'updated' });
  assert.equal(calls.length, 3);
});

test('aborted browse requests are not cached', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) throw new DOMException('Cancelled', 'AbortError');
    return { ok: true, json: async () => ({ success: true, data: [] }) };
  });
  await assert.rejects(AniDokiAPI.getBrowse({ q: 'cancelled' }), { name: 'AbortError' });
  await AniDokiAPI.getBrowse({ q: 'cancelled' });
  assert.equal(calls, 2);
});
