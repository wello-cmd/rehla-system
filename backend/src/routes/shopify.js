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

// POST /api/webhooks/shopify/orders — New order webhook (FR-SH-02)
router.post('/webhooks/orders', verifyShopifyWebhook, async (req, res) => {
  try {
    await shopifySync.syncOrders('webhook');
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Shopify order error:', err);
    res.status(200).json({ received: true, error: err.message });
  }
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

module.exports = router;
