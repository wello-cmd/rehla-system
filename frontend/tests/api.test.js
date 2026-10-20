import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/lib/api.js';

const originals = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let storage;
beforeEach(() => {
  storage = new Map([['rehla_token', 'expired'], ['rehla_refresh_token', 'refresh-old'], ['rehla_user', '{"role":"worker"}']]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  globalThis.window = { location: { href: '/warehouse/exit' } };
});
afterEach(() => Object.assign(globalThis, originals));

test('role denial preserves the signed-in session and server error', async () => {
  let refreshes = 0;
  globalThis.fetch = async url => {
    if (url === '/api/auth/refresh') { refreshes++; return json({}, 401); }
    return json({ error: 'Insufficient permissions.' }, 403);
  };
  await assert.rejects(api.get('/inventory'), /Insufficient permissions/);
  assert.equal(refreshes, 0);
  assert.equal(storage.get('rehla_token'), 'expired');
  assert.equal(window.location.href, '/warehouse/exit');
});

test('invalid login shows its credential error without refreshing or navigating', async () => {
  let refreshes = 0;
  globalThis.fetch = async url => {
    if (url === '/api/auth/refresh') { refreshes++; return json({}, 401); }
    return json({ error: 'Invalid credentials.' }, 401);
  };
  await assert.rejects(api.post('/auth/login', { email: 'staff@example.com', password: 'wrong' }), /Invalid credentials/);
  assert.equal(refreshes, 0);
  assert.equal(window.location.href, '/warehouse/exit');
});

test('concurrent expired requests share one refresh and both retry with the new token', async () => {
  let refreshes = 0;
  let releaseRefresh;
  const pendingRefresh = new Promise(resolve => { releaseRefresh = resolve; });
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') {
      refreshes++;
      await pendingRefresh;
      return json({ token: 'fresh', refresh_token: 'refresh-new' });
    }
    return options.headers.Authorization === 'Bearer fresh' ? json({ ok: true }) : json({ error: 'Expired.' }, 401);
  };
  const requests = Promise.all([api.get('/invoices'), api.get('/expenses')]);
  await new Promise(resolve => setImmediate(resolve));
  releaseRefresh();
  assert.deepEqual(await requests, [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
  assert.equal(storage.get('rehla_refresh_token'), 'refresh-new');
});

test('failed refresh clears the session and stops retrying', async () => {
  globalThis.fetch = async () => json({ error: 'Expired.' }, 401);
  await assert.rejects(api.get('/invoices'), /Session expired/);
  assert.equal(storage.size, 0);
  assert.equal(window.location.href, '/login');
});

test('a delayed 401 reuses a token refreshed by another completed request', async () => {
  let releaseStaleResponse;
  const staleResponse = new Promise(resolve => { releaseStaleResponse = resolve; });
  let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') {
      refreshes++;
      return json({ token: 'fresh', refresh_token: 'refresh-new' });
    }
    if (options.headers.Authorization === 'Bearer fresh') return json({ ok: true });
    if (url === '/api/invoices') return staleResponse;
    return json({ error: 'Expired.' }, 401);
  };
  const delayed = api.get('/invoices');
  assert.deepEqual(await api.get('/expenses'), { ok: true });
  releaseStaleResponse(json({ error: 'Expired.' }, 401));
  assert.deepEqual(await delayed, { ok: true });
  assert.equal(refreshes, 1);
});

test('a permission denial after refresh preserves the refreshed session', async () => {
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') return json({ token: 'fresh', refresh_token: 'refresh-new' });
    return options.headers.Authorization === 'Bearer fresh'
      ? json({ error: 'Insufficient permissions.' }, 403)
      : json({ error: 'Expired.' }, 401);
  };
  await assert.rejects(api.get('/inventory'), /Insufficient permissions/);
  assert.equal(storage.get('rehla_token'), 'fresh');
  assert.equal(window.location.href, '/warehouse/exit');
});

test('a renewed token rejected with 401 ends the session after one retry', async () => {
  let refreshes = 0;
  let requests = 0;
  globalThis.fetch = async url => {
    if (url === '/api/auth/refresh') {
      refreshes++;
      return json({ token: 'fresh', refresh_token: 'refresh-new' });
    }
    requests++;
    return json({ error: 'Expired.' }, 401);
  };
  await assert.rejects(api.get('/invoices'), /Session expired/);
  assert.equal(refreshes, 1);
  assert.equal(requests, 2);
  assert.equal(storage.size, 0);
  assert.equal(window.location.href, '/login');
});

test('an old failed refresh cannot erase a newer successful login', async () => {
  let releaseRefresh;
  const pendingRefresh = new Promise(resolve => { releaseRefresh = resolve; });
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') return pendingRefresh;
    return options.headers.Authorization === 'Bearer newly-signed-in'
      ? json({ ok: true })
      : json({ error: 'Expired.' }, 401);
  };
  const request = api.get('/invoices');
  await new Promise(resolve => setImmediate(resolve));
  storage.set('rehla_token', 'newly-signed-in');
  storage.set('rehla_refresh_token', 'new-login-refresh');
  storage.set('rehla_user', '{"role":"admin"}');
  releaseRefresh(json({ error: 'Expired refresh token.' }, 401));
  assert.deepEqual(await request, { ok: true });
  assert.equal(storage.get('rehla_token'), 'newly-signed-in');
  assert.equal(storage.get('rehla_refresh_token'), 'new-login-refresh');
  assert.equal(window.location.href, '/warehouse/exit');
});
