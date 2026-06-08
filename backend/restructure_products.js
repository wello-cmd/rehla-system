// Run this ONCE after the full order sync completes.
// Clears the old one-variant-per-row product structure,
// re-syncs into parent products + product_variants,
// then patches order_items with the new product_id/variant_id.
require('dotenv').config();

const shopify = require('./src/services/shopifySync');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDeliveryStatuses() {
  console.log('[1/4] Fixing delivery statuses...');
  let page = 0;
  const PAGE = 200;
  let total = 0;
  while (true) {
    const { data: deliveredOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('status', 'delivered')
      .range(page * PAGE, (page + 1) * PAGE - 1);

    if (!deliveredOrders || deliveredOrders.length === 0) break;

    const ids = deliveredOrders.map(o => o.id);
    await supabase
      .from('delivery_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('order_id', ids)
      .eq('status', 'pending');

    total += ids.length;
    page++;
    if (deliveredOrders.length < PAGE) break;
  }
  console.log(`  Updated delivery statuses for ${total} orders.`);
}

async function clearProducts() {
  console.log('[2/4] Clearing old product structure...');
  // Deleting products cascades to product_variants (CASCADE) and sets NULL on
  // order_items.product_id, order_items.variant_id, inventory_log.product_id (SET NULL FKs)
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  Products and variants cleared (cascade applied).');
}

async function fetchAllRows(query) {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function patchOrderItems() {
  console.log('[4/4] Patching order_items with new product/variant IDs...');
  const allVariants = await fetchAllRows(supabase.from('product_variants').select('id, product_id, sku'));

  const variantBySku = {};
  for (const v of allVariants) variantBySku[v.sku] = v;

  // Paginate through all order_items with null product_id
  const items = await fetchAllRows(supabase.from('order_items').select('id, sku').is('product_id', null));

  const patchable = items.filter(oi => variantBySku[oi.sku]);
  let patched = 0;
  const BATCH = 100;

  for (let i = 0; i < patchable.length; i += BATCH) {
    const batch = patchable.slice(i, i + BATCH);
    await Promise.all(batch.map(oi => {
      const v = variantBySku[oi.sku];
      return supabase
        .from('order_items')
        .update({ product_id: v.product_id, variant_id: v.id })
        .eq('id', oi.id);
    }));
    patched += batch.length;
    if (patched % 1000 === 0) console.log(`  ... ${patched} patched`);
  }

  console.log(`  Patched ${patched} of ${items.length} order items (${items.length - patched} had no matching variant).`);
  return patched;
}

async function run() {
  await fixDeliveryStatuses();
  await clearProducts();

  console.log('[3/4] Re-syncing products from Shopify (new structure)...');
  const result = await shopify.syncProducts('manual');
  console.log(`  Created ${result.productsCreated} products, ${result.productsUpdated} updated, ${result.productsSkipped} skipped.`);

  const patched = await patchOrderItems();

  console.log('\n✅ RESTRUCTURE COMPLETE!');
  console.log(`  Parent products: ${result.productsCreated + result.productsUpdated}`);
  console.log(`  Order items patched: ${patched}`);
  process.exit(0);
}

run().catch(err => {
  console.error('RESTRUCTURE FAILED:', err.message);
  process.exit(1);
});
