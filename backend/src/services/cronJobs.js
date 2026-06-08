// Cron Job Scheduler
const cron = require('node-cron');
const shopifySync = require('./shopifySync');
const { supabase } = require('../db/supabase');

// Track last order sync time in memory (falls back to 10 min window on restart)
let lastOrderSyncAt = null;

function startCronJobs() {
  // Orders: every 5 minutes — incremental (only orders updated since last run)
  cron.schedule('*/5 * * * *', async () => {
    const since = lastOrderSyncAt
      ? new Date(lastOrderSyncAt - 60_000).toISOString()       // 1-min overlap to avoid gaps
      : new Date(Date.now() - 10 * 60_000).toISOString();      // 10-min window on first run
    const syncedAt = new Date();
    try {
      const result = await shopifySync.syncOrders('cron', { updatedAtMin: since });
      lastOrderSyncAt = syncedAt;
      if (result.ordersSynced > 0) {
        console.log(`[Cron] Orders synced: ${result.ordersSynced} (since ${since})`);
      }
    } catch (err) {
      console.error('[Cron] Order sync failed:', err.message);
    }
  });

  // Products: every 30 minutes (products change rarely)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await shopifySync.syncProducts('cron');
      console.log(`[Cron] Products synced: +${result.productsCreated} new, ${result.productsUpdated} updated`);
    } catch (err) {
      console.error('[Cron] Product sync failed:', err.message);
    }
  });

  // Customers: every 15 minutes (incremental)
  let lastCustomerSyncAt = null;
  cron.schedule('*/15 * * * *', async () => {
    const since = lastCustomerSyncAt
      ? new Date(lastCustomerSyncAt - 60_000).toISOString()
      : new Date(Date.now() - 20 * 60_000).toISOString();
    const syncedAt = new Date();
    try {
      const result = await shopifySync.syncCustomers('cron', { updatedAtMin: since });
      lastCustomerSyncAt = syncedAt;
      if (result.synced > 0) console.log(`[Cron] Customers synced: ${result.synced}`);
    } catch (err) {
      console.error('[Cron] Customer sync failed:', err.message);
    }
  });

  // Overdue invoices: daily at midnight Cairo time
  cron.schedule('0 0 * * *', async () => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'Overdue' })
        .lt('due_date', new Date().toISOString().split('T')[0])
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
  console.log('  → Overdue check: daily at midnight (Cairo)');
}

module.exports = { startCronJobs };
