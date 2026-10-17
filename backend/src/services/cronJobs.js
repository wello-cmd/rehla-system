// Cron Job Scheduler
const cron = require('node-cron');
const shopifySync = require('./shopifySync');
const { supabase } = require('../db/supabase');
const { createCheckpointRunner, flushStockSyncQueue } = require('./syncCheckpoint');
const runWithCheckpoint = createCheckpointRunner({ supabase });

function startCronJobs() {
  // Orders: every 5 minutes — incremental (only orders updated since last run)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runWithCheckpoint('shopify_orders', since => shopifySync.syncOrders('cron', { updatedAtMin: since }));
      if (result.ordersSynced > 0) {
        console.log(`[Cron] Orders synced: ${result.ordersSynced}`);
      }
    } catch (err) {
      console.error('[Cron] Order sync failed:', err.message);
    }
  }, { noOverlap: true });

  // Products: every 30 minutes (products change rarely)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await runWithCheckpoint('shopify_products', () => shopifySync.syncProducts('cron'));
      if (result.skipped) return;
      console.log(`[Cron] Products synced: +${result.productsCreated} new, ${result.productsUpdated} updated`);
    } catch (err) {
      console.error('[Cron] Product sync failed:', err.message);
    }
  }, { noOverlap: true });

  // Customers: every 15 minutes (incremental)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await runWithCheckpoint('shopify_customers', since => shopifySync.syncCustomers('cron', { updatedAtMin: since }));
      if (result.synced > 0) console.log(`[Cron] Customers synced: ${result.synced}`);
    } catch (err) {
      console.error('[Cron] Customer sync failed:', err.message);
    }
  }, { noOverlap: true });

  // Refunds: every 6 hours — incremental by updated_at
  cron.schedule('0 */6 * * *', async () => {
    try {
      const result = await runWithCheckpoint('shopify_refunds', since => shopifySync.syncRefunds('cron', { processedAtMin: since }));
      if (result.synced > 0) console.log(`[Cron] Refunds synced: ${result.synced}`);
    } catch (err) {
      console.error('[Cron] Refund sync failed:', err.message);
    }
  }, { noOverlap: true });

  // Transactional stock changes remain queued until Shopify accepts them.
  cron.schedule('* * * * *', async () => {
    try {
      const result = await runWithCheckpoint('shopify_stock_queue', () => flushStockSyncQueue({
        supabase,
        pushVariantStock: variantId => shopifySync.pushVariantStock(variantId),
      }));
      if (result.failed) console.error(`[Cron] Stock pushes still pending: ${result.failed}`);
    } catch (err) {
      console.error('[Cron] Stock retry failed:', err.message);
    }
  }, { noOverlap: true });

  // Overdue invoices: daily at midnight Cairo time
  cron.schedule('0 0 * * *', async () => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'Overdue' })
        .lt('due_date', new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
        .not('status', 'in', '("Paid","Overdue")');
      if (error) throw error;
      console.log('[Cron] Overdue invoices flagged');
    } catch (err) {
      console.error('[Cron] Overdue flagging failed:', err.message);
    }
  }, { timezone: 'Africa/Cairo' });

  console.log('[Cron] Scheduled jobs started:');
  console.log('  → Order sync:    every 5 minutes (incremental)');
  console.log('  → Product sync:  every 30 minutes');
  console.log('  → Customer sync: every 15 minutes (incremental)');
  console.log('  → Refund sync:   every 6 hours (incremental)');
  console.log('  → Stock retries: every minute');
  console.log('  → Overdue check: daily at midnight (Cairo)');
}

module.exports = { startCronJobs };
