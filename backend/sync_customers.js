// One-time full customer sync from Shopify. Safe to re-run (upsert).
require('dotenv').config();
const shopify = require('./src/services/shopifySync');

async function run() {
  console.log('=== CUSTOMER SYNC STARTING ===');
  console.log(`Started: ${new Date().toISOString()}`);
  try {
    const result = await shopify.syncCustomers('manual');
    console.log(`\n✅ Synced ${result.synced} customers`);
    console.log(`Finished: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('\n❌ FAILED:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

run();
