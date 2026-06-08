// Sync only orders from Shopify — skips products.
// Safe to re-run; all upserts are idempotent.
require('dotenv').config();
const shopify = require('./src/services/shopifySync');

async function run() {
  console.log('=== ORDER SYNC STARTING ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  try {
    const result = await shopify.syncOrders('manual');
    console.log(`\n✅ ORDER SYNC COMPLETE — ${result.ordersSynced} orders synced`);
    console.log(`Finished at: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('\n❌ ORDER SYNC FAILED:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

run();
