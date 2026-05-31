// Delivery Routes — FR-DL-01 through FR-DL-16
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const bostaClient = require('../services/bostaClient');
const { generateWaybillPDF } = require('../services/pdfGenerator');

// GET /api/deliveries — List deliveries (FR-DL-01)
router.get('/', authenticate, async (req, res) => {
  try {
    let query = supabase
      .from('delivery_orders')
      .select(`
        *,
        orders(customer_name, customer_phone, customer_email, total, payment_method, items, order_number),
        drivers(name, phone, zone, uuid_link)
      `)
      .order('created_at', { ascending: false });

    // Drivers see only their deliveries
    if (req.user.role === 'driver') {
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', req.user.id)
        .single();

      if (driver) {
        query = query.eq('driver_id', driver.id);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/assign — Assign driver (FR-DL-02)
router.post('/assign', authenticate, authorize('admin', 'ceo', 'dispatcher'), async (req, res) => {
  const { delivery_id, driver_id } = req.body;
  if (!delivery_id || !driver_id) {
    return res.status(400).json({ error: 'delivery_id and driver_id are required.' });
  }

  try {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name')
      .eq('id', driver_id)
      .eq('status', 'active')
      .single();

    if (!driver) return res.status(400).json({ error: 'Invalid or inactive driver.' });

    const { error } = await supabase
      .from('delivery_orders')
      .update({
        driver_id,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', delivery_id);

    if (error) throw error;

    // Log event
    await supabase.from('delivery_log').insert({
      delivery_order_id: delivery_id,
      event: `Assigned to driver: ${driver.name}`
    });

    res.json({ success: true, message: `Assigned to ${driver.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/deliveries/:id/status — Update status (FR-DL-07, FR-DL-08)
router.put('/:id/status', authenticate, async (req, res) => {
  const { status, failed_reason, notes } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required.' });

  const validStatuses = ['pending', 'assigned', 'out_for_delivery', 'delivered', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  // FR-DL-08: Failed requires a reason
  if (status === 'failed' && !failed_reason) {
    return res.status(400).json({
      error: 'Failed reason required. Options: not_answered, wrong_address, refused, postponed'
    });
  }

  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, drivers(user_id)')
      .eq('id', req.params.id)
      .single();

    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    // Verify driver ownership
    if (req.user.role === 'driver' && delivery.drivers?.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your delivery.' });
    }

    const updates = {
      status,
      notes: notes || delivery.notes,
      updated_at: new Date().toISOString()
    };

    if (status === 'failed') updates.failed_reason = failed_reason;
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();

    const { error } = await supabase
      .from('delivery_orders')
      .update(updates)
      .eq('id', req.params.id);

    if (error) throw error;

    // Log event
    await supabase.from('delivery_log').insert({
      delivery_order_id: req.params.id,
      event: `Status → ${status}${failed_reason ? ` (${failed_reason})` : ''}`,
      notes: notes || ''
    });

    // If delivered, update order status
    if (status === 'delivered') {
      await supabase
        .from('orders')
        .update({ status: 'delivered', payment_status: 'paid' })
        .eq('id', delivery.order_id);
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries/summary — Dashboard summary cards (FR-DL-16)
router.get('/summary', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: all } = await supabase
      .from('delivery_orders')
      .select('status, cod_amount, created_at');

    const todayOrders = (all || []).filter(d => d.created_at?.startsWith(today));
    const summary = {
      total_today: todayOrders.length,
      out_for_delivery: (all || []).filter(d => d.status === 'out_for_delivery').length,
      delivered: (all || []).filter(d => d.status === 'delivered').length,
      failed: (all || []).filter(d => d.status === 'failed').length,
      pending: (all || []).filter(d => d.status === 'pending').length,
      cod_to_collect: (all || [])
        .filter(d => d.status !== 'delivered' && d.cod_amount > 0)
        .reduce((sum, d) => sum + Number(d.cod_amount), 0)
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/:id/bosta — Create Bosta shipment (FR-DL-10, FR-DL-11)
router.post('/:id/bosta', authenticate, authorize('admin', 'ceo', 'dispatcher'), async (req, res) => {
  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, orders(customer_name, customer_phone, total)')
      .eq('id', req.params.id)
      .single();

    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    const result = await bostaClient.createShipment({
      receiverName: delivery.orders.customer_name,
      receiverPhone: delivery.orders.customer_phone,
      receiverAddress: delivery.customer_address,
      codAmount: delivery.cod_amount,
      notes: delivery.notes
    });

    // Update delivery with Bosta info
    await supabase
      .from('delivery_orders')
      .update({
        delivery_type: 'bosta',
        bosta_shipment_id: result.shipmentId,
        tracking_number: result.trackingNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    await supabase.from('delivery_log').insert({
      delivery_order_id: req.params.id,
      event: `Bosta shipment created: ${result.trackingNumber}`
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries/:id/track — Bosta tracking (FR-DL-13)
router.get('/:id/track', authenticate, async (req, res) => {
  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('tracking_number')
      .eq('id', req.params.id)
      .single();

    if (!delivery?.tracking_number) {
      return res.status(400).json({ error: 'No tracking number available.' });
    }

    const tracking = await bostaClient.getTrackingStatus(delivery.tracking_number);
    res.json(tracking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries/:id/waybill — Download waybill PDF (FR-DL-12)
router.get('/:id/waybill', authenticate, async (req, res) => {
  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, orders(*)')
      .eq('id', req.params.id)
      .single();

    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    const pdf = await generateWaybillPDF(delivery, delivery.orders);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="waybill-${req.params.id.slice(0,8)}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/driver/:uuid/orders — Driver mobile view (FR-DL-05, NFR-SC-07)
router.get('/driver/:uuid/orders', async (req, res) => {
  try {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name, phone, zone')
      .eq('uuid_link', req.params.uuid)
      .single();

    if (!driver) return res.status(404).json({ error: 'Driver not found.' });

    const { data: deliveries } = await supabase
      .from('delivery_orders')
      .select(`
        *,
        orders(customer_name, customer_phone, total, payment_method, items, order_number)
      `)
      .eq('driver_id', driver.id)
      .in('status', ['assigned', 'out_for_delivery'])
      .order('created_at', { ascending: false });

    res.json({ driver, deliveries: deliveries || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/deliveries/driver/:uuid/orders/:id/status — Driver updates status via public UUID link
router.put('/driver/:uuid/orders/:id/status', async (req, res) => {
  const { status, failed_reason, notes } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required.' });

  const validStatuses = ['pending', 'assigned', 'out_for_delivery', 'delivered', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  if (status === 'failed' && !failed_reason) {
    return res.status(400).json({ error: 'Failed reason required.' });
  }

  try {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name')
      .eq('uuid_link', req.params.uuid)
      .single();

    if (!driver) return res.status(404).json({ error: 'Driver not found.' });

    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*')
      .eq('id', req.params.id)
      .eq('driver_id', driver.id)
      .single();

    if (!delivery) return res.status(404).json({ error: 'Delivery order not found or not assigned to you.' });

    const updates = {
      status,
      notes: notes || delivery.notes,
      updated_at: new Date().toISOString()
    };

    if (status === 'failed') updates.failed_reason = failed_reason;
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();

    const { error } = await supabase
      .from('delivery_orders')
      .update(updates)
      .eq('id', req.params.id);

    if (error) throw error;

    // Log event
    await supabase.from('delivery_log').insert({
      delivery_order_id: req.params.id,
      event: `Status → ${status}${failed_reason ? ` (${failed_reason})` : ''} (via public UUID link)`,
      notes: notes || ''
    });

    if (status === 'delivered') {
      await supabase
        .from('orders')
        .update({ status: 'delivered', payment_status: 'paid' })
        .eq('id', delivery.order_id);
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
