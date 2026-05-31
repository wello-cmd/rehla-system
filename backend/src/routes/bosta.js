// Bosta Webhook Routes — FR-DL-14, FR-DL-15
const express = require('express');
const router = express.Router();
const { verifyBostaWebhook } = require('../middleware/webhookVerify');
const bostaClient = require('../services/bostaClient');
const { supabase } = require('../db/supabase');

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
