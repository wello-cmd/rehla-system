/**
 * backfill_customer_contacts.js
 *
 * Re-syncs all Shopify customers into the customers table with
 * full name / phone / email data.
 *
 * Run ONCE after the Shopify token is fixed:
 *   node backend/backfill_customer_contacts.js
 */

require('dotenv').config();
const axios    = require('axios');
const { createClient } = require('@supabase/supabase-js');

const STORE  = process.env.SHOPIFY_STORE_URL?.trim();
const TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
const BASE   = `https://${STORE}/admin/api/2024-01`;
const HEADERS = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractPageInfo(link) {
  if (!link) return null;
  const m = link.match(/<[^>]+page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

async function run() {
  console.log(`[backfill] Store: ${STORE}`);
  if (!STORE || !TOKEN) { console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN'); process.exit(1); }

  let pageInfo = null;
  let total = 0;
  let page = 0;

  do {
    const url = pageInfo
      ? `${BASE}/customers.json?limit=250&page_info=${pageInfo}`
      : `${BASE}/customers.json?limit=250`;

    await sleep(500);
    const { data, headers } = await axios.get(url, { headers: HEADERS });
    const customers = data.customers || [];
    page++;

    if (!customers.length) break;

    const rows = customers.map(c => {
      const addr = c.default_address || {};
      return {
        shopify_customer_id: String(c.id),
        email:            c.email         || null,
        first_name:       c.first_name    || null,
        last_name:        c.last_name     || null,
        phone:            c.phone         || null,
        address:          addr.address1   || null,
        city:             addr.city       || null,
        province:         addr.province   || null,
        country:          addr.country    || 'Egypt',
        orders_count:     c.orders_count  || 0,
        total_spent:      parseFloat(c.total_spent) || 0,
        tags:             c.tags          || null,
        note:             c.note          || null,
        verified_email:   c.verified_email || false,
        accepts_marketing: c.email_marketing_consent?.state === 'subscribed',
        shopify_state:    c.state         || null,
        shopify_created_at: c.created_at  || null,
        last_synced_at:   new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('customers')
      .upsert(rows, { onConflict: 'shopify_customer_id' });

    if (error) {
      console.error(`[backfill] page ${page} upsert error:`, error.message);
    } else {
      total += rows.length;
      console.log(`[backfill] page ${page}: upserted ${rows.length} customers (total so far: ${total})`);
    }

    pageInfo = extractPageInfo(headers?.link);
  } while (pageInfo);

  // Now backfill customer_name / customer_phone / customer_email in orders table
  // using the freshly-upserted customers data
  console.log('\n[backfill] Backfilling orders with customer contact info...');
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('shopify_customer_id, first_name, last_name, phone, email')
    .not('first_name', 'is', null);

  let ordersUpdated = 0;
  for (const c of (allCustomers || [])) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (!name && !c.phone && !c.email) continue;

    const { error: updErr } = await supabase
      .from('orders')
      .update({
        ...(name  && { customer_name:  name  }),
        ...(c.phone && { customer_phone: c.phone }),
        ...(c.email && { customer_email: c.email }),
      })
      .eq('shopify_customer_id', c.shopify_customer_id)
      .or('customer_name.is.null,customer_name.eq.Shopify Customer,customer_name.eq.N/A');

    if (!updErr) ordersUpdated++;
  }

  console.log(`[backfill] Orders backfilled: ${ordersUpdated}`);
  console.log(`\n[backfill] Done. ${total} customers synced.`);
}

run().catch(err => {
  console.error('[backfill] Fatal:', err.message);
  process.exit(1);
});
