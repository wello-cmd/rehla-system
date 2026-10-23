import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsReportLoader } from '../src/lib/analyticsReport.js';

const payload = url => url.includes('financial-kpis') ? [] : { totalRevenue: 0, totalOrders: 0 };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('a slower previous request cannot replace a later successful report', async () => {
  const previous = deferred();
  let state;
  const loader = createAnalyticsReportLoader(url => url.includes('start=old') ? previous.promise : Promise.resolve(payload(url)), next => { state = next; });
  const old = loader.load({ start: 'old', label: 'Old period' });
  await loader.load({ start: 'new', label: 'New period' });
  previous.resolve({ totalRevenue: 999 });
  await old;
  assert.equal(state.appliedPeriod.label, 'New period');
  assert.equal(state.data.sales.totalRevenue, 0);
  assert.equal(state.loading, false);
});

test('a failed requested period keeps the previous data and its applied label; retry can apply the new period', async () => {
  let fail = false;
  let state;
  const loader = createAnalyticsReportLoader(url => fail ? Promise.reject(new Error('Unavailable')) : Promise.resolve(payload(url)), next => { state = next; });
  await loader.load({ label: 'September' });
  const previousData = state.data;
  fail = true;
  await loader.load({ label: 'October' });
  assert.equal(state.requestedPeriod.label, 'October');
  assert.equal(state.appliedPeriod.label, 'September');
  assert.equal(state.data, previousData);
  assert.equal(state.error, 'Unavailable');
  fail = false;
  await loader.load(state.requestedPeriod);
  assert.equal(state.appliedPeriod.label, 'October');
  assert.equal(state.error, null);
});

test('a legitimate zero report applies normally and sends the six existing requests', async () => {
  const urls = [];
  let state;
  const loader = createAnalyticsReportLoader(url => { urls.push(url); return Promise.resolve(payload(url)); }, next => { state = next; });
  await loader.load({ start: '2026-10-01', end: '2026-10-31', groupBy: 'day', label: 'October' });
  assert.equal(state.data.sales.totalRevenue, 0);
  assert.equal(state.appliedPeriod.label, 'October');
  assert.equal(state.error, null);
  assert.equal(urls.length, 6);
  assert.ok(urls.includes('/analytics/products'));
  assert.ok(urls.includes('/analytics/delivery?start=2026-10-01&end=2026-10-31'));
  assert.ok(urls.includes('/analytics/sales?start=2026-10-01&end=2026-10-31&groupBy=day'));
});

test('an initial failure has no applied report and a superseded failure cannot erase a newer success', async () => {
  let state;
  const old = deferred();
  const loader = createAnalyticsReportLoader(url => url.includes('start=old') ? old.promise.then(() => { throw new Error('Old failure'); }) : Promise.resolve(payload(url)), next => { state = next; });
  const loadingOld = loader.load({ start: 'old', label: 'Old' });
  assert.equal(state.appliedPeriod, null);
  assert.equal(state.data, null);
  await loader.load({ start: 'new', label: 'New' });
  old.resolve();
  await loadingOld;
  assert.equal(state.error, null);
  assert.equal(state.appliedPeriod.label, 'New');
});

test('an initial failed report remains unavailable instead of displaying zeroes', async () => {
  let state;
  const loader = createAnalyticsReportLoader(() => Promise.reject(new Error('Offline')), next => { state = next; });
  await loader.load({ label: 'October' });
  assert.equal(state.data, null);
  assert.equal(state.appliedPeriod, null);
  assert.equal(state.requestedPeriod.label, 'October');
  assert.equal(state.loading, false);
  assert.equal(state.error, 'Offline');
});
