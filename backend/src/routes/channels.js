// Channel Comparison Route — Shopify vs Bosta cross-channel analytics
const express = require('express');
const router = express.Router();
const { supabase, fetchAll } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// GET /api/channels/comparison
// Joins Shopify orders against delivery_orders to compute cross-channel metrics.
router.get('/comparison', authenticate, async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all data in parallel — use fetchAll to bypass PostgREST 1000-row cap
    const [shopifyOrders, bostaDeliveries, ownDeliveries] = await Promise.all([
      fetchAll(supabase.from('orders').select('id, total, subtotal, status, payment_status, created_at').eq('source', 'shopify')),
      fetchAll(supabase.from('delivery_orders').select('id, order_id, status, cod_amount, cod_collected, failed_reason, assigned_at, delivered_at, created_at').eq('delivery_type', 'bosta')),
      fetchAll(supabase.from('delivery_orders').select('id, order_id, status, cod_amount, cod_collected, created_at').eq('delivery_type', 'own_driver')),
    ]);

    // --- Shopify summary ---
    const shopifyPaid = shopifyOrders.filter(o => o.payment_status === 'paid');
    const shopifyRevenue = shopifyPaid.reduce((s, o) => s + Number(o.subtotal || o.total), 0);
    const shopifyDelivered = shopifyOrders.filter(o => o.status === 'delivered').length;
    const shopify = {
      total_orders: shopifyOrders.length,
      total_revenue: shopifyRevenue,
      avg_order_value: shopifyPaid.length > 0 ? shopifyRevenue / shopifyPaid.length : 0,
      paid_orders: shopifyPaid.length,
      pending_orders: shopifyOrders.filter(o => o.payment_status === 'pending').length,
      delivered_orders: shopifyDelivered,
      fulfillment_rate: shopifyOrders.length > 0
        ? Number(((shopifyDelivered / shopifyOrders.length) * 100).toFixed(1))
        : 0
    };

    // --- Bosta summary ---
    const bostaDelivered = bostaDeliveries.filter(s => s.status === 'delivered').length;
    const codCollected = bostaDeliveries
      .filter(s => s.cod_collected)
      .reduce((sum, s) => sum + Number(s.cod_amount || 0), 0);
    const codOutstanding = bostaDeliveries
      .filter(s => !s.cod_collected && !['failed', 'returned'].includes(s.status))
      .reduce((sum, s) => sum + Number(s.cod_amount || 0), 0);
    const bosta = {
      total_shipments: bostaDeliveries.length,
      delivered: bostaDelivered,
      failed: bostaDeliveries.filter(s => s.status === 'failed').length,
      returned: bostaDeliveries.filter(s => s.status === 'returned').length,
      in_transit: bostaDeliveries.filter(s => s.status === 'out_for_delivery').length,
      success_rate: bostaDeliveries.length > 0
        ? Number(((bostaDelivered / bostaDeliveries.length) * 100).toFixed(1))
        : 0,
      cod_collected: codCollected,
      cod_outstanding: codOutstanding
    };

    // --- Fulfillment mix: which Shopify orders go to Bosta vs own driver ---
    const shopifyIdSet = new Set(shopifyOrders.map(o => o.id));
    const bostaFromShopify = bostaDeliveries.filter(d => shopifyIdSet.has(d.order_id));
    const ownFromShopify = ownDeliveries.filter(d => shopifyIdSet.has(d.order_id));
    const unassigned = Math.max(0, shopifyOrders.length - bostaFromShopify.length - ownFromShopify.length);

    const fulfillmentMix = [
      { channel: 'Bosta', value: bostaFromShopify.length, color: '#8b5cf6' },
      { channel: 'Own Driver', value: ownFromShopify.length, color: '#988e90' },
      { channel: 'Not Yet Assigned', value: unassigned, color: '#e5e2e1' }
    ];

    // --- Delivery outcome per channel (for Shopify orders only) ---
    const deliveryOutcome = [
      {
        channel: 'Bosta',
        total: bostaFromShopify.length,
        delivered: bostaFromShopify.filter(d => d.status === 'delivered').length,
        failed: bostaFromShopify.filter(d => d.status === 'failed').length,
        in_transit: bostaFromShopify.filter(d => d.status === 'out_for_delivery').length
      },
      {
        channel: 'Own Driver',
        total: ownFromShopify.length,
        delivered: ownFromShopify.filter(d => d.status === 'delivered').length,
        failed: ownFromShopify.filter(d => d.status === 'failed').length,
        in_transit: ownFromShopify.filter(d => d.status === 'out_for_delivery').length
      }
    ];

    // --- Daily volume last 30 days (merged timeline) ---
    const dayMap = {};
    for (const o of shopifyOrders.filter(o => new Date(o.created_at) >= thirtyDaysAgo)) {
      const date = o.created_at.split('T')[0];
      if (!dayMap[date]) dayMap[date] = { date, shopify: 0, bosta: 0 };
      dayMap[date].shopify++;
    }
    for (const s of bostaDeliveries.filter(s => new Date(s.created_at) >= thirtyDaysAgo)) {
      const date = s.created_at.split('T')[0];
      if (!dayMap[date]) dayMap[date] = { date, shopify: 0, bosta: 0 };
      dayMap[date].bosta++;
    }
    const dailyComparison = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

    // --- Revenue vs COD bridge (all-time) ---
    const financialBridge = [
      { label: 'Shopify Revenue (Paid)', value: shopify.total_revenue, color: '#22c55e' },
      { label: 'Bosta COD Collected', value: bosta.cod_collected, color: '#8b5cf6' },
      { label: 'Bosta COD Outstanding', value: bosta.cod_outstanding, color: '#f59e0b' }
    ];

    res.json({ shopify, bosta, fulfillmentMix, deliveryOutcome, dailyComparison, financialBridge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
