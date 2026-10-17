const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCheckpointRunner } = require('../src/services/syncCheckpoint');

// This double models the SQL RPC boundary, including shared persistence and
// compare-and-release tokens. Each runner below represents a restarted process.
function checkpointStore(lastSuccess = '2026-09-01T08:00:00.000Z') {
  const row = { lastSuccess, token: null };
  let sequence = 0;
  return {
    row,
    client: {
      async rpc(name, args) {
        if (name === 'rehla_claim_sync') {
          if (row.token) return { data: null, error: null };
          row.token = `lease-${++sequence}`;
          return { data: { token: row.token, since: row.lastSuccess || '1970-01-01T00:00:00.000Z' }, error: null };
        }
        assert.equal(name, 'rehla_finish_sync');
        if (args.p_token !== row.token) return { data: false, error: null };
        if (args.p_success) row.lastSuccess = args.p_started_at;
        row.token = null;
        return { data: true, error: null };
      },
    },
  };
}
const now = () => new Date('2026-10-16T10:00:00.000Z');

test('a restarted process catches up from durable progress after weeks of downtime', async () => {
  const store = checkpointStore();
  let since;
  const run = createCheckpointRunner({ supabase: store.client, now });
  await run('shopify_orders', async cursor => { since = cursor; return { success: true, ordersSynced: 1 }; });
  assert.equal(since, '2026-09-01T07:59:00.000Z');
  assert.equal(store.row.lastSuccess, '2026-10-16T10:00:00.000Z');
  const restarted = createCheckpointRunner({ supabase: store.client, now });
  await restarted('shopify_orders', async cursor => { since = cursor; return { success: true }; });
  assert.equal(since, '2026-10-16T09:59:00.000Z');
});

test('the first run imports complete history rather than a short restart window', async () => {
  const store = checkpointStore(null);
  const run = createCheckpointRunner({ supabase: store.client, now });
  await run('shopify_refunds', async since => {
    assert.equal(since, '1970-01-01T00:00:00.000Z');
    return { synced: 0 };
  });
});

for (const [label, operation] of [
  ['thrown error', async () => { throw new Error('upstream failed'); }],
  ['unsuccessful result', async () => ({ success: false, error: 'Not configured' })],
  ['partial import', async () => ({ synced: 3, errors: ['row failed'] })],
]) {
  test(`${label} releases the lease without moving the checkpoint`, async () => {
    const store = checkpointStore();
    const run = createCheckpointRunner({ supabase: store.client, now });
    await assert.rejects(run('shopify_orders', operation));
    assert.equal(store.row.lastSuccess, '2026-09-01T08:00:00.000Z');
    assert.equal(store.row.token, null);
    await run('shopify_orders', async since => {
      assert.equal(since, '2026-09-01T07:59:00.000Z');
      return { success: true };
    });
  });
}

test('two app instances cannot run the same sync while its lease is held', async () => {
  const store = checkpointStore();
  const first = createCheckpointRunner({ supabase: store.client, now });
  const second = createCheckpointRunner({ supabase: store.client, now });
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const running = first('shopify_orders', async () => { await barrier; return { success: true }; });
  const skipped = await second('shopify_orders', () => assert.fail('overlapping job started'));
  assert.deepEqual(skipped, { skipped: true });
  release();
  await running;
  assert.equal(store.row.token, null);
});

test('failure to persist a successful checkpoint rejects the job', async () => {
  const supabase = { rpc: async name => name === 'rehla_claim_sync'
    ? { data: { token: 'owned', since: '2026-09-01T08:00:00.000Z' }, error: null }
    : { data: null, error: { message: 'database unavailable' } } };
  const run = createCheckpointRunner({ supabase, now });
  await assert.rejects(run('shopify_orders', async () => ({ success: true })), /database unavailable/);
});

test('a lost lease does not report a successfully saved checkpoint', async () => {
  const supabase = { rpc: async name => name === 'rehla_claim_sync'
    ? { data: { token: 'owned', since: '2026-09-01T08:00:00.000Z' }, error: null }
    : { data: false, error: null } };
  const run = createCheckpointRunner({ supabase, now });
  await assert.rejects(run('shopify_orders', async () => ({ success: true })), /lease|checkpoint/i);
});

const { flushStockSyncQueue } = require('../src/services/syncCheckpoint');
function stockQueue(rows) {
  return {
    rows: structuredClone(rows),
    from(table) {
      assert.equal(table, 'stock_sync_queue');
      const fixture = this;
      function mutation(mode, patch) {
        const filters = [];
        return {
          eq(column, value) { filters.push([column, value]); return this; },
          then(resolve) {
            const matches = row => filters.every(([key, value]) => row[key] === value);
            if (mode === 'delete') fixture.rows = fixture.rows.filter(row => !matches(row));
            else fixture.rows = fixture.rows.map(row => matches(row) ? { ...row, ...patch } : row);
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
      }
      return {
        select() { return { order() { return { limit: async limit => ({ data: structuredClone(fixture.rows.slice(0, limit)), error: null }) }; } }; },
        delete() { return mutation('delete'); },
        update(patch) { return mutation('update', patch); },
      };
    },
  };
}
const queuedStock = { variant_id: 'variant-1', updated_at: '2026-10-16T10:00:00.000Z', attempts: 0, last_error: null };

test('successful stock pushes and unlinked variants leave the retry queue', async () => {
  for (const result of [{ ok: true }, { skipped: true }]) {
    const client = stockQueue([queuedStock]);
    const summary = await flushStockSyncQueue({ supabase: client, pushVariantStock: async id => {
      assert.equal(id, 'variant-1');
      return result;
    } });
    assert.equal(client.rows.length, 0);
    assert.deepEqual(summary, { processed: 1, failed: 0 });
  }
});

test('failed stock pushes remain queued with an increased attempt count', async () => {
  const client = stockQueue([queuedStock]);
  const summary = await flushStockSyncQueue({ supabase: client, pushVariantStock: async () => { throw new Error('Shopify unavailable'); } });
  assert.equal(client.rows[0].attempts, 1);
  assert.equal(client.rows[0].last_error, 'Shopify unavailable');
  assert.deepEqual(summary, { processed: 0, failed: 1 });
});

test('finishing a stock push never deletes a newer queued change', async () => {
  const client = stockQueue([queuedStock]);
  await flushStockSyncQueue({ supabase: client, pushVariantStock: async () => {
    client.rows[0].updated_at = '2026-10-16T10:01:00.000Z';
    return { ok: true };
  } });
  assert.equal(client.rows.length, 1);
  assert.equal(client.rows[0].updated_at, '2026-10-16T10:01:00.000Z');
});

test('a stale stock failure never overwrites a newer queue entry', async () => {
  const client = stockQueue([queuedStock]);
  await flushStockSyncQueue({ supabase: client, pushVariantStock: async () => {
    client.rows[0].updated_at = '2026-10-16T10:01:00.000Z';
    throw new Error('old request failed');
  } });
  assert.equal(client.rows[0].attempts, 0);
  assert.equal(client.rows[0].last_error, null);
});

test('long syncs renew their lease before saving progress',async()=>{
 const calls=[];
 let heartbeat;
 const run=createCheckpointRunner({
  supabase:{async rpc(name){calls.push(name);if(name==='rehla_claim_sync')return {data:{token:'token',since:'2026-01-01'},error:null};return {data:true,error:null};}},
  now,setIntervalFn:fn=>{heartbeat=fn;return 1;},clearIntervalFn:()=>{}
 });
 await run('long_import',async()=>{await heartbeat();return {success:true};});
 assert.deepEqual(calls,['rehla_claim_sync','rehla_renew_sync','rehla_finish_sync']);
});
test('a lost renewal prevents advancing the checkpoint',async()=>{
 let heartbeat;
 let completed;
 const run=createCheckpointRunner({
  supabase:{async rpc(name,args){if(name==='rehla_claim_sync')return {data:{token:'token',since:'2026-01-01'}};if(name==='rehla_renew_sync')return {data:false};completed=args.p_success;return {data:true};}},
  now,setIntervalFn:fn=>{heartbeat=fn;return 1;},clearIntervalFn:()=>{}
 });
 await assert.rejects(run('long_import',async()=>{await heartbeat();return {success:true};}),/lease/i);
 assert.equal(completed,false);
});
