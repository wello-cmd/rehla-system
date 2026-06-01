// Shopify Webhook Routes — FR-SH-01 through FR-SH-10
const express = require('express');
const router = express.Router();
const { verifyShopifyWebhook } = require('../middleware/webhookVerify');
const shopifySync = require('../services/shopifySync');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { supabase } = require('../db/supabase');

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

module.exports = router;
