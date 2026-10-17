// Durable progress and a database lease let restarts catch up without allowing
// overlapping scheduled jobs across application instances.
function createCheckpointRunner({ supabase, now = () => new Date(), setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  return async function runWithCheckpoint(job, sync) {
    const { data: lease, error: claimError } = await supabase.rpc('rehla_claim_sync', {
      p_job: job,
      p_lease_seconds: 1800,
    });
    if (claimError) throw new Error(`Cannot claim ${job}: ${claimError.message}`);
    if (!lease) return { skipped: true };

    const startedAt = now().toISOString();
    let result;
    let failure;
    let renewal;
    let leaseFailure;
    const heartbeat = setIntervalFn(() => {
      if (renewal) return renewal;
      renewal = (async () => {
        try {
          const {data,error} = await supabase.rpc('rehla_renew_sync', {p_job:job,p_token:lease.token,p_lease_seconds:1800});
          if (error || data !== true) leaseFailure = new Error(`${job} sync lease renewal failed`);
        } catch { leaseFailure = new Error(`${job} sync lease renewal failed`); }
      })().finally(() => { renewal = null; });
      return renewal;
    }, 60_000);
    heartbeat?.unref?.();
    try {
      const checkpoint = new Date(lease.since).getTime();
      if (!lease.token || !Number.isFinite(checkpoint)) throw new Error(`Invalid checkpoint for ${job}`);
      const since = new Date(Math.max(0, checkpoint - 60_000)).toISOString();
      result = await sync(since);
      if (!result || result.success === false || result.error ||
          (result.errors && (!Array.isArray(result.errors) || result.errors.length))) {
        throw new Error(`${job} sync incomplete: ${result?.error || JSON.stringify(result?.errors) || 'unsuccessful result'}`);
      }
    } catch (err) {
      failure = err;
    } finally {
      clearIntervalFn(heartbeat);
      if (renewal) await renewal;
    }
    failure = failure || leaseFailure;

    try {
      const { data: saved, error } = await supabase.rpc('rehla_finish_sync', {
        p_job: job,
        p_token: lease.token,
        p_success: !failure,
        p_started_at: startedAt,
      });
      if (error) throw new Error(`Cannot persist ${job} checkpoint: ${error.message}`);
      if (saved !== true) throw new Error(`${job} sync lease lost; checkpoint was not saved`);
    } catch (err) {
      if (failure) throw new AggregateError([failure, err], `${failure.message}; ${err.message}`);
      throw err;
    }
    if (failure) throw failure;
    return result;
  };
}

async function flushStockSyncQueue({ supabase, pushVariantStock }) {
  const { data: entries, error } = await supabase.from('stock_sync_queue')
    .select('variant_id,updated_at,attempts').order('updated_at', { ascending: true }).limit(50);
  if (error) throw new Error(`Cannot read stock retry queue: ${error.message}`);
  const summary = { processed: 0, failed: 0 };
  for (const entry of entries || []) {
    let failure;
    try {
      const result = await pushVariantStock(entry.variant_id);
      if (!result?.ok && !result?.skipped) throw new Error(result?.error || 'Shopify stock push did not complete');
    } catch (err) {
      failure = err;
    }
    // A transaction may enqueue a newer stock value while the remote push is
    // running. Only acknowledge or update the snapshot this worker processed.
    const mutation = failure
      ? supabase.from('stock_sync_queue').update({ attempts: (entry.attempts || 0) + 1, last_error: failure.message })
      : supabase.from('stock_sync_queue').delete();
    const { error: persistError } = await mutation.eq('variant_id', entry.variant_id).eq('updated_at', entry.updated_at);
    if (persistError) throw new Error(`Cannot save stock retry outcome: ${persistError.message}`);
    summary[failure ? 'failed' : 'processed']++;
  }
  return summary;
}

module.exports = { createCheckpointRunner, flushStockSyncQueue };
