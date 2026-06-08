// Fix cancelled order statuses: queries Shopify for all cancelled orders
// and updates their status in our DB. Run after sync_orders_only.js completes.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01`;
const HEADERS = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN };

function extractPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]+page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function getAllCancelledShopifyIds() {
  const ids = [];
  let pageInfo = null;
  let hasNext = true;

  while (hasNext) {
    const url = pageInfo
      ? `${BASE}/orders.json?limit=250&page_info=${pageInfo}`
      : `${BASE}/orders.json?status=cancelled&limit=250&fields=id`;

    await new Promise(r => setTimeout(r, 300));
    const { data, headers } = await axios.get(url, { headers: HEADERS });
    for (const o of data.orders || []) ids.push(String(o.id));
    pageInfo = extractPageInfo(headers.link);
    hasNext = !!pageInfo;
  }
  return ids;
}

async function run() {
  console.log('Fetching all cancelled orders from Shopify...');
  const cancelledIds = await getAllCancelledShopifyIds();
  console.log(`Found ${cancelledIds.length} cancelled orders on Shopify`);

  let updated = 0;
  const BATCH = 500;
  for (let i = 0; i < cancelledIds.length; i += BATCH) {
    const batch = cancelledIds.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .in('shopify_order_id', batch);
    if (error) console.error('Batch error:', error.message);
    else updated += (count || batch.length);
    console.log(`  Updated ${Math.min(i + BATCH, cancelledIds.length)}/${cancelledIds.length}...`);
  }

  console.log(`\n✅ Fixed ${updated} cancelled orders`);
  process.exit(0);
}

run().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
