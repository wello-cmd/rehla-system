// Cron Job Scheduler — FR-SH-01 (30-minute Shopify sync)
// Uses node-cron for scheduled tasks

const cron = require('node-cron');
const shopifySync = require('./shopifySync');
const { supabase } = require('../db/supabase');

function startCronJobs() {
  // FR-SH-01: Auto-sync products from Shopify every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Starting scheduled Shopify product sync...');
    try {
      const result = await shopifySync.syncProducts('auto');
      console.log(`[Cron] Shopify sync complete:`, result);
    } catch (err) {
      // NFR-RL-02: Log error, will retry on next cycle
      console.error('[Cron] Shopify sync failed:', err.message);
    }
  });

  // FR-IV-06: Auto-flag overdue invoices daily at midnight Cairo time
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Flagging overdue invoices...');
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'Overdue' })
        .lt('due_date', new Date().toISOString().split('T')[0])
        .not('status', 'in', '("Paid","Overdue")');

      if (error) throw error;
      console.log('[Cron] Overdue invoices flagged successfully');
    } catch (err) {
      console.error('[Cron] Overdue flagging failed:', err.message);
    }
  }, {
    timezone: 'Africa/Cairo'
  });

  console.log('[Cron] Scheduled jobs started:');
  console.log('  → Shopify sync: every 30 minutes');
  console.log('  → Overdue invoices: daily at midnight (Cairo)');
}

module.exports = { startCronJobs };
