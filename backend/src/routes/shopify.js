// Shopify Webhook Routes — FR-SH-01 through FR-SH-10
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyShopifyWebhook } = require('../middleware/webhookVerify');
const shopifySync = require('../services/shopifySync');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { supabase, fetchAll } = require('../db/supabase');

// GET /api/shopify/orders — List Shopify orders with optional filters
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, payment_status, start, end, limit = 50, offset = 0 } = req.query;
    let query = supabase
      .from('orders')
      .select('id, order_number, shopify_order_id, shopify_order_name, customer_name, customer_phone, customer_email, total, subtotal, status, payment_status, payment_method, items, created_at', { count: 'exact' })
      .eq('source', 'shopify')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ orders: data || [], total: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify/analytics — Shopify channel analytics
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await fetchAll(
      supabase.from('orders')
        .select('id, total, status, payment_status, payment_method, created_at')
        .eq('source', 'shopify')
    );
    const paidOrders = orders.filter(o => o.payment_status === 'paid');
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total), 0);

    const summary = {
      total_orders: orders.length,
      total_revenue: totalRevenue,
      avg_order_value: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0,
      paid_orders: paidOrders.length,
      pending_orders: orders.filter(o => o.payment_status === 'pending').length,
      delivered_orders: orders.filter(o => o.status === 'delivered').length,
      fulfillment_rate: orders.length > 0
        ? Number(((orders.filter(o => o.status === 'delivered').length / orders.length) * 100).toFixed(1))
        : 0
    };

    // Revenue by day (last 30 days)
    const revenueByDay = {};
    for (const o of orders.filter(o => new Date(o.created_at) >= thirtyDaysAgo)) {
      const date = o.created_at.split('T')[0];
      if (!revenueByDay[date]) revenueByDay[date] = { date, revenue: 0, orders: 0 };
      revenueByDay[date].orders++;
      if (o.payment_status === 'paid') revenueByDay[date].revenue += Number(o.total);
    }
    const revenueChart = Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date));

    // Status & payment breakdowns
    const statusBreakdown = {};
    const paymentMethodBreakdown = {};
    const paymentStatusBreakdown = {};
    for (const o of orders) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
      paymentMethodBreakdown[o.payment_method || 'unknown'] = (paymentMethodBreakdown[o.payment_method || 'unknown'] || 0) + 1;
      paymentStatusBreakdown[o.payment_status] = (paymentStatusBreakdown[o.payment_status] || 0) + 1;
    }

    // Top products from Shopify orders — join via product_id to avoid massive .in() on order IDs
    const { data: items } = await supabase
      .from('order_items')
      .select('sku, name, quantity, price, orders!inner(source)')
      .eq('orders.source', 'shopify');

    const productMap = {};
    for (const item of items || []) {
      if (!productMap[item.sku]) productMap[item.sku] = { sku: item.sku, name: item.name, units: 0, revenue: 0 };
      productMap[item.sku].units += Number(item.quantity);
      productMap[item.sku].revenue += Number(item.quantity) * Number(item.price);
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    res.json({ summary, revenueChart, statusBreakdown, paymentMethodBreakdown, paymentStatusBreakdown, topProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/sync — Manual sync (FR-SH-06)
router.post('/sync', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const result = await shopifySync.syncProducts('manual');
    if (result.success) {
      const orderResult = await shopifySync.syncOrders('manual');
      res.json({ ...result, orders: orderResult });
    } else {
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify/sync-log — Sync history (FR-SH-07)
router.get('/sync-log', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function handleOrderWebhook(req, res, topicFallback) {
  try {
    const topic = req.headers['x-shopify-topic'] || topicFallback;
    await shopifySync.handleOrderWebhook(req.body, topic);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Shopify order error:', err);
    res.status(200).json({ received: true, error: err.message });
  }
}

// POST /api/shopify/webhooks/orders — Backward-compatible order webhook endpoint
router.post('/webhooks/orders', verifyShopifyWebhook, (req, res) => {
  handleOrderWebhook(req, res, 'orders/create');
});

// POST /api/shopify/webhooks/orders/create — Shopify orders/create webhook (FR-SH-02)
router.post('/webhooks/orders/create', verifyShopifyWebhook, (req, res) => {
  handleOrderWebhook(req, res, 'orders/create');
});

// POST /api/shopify/webhooks/orders/updated — Shopify orders/updated webhook (FR-SH-03)
router.post('/webhooks/orders/updated', verifyShopifyWebhook, (req, res) => {
  handleOrderWebhook(req, res, 'orders/updated');
});

// POST /api/shopify/webhooks/orders/cancelled
router.post('/webhooks/orders/cancelled', verifyShopifyWebhook, (req, res) => {
  handleOrderWebhook(req, res, 'orders/cancelled');
});

// POST /api/shopify/webhooks/orders/fulfilled
router.post('/webhooks/orders/fulfilled', verifyShopifyWebhook, (req, res) => {
  handleOrderWebhook(req, res, 'orders/fulfilled');
});

// POST /api/webhooks/shopify/inventory — Inventory update webhook (FR-SH-04)
router.post('/webhooks/inventory', verifyShopifyWebhook, async (req, res) => {
  try {
    await shopifySync.handleInventoryUpdate(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Shopify inventory error:', err);
    res.status(200).json({ received: true, error: err.message });
  }
});

// POST /api/shopify/webhook — Generic real-time webhook endpoint
router.post('/webhook', verifyShopifyWebhook, async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  try {
    if (topic === 'products/update' || topic === 'products/create') {
      await shopifySync.handleProductUpdate(req.body);
    } else if (topic === 'inventory_levels/update') {
      await shopifySync.handleInventoryUpdate(req.body);
    } else if (topic?.startsWith('orders/')) {
      await shopifySync.handleOrderWebhook(req.body, topic);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Webhook] Shopify webhook error for topic ${topic}:`, err);
    res.status(200).json({ received: true, error: err.message });
  }
});

// POST /api/shopify/webhooks/customers/create
router.post('/webhooks/customers/create', verifyShopifyWebhook, async (req, res) => {
  try { await shopifySync.handleCustomerWebhook(req.body); res.json({ received: true }); }
  catch (err) { res.json({ received: true, error: err.message }); }
});

// POST /api/shopify/webhooks/customers/update
router.post('/webhooks/customers/update', verifyShopifyWebhook, async (req, res) => {
  try { await shopifySync.handleCustomerWebhook(req.body); res.json({ received: true }); }
  catch (err) { res.json({ received: true, error: err.message }); }
});

// POST /api/shopify/register-webhooks — Register all webhooks on Shopify (run once per deployment)
// Body: { baseUrl: "https://your-backend.onrender.com" }  (optional — falls back to BACKEND_URL env)
router.post('/register-webhooks', authenticate, async (req, res) => {
  const baseUrl = (req.body?.baseUrl || process.env.BACKEND_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    return res.status(400).json({ error: 'Provide baseUrl in body or set BACKEND_URL env var' });
  }

  const SHOPIFY_BASE = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01`;
  const SHOPIFY_HEADERS = {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  };

  const topics = [
    { topic: 'orders/create',    address: `${baseUrl}/api/shopify/webhooks/orders/create` },
    { topic: 'orders/updated',   address: `${baseUrl}/api/shopify/webhooks/orders/updated` },
    { topic: 'orders/cancelled', address: `${baseUrl}/api/shopify/webhooks/orders/cancelled` },
    { topic: 'orders/fulfilled', address: `${baseUrl}/api/shopify/webhooks/orders/fulfilled` },
    { topic: 'products/create',   address: `${baseUrl}/api/shopify/webhook` },
    { topic: 'products/update',   address: `${baseUrl}/api/shopify/webhook` },
    { topic: 'products/delete',   address: `${baseUrl}/api/shopify/webhook` },
    { topic: 'customers/create',  address: `${baseUrl}/api/shopify/webhooks/customers/create` },
    { topic: 'customers/update',  address: `${baseUrl}/api/shopify/webhooks/customers/update` },
  ];

  // Delete all existing webhooks first to avoid duplicates
  try {
    const { data: existing } = await axios.get(`${SHOPIFY_BASE}/webhooks.json`, { headers: SHOPIFY_HEADERS });
    for (const wh of existing.webhooks || []) {
      await axios.delete(`${SHOPIFY_BASE}/webhooks/${wh.id}.json`, { headers: SHOPIFY_HEADERS });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to clear existing webhooks: ' + err.message });
  }

  const results = [];
  for (const { topic, address } of topics) {
    try {
      const { data } = await axios.post(`${SHOPIFY_BASE}/webhooks.json`, {
        webhook: { topic, address, format: 'json' }
      }, { headers: SHOPIFY_HEADERS });
      results.push({ topic, id: data.webhook.id, status: 'registered' });
    } catch (err) {
      results.push({ topic, status: 'failed', error: err.response?.data || err.message });
    }
  }

  const failed = results.filter(r => r.status === 'failed');
  res.json({
    registered: results.filter(r => r.status === 'registered').length,
    failed: failed.length,
    results,
    ...(failed.length && { errors: failed })
  });
});

// GET /api/shopify/webhooks — List currently registered Shopify webhooks
router.get('/webhooks', authenticate, async (_req, res) => {
  try {
    const SHOPIFY_BASE = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01`;
    const { data } = await axios.get(`${SHOPIFY_BASE}/webhooks.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    res.json(data.webhooks || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
