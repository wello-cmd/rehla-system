// Customers Routes — customers table linked to orders for enriched profiles
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { supabase, fetchAll } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/customers
router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;

    // Fetch all customers that have at least 1 order in our system
    const customerRows = await fetchAll(
      supabase.from('customers').select('*').gt('orders_count', 0).order('total_spent', { ascending: false })
    );

    if (!customerRows.length) {
      return res.json({ customers: [], total: 0, anonymousCount: 0, anonymousRevenue: 0 });
    }

    const shopifyIds = customerRows.map(c => c.shopify_customer_id).filter(Boolean);

    // Pull all orders linked to these customers in batches (avoid URL limit with large IN clause)
    const BATCH = 200;
    const orders = [];
    for (let i = 0; i < shopifyIds.length; i += BATCH) {
      const batch = shopifyIds.slice(i, i + BATCH);
      const rows = await fetchAll(
        supabase
          .from('orders')
          .select('shopify_customer_id, id, shopify_order_name, total, status, payment_status, created_at, customer_name, customer_phone, customer_email, discount_amount')
          .in('shopify_customer_id', batch)
          .order('created_at', { ascending: false })
      );
      orders.push(...rows);
    }

    // Build per-customer stats + contact info from orders
    const statsMap = {};
    for (const o of orders) {
      const cid = o.shopify_customer_id;
      if (!statsMap[cid]) {
        statsMap[cid] = {
          order_count: 0, paid_count: 0,
          first_order_at: null, last_order_at: null,
          name: null, phone: null, email: null,
          orders: []
        };
      }
      const s = statsMap[cid];
      s.order_count++;
      if (o.payment_status === 'paid') s.paid_count++;
      if (!s.first_order_at || o.created_at < s.first_order_at) s.first_order_at = o.created_at;
      if (!s.last_order_at  || o.created_at > s.last_order_at)  s.last_order_at  = o.created_at;

      // Use most recent non-generic values for contact info
      const name  = (o.customer_name  || '').trim();
      const phone = (o.customer_phone || '').trim();
      const email = (o.customer_email || '').trim();
      if (!s.name  && name  && name.toLowerCase() !== 'shopify customer') s.name  = name;
      if (!s.phone && phone && phone !== 'N/A') s.phone = phone;
      if (!s.email && email) s.email = email;

      if (s.orders.length < 20) {
        s.orders.push({
          id: o.id,
          order_number: o.shopify_order_name || '—',
          total: o.total,
          status: o.status,
          payment_status: o.payment_status,
          created_at: o.created_at,
          discount_amount: o.discount_amount
        });
      }
    }

    let result = customerRows
      .filter(c => statsMap[c.shopify_customer_id])  // only customers with orders in our DB
      .map(c => {
        const stats = statsMap[c.shopify_customer_id] || {};
        const name  = stats.name  || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
        const phone = stats.phone || c.phone || '';
        const email = stats.email || c.email || '';
        return {
          id:               c.id,
          shopify_id:       c.shopify_customer_id,
          name,
          first_name:       c.first_name || name.split(' ')[0] || '',
          last_name:        c.last_name  || name.split(' ').slice(1).join(' ') || '',
          email,
          phone,
          city:             c.city     || '',
          province:         c.province || '',
          country:          c.country  || '',
          address:          c.address  || '',
          total_spent:      c.total_spent   || 0,
          orders_count:     c.orders_count  || 0,
          tags:             c.tags || '',
          note:             c.note || '',
          verified_email:   c.verified_email,
          accepts_marketing: c.accepts_marketing,
          shopify_created_at: c.shopify_created_at,
          db_order_count:   stats.order_count || 0,
          order_count:      stats.order_count || 0,   // alias used by frontend
          paid_orders:      stats.paid_count  || 0,
          avg_order_value:  stats.order_count > 0 ? ((c.total_spent || 0) / stats.order_count) : 0,
          first_order_at:   stats.first_order_at || null,
          last_order_at:    stats.last_order_at  || null,
          orders:           stats.orders || [],
          key:              c.id                      // stable key for expand toggle
        };
      });

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q)  ||
        c.phone.includes(q)               ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    }

    res.json({ customers: result, total: result.length, anonymousCount: 0, anonymousRevenue: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: customer, error } = await supabase
      .from('customers').select('*').eq('id', req.params.id).single();
    if (error || !customer) return res.status(404).json({ error: 'Customer not found' });

    const orders = await fetchAll(
      supabase
        .from('orders')
        .select('id, shopify_order_name, total, status, payment_status, created_at, items, discount_amount, customer_name, customer_phone, customer_email')
        .eq('shopify_customer_id', customer.shopify_customer_id)
        .order('created_at', { ascending: false })
    );

    // Enrich profile from most recent order
    const latest = orders[0] || {};
    const name  = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || latest.customer_name || '—';
    const phone = customer.phone || latest.customer_phone || '';
    const email = customer.email || latest.customer_email || '';

    res.json({ ...customer, name, phone, email, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/import-csv — Import customer names/phones/emails from Shopify CSV export
router.post('/import-csv', authenticate, authorize('admin', 'ceo'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const records = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let updated = 0;
    let skipped = 0;

    for (const row of records) {
      // Shopify CSV columns (case-insensitive normalisation)
      const normalised = {};
      for (const [k, v] of Object.entries(row)) {
        normalised[k.toLowerCase().replace(/\s+/g, '_')] = v;
      }

      // Shopify exports "Id" as the customer ID
      const shopifyId  = String(normalised['id'] || normalised['customer_id'] || '').trim();
      const email      = normalised['email']      || normalised['email_address'] || '';
      const firstName  = normalised['first_name'] || '';
      const lastName   = normalised['last_name']  || '';
      const phone      = normalised['phone']       || normalised['phone_number'] || '';
      const address1   = normalised['address1']    || normalised['address_1'] || '';
      const city       = normalised['city']        || '';
      const province   = normalised['province']    || '';
      const country    = normalised['country']     || '';

      if (!shopifyId) { skipped++; continue; }

      const updates = {};
      if (firstName)  updates.first_name = firstName;
      if (lastName)   updates.last_name  = lastName;
      if (email)      updates.email      = email;
      if (phone)      updates.phone      = phone;
      if (address1)   updates.address    = address1;
      if (city)       updates.city       = city;
      if (province)   updates.province   = province;
      if (country)    updates.country    = country;

      if (Object.keys(updates).length === 0) { skipped++; continue; }

      updates.last_synced_at = new Date().toISOString();

      const { error } = await supabase
        .from('customers')
        .update(updates)
        .eq('shopify_customer_id', shopifyId);

      if (!error) updated++;
      else skipped++;
    }

    res.json({ success: true, updated, skipped, total: records.length });
  } catch (err) {
    console.error('[CSV Import]', err.message);
    res.status(500).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

module.exports = router;
