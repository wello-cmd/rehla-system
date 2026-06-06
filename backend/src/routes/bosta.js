// Bosta Routes — shipments, analytics, sync, webhooks
const express = require('express');
const router = express.Router();
const { verifyBostaWebhook } = require('../middleware/webhookVerify');
const bostaClient = require('../services/bostaClient');
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// POST /api/bosta/sync — Sync all active Bosta shipments
router.post('/sync', authenticate, authorize('admin', 'ceo'), async (_req, res) => {
  try {
    const result = await bostaClient.syncBostaDeliveries();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bosta/shipments — All Bosta delivery orders with filters
router.get('/shipments', authenticate, async (req, res) => {
  try {
    const { status, start, end } = req.query;
    let query = supabase
      .from('delivery_orders')
      .select(`
        *,
        orders(customer_name, customer_phone, shopify_order_name, order_number, total)
      `)
      .eq('delivery_type', 'bosta')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bosta/analytics — Bosta channel analytics
router.get('/analytics', authenticate, async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: all, error } = await supabase
      .from('delivery_orders')
      .select('id, status, cod_amount, cod_collected, failed_reason, assigned_at, delivered_at, created_at')
      .eq('delivery_type', 'bosta');

    if (error) throw error;
    const shipments = all || [];

    const codCollected = shipments.filter(s => s.cod_collected).reduce((sum, s) => sum + Number(s.cod_amount || 0), 0);
    const codOutstanding = shipments
      .filter(s => !s.cod_collected && !['failed', 'returned'].includes(s.status))
      .reduce((sum, s) => sum + Number(s.cod_amount || 0), 0);

    const delivered = shipments.filter(s => s.status === 'delivered');
    const summary = {
      total: shipments.length,
      delivered: delivered.length,
      in_transit: shipments.filter(s => s.status === 'out_for_delivery').length,
      failed: shipments.filter(s => s.status === 'failed').length,
      returned: shipments.filter(s => s.status === 'returned').length,
      pending: shipments.filter(s => ['pending', 'assigned'].includes(s.status)).length,
      cod_collected: codCollected,
      cod_outstanding: codOutstanding,
      success_rate: shipments.length > 0
        ? Number(((delivered.length / shipments.length) * 100).toFixed(1))
        : 0
    };

    // Status breakdown for pie chart
    const statusBreakdown = {};
    for (const s of shipments) {
      statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
    }

    // Failure reasons breakdown
    const failureReasons = {};
    for (const s of shipments.filter(s => s.status === 'failed')) {
      const reason = s.failed_reason || 'unknown';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }

    // Daily volume last 30 days
    const dailyMap = {};
    for (const s of shipments.filter(s => new Date(s.created_at) >= thirtyDaysAgo)) {
      const date = s.created_at.split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { date, total: 0, delivered: 0, failed: 0 };
      dailyMap[date].total++;
      if (s.status === 'delivered') dailyMap[date].delivered++;
      if (s.status === 'failed') dailyMap[date].failed++;
    }
    const dailyVolume = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Average delivery time (hours)
    const withTimes = delivered.filter(s => s.assigned_at && s.delivered_at);
    const avgDeliveryTimeHrs = withTimes.length > 0
      ? Number((withTimes.reduce((sum, s) => sum + (new Date(s.delivered_at) - new Date(s.assigned_at)), 0) / withTimes.length / 3600000).toFixed(1))
      : null;

    const codBreakdown = [
      { name: 'Collected', value: codCollected, color: '#22c55e' },
      { name: 'Outstanding', value: codOutstanding, color: '#f59e0b' }
    ];

    res.json({ summary, statusBreakdown, failureReasons, dailyVolume, avgDeliveryTimeHrs, codBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/bosta — Bosta status update webhook (FR-DL-14)
router.post('/webhooks', verifyBostaWebhook, async (req, res) => {
  try {
    const event = bostaClient.parseWebhookPayload(req.body);

    // Find delivery by bosta_shipment_id or tracking_number
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('id, order_id')
      .or(`bosta_shipment_id.eq.${event.shipmentId},tracking_number.eq.${event.trackingNumber}`)
      .single();

    if (delivery) {
      // Map Bosta status to our status
      const statusMap = {
        'DELIVERED': 'delivered',
        'RETURNED': 'failed',
        'CANCELLED': 'failed',
        'IN_TRANSIT': 'out_for_delivery',
        'PICKED_UP': 'out_for_delivery',
        'RECEIVED_AT_WAREHOUSE': 'assigned'
      };

      const newStatus = statusMap[event.status] || delivery.status;

      await supabase
        .from('delivery_orders')
        .update({
          status: newStatus,
          ...(newStatus === 'delivered' && { delivered_at: event.timestamp }),
          ...(newStatus === 'failed' && { failed_reason: 'refused' }),
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery.id);

      // Log the event
      await supabase.from('delivery_log').insert({
        delivery_order_id: delivery.id,
        event: `Bosta webhook: ${event.statusName || event.status}`,
        notes: event.reason || ''
      });

      // Update order status if delivered
      if (newStatus === 'delivered') {
        await supabase.from('orders').update({ status: 'delivered', payment_status: 'paid' }).eq('id', delivery.order_id);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Bosta error:', err);
    res.status(200).json({ received: true });
  }
});

module.exports = router;
