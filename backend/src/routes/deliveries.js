// Delivery Routes — dispatcher, driver mobile links, Bosta, and analytics
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { verifyBostaWebhook } = require('../middleware/webhookVerify');
const bostaClient = require('../services/bostaClient');
const { generateWaybillPDF } = require('../services/pdfGenerator');
const rateLimit = require('../middleware/rateLimiter');

router.use(rateLimit(150, 15 * 60 * 1000));

const FAILED_REASONS = ['not_answered', 'wrong_address', 'refused', 'postponed'];
const DELIVERY_STATUSES = ['pending', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const BOSTA_STATUS_MAP = new Map([
  ['DELIVERED', 'delivered'],
  ['RETURNED', 'returned'],
  ['CANCELLED', 'failed'],
  ['CANCELED', 'failed'],
  ['IN_TRANSIT', 'out_for_delivery'],
  ['PICKED_UP', 'out_for_delivery'],
  ['RECEIVED_AT_WAREHOUSE', 'assigned']
]);

function normalizeDeliveryType(type) {
  if (type === 'own') return 'own_driver';
  if (type === 'own_driver' || type === 'bosta') return type;
  return null;
}

function toDateOnly(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function validateStatusPayload(status, failedReason) {
  if (!DELIVERY_STATUSES.includes(status)) {
    return `Invalid status. Must be: ${DELIVERY_STATUSES.join(', ')}`;
  }
  if (status === 'failed' && !FAILED_REASONS.includes(failedReason)) {
    return `Failed reason required. Must be: ${FAILED_REASONS.join(', ')}`;
  }
  return null;
}

async function listDeliveryOrders(req, res) {
  try {
    const { status, driver_id, driver, start, end, delivery_type } = req.query;
    let query = supabase
      .from('delivery_orders')
      .select(`
        *,
        orders(customer_name, customer_phone, customer_email, total, payment_method, items, order_number, shopify_order_name, created_at),
        drivers(name, phone, zone, uuid_link, availability_status)
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (driver_id || driver) query = query.eq('driver_id', driver_id || driver);
    const normalizedType = normalizeDeliveryType(delivery_type);
    if (normalizedType) query = query.eq('delivery_type', normalizedType);
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

    if (req.user?.role === 'driver') {
      const { data: driverRecord } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (driverRecord) query = query.eq('driver_id', driverRecord.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getSummary(req, res) {
  try {
    const today = toDateOnly();
    const { data: all, error } = await supabase
      .from('delivery_orders')
      .select('status, cod_amount, cod_collected, created_at');
    if (error) throw error;

    const orders = all || [];
    const todayOrders = orders.filter(d => d.created_at?.startsWith(today));
    const summary = {
      total_today: todayOrders.length,
      out_for_delivery: orders.filter(d => d.status === 'out_for_delivery').length,
      delivered: orders.filter(d => d.status === 'delivered').length,
      failed: orders.filter(d => d.status === 'failed').length,
      returned: orders.filter(d => d.status === 'returned').length,
      pending: orders.filter(d => d.status === 'pending').length,
      cod_collected: orders
        .filter(d => d.cod_collected)
        .reduce((sum, d) => sum + Number(d.cod_amount || 0), 0),
      cod_outstanding: orders
        .filter(d => !d.cod_collected && !['failed', 'returned'].includes(d.status))
        .reduce((sum, d) => sum + Number(d.cod_amount || 0), 0)
    };

    summary.cod_to_collect = summary.cod_outstanding;
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function assignDriver(req, res) {
  const deliveryId = req.body.delivery_id || req.body.deliveryOrderId || req.body.order_id;
  const driverId = req.body.driver_id || req.body.driverId;
  if (!deliveryId || !driverId) {
    return res.status(400).json({ error: 'delivery_id and driver_id are required.' });
  }

  try {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name, status')
      .eq('id', driverId)
      .single();

    if (!driver || driver.status !== 'active') {
      return res.status(400).json({ error: 'Invalid or inactive driver.' });
    }

    const { error } = await supabase
      .from('delivery_orders')
      .update({
        driver_id: driverId,
        delivery_type: 'own_driver',
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deliveryId);
    if (error) throw error;

    await supabase.from('delivery_log').insert({
      delivery_order_id: deliveryId,
      event: `Assigned to driver: ${driver.name}`
    });

    res.json({ success: true, message: `Assigned to ${driver.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateDeliveryStatus(req, res) {
  const { status, failed_reason, notes, cod_collected } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required.' });

  const validationError = validateStatusPayload(status, failed_reason);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, drivers(user_id)')
      .eq('id', req.params.id)
      .single();
    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    if (req.user?.role === 'driver' && delivery.drivers?.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your delivery.' });
    }

    const updates = {
      status,
      notes: notes || delivery.notes,
      updated_at: new Date().toISOString()
    };
    if (status === 'failed') updates.failed_reason = failed_reason;
    if (status === 'delivered') {
      updates.delivered_at = new Date().toISOString();
      updates.cod_collected = cod_collected !== undefined ? !!cod_collected : Number(delivery.cod_amount || 0) > 0;
    }
    if (status === 'returned') updates.cod_collected = false;

    const { error } = await supabase
      .from('delivery_orders')
      .update(updates)
      .eq('id', req.params.id);
    if (error) throw error;

    await supabase.from('delivery_log').insert({
      delivery_order_id: req.params.id,
      event: `Status -> ${status}${failed_reason ? ` (${failed_reason})` : ''}`,
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
}

async function getDriverOrders(req, res) {
  try {
    const today = toDateOnly();
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name, phone, zone, uuid_link, availability_status')
      .or(`id.eq.${req.params.id},uuid_link.eq.${req.params.id}`)
      .single();

    if (!driver) return res.status(404).json({ error: 'Driver not found.' });

    const { data: deliveries, error } = await supabase
      .from('delivery_orders')
      .select(`
        *,
        orders(customer_name, customer_phone, total, payment_method, items, order_number, shopify_order_name, created_at)
      `)
      .eq('driver_id', driver.id)
      .in('status', ['assigned', 'out_for_delivery'])
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ driver, deliveries: deliveries || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateDriverOrderStatus(req, res) {
  const { status, failed_reason, notes } = req.body;
  const validationError = validateStatusPayload(status, failed_reason);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name')
      .or(`id.eq.${req.params.id},uuid_link.eq.${req.params.id}`)
      .single();
    if (!driver) return res.status(404).json({ error: 'Driver not found.' });

    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('driver_id', driver.id)
      .single();
    if (!delivery) return res.status(404).json({ error: 'Delivery order not found or not assigned to you.' });

    req.params.id = req.params.orderId;
    req.user = { role: 'public_driver' };

    const updates = {
      status,
      notes: notes || delivery.notes,
      updated_at: new Date().toISOString(),
      ...(status === 'failed' && { failed_reason }),
      ...(status === 'delivered' && {
        delivered_at: new Date().toISOString(),
        cod_collected: Number(delivery.cod_amount || 0) > 0
      })
    };

    const { error } = await supabase.from('delivery_orders').update(updates).eq('id', delivery.id);
    if (error) throw error;

    await supabase.from('delivery_log').insert({
      delivery_order_id: delivery.id,
      event: `Status -> ${status}${failed_reason ? ` (${failed_reason})` : ''} (via driver link)`,
      notes: notes || ''
    });

    if (status === 'delivered') {
      await supabase.from('orders').update({ status: 'delivered', payment_status: 'paid' }).eq('id', delivery.order_id);
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createBostaShipment(req, res) {
  const deliveryId = req.body.delivery_order_id || req.body.delivery_id || req.body.order_id || req.params.id;
  if (!deliveryId) return res.status(400).json({ error: 'delivery_order_id is required.' });

  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, orders(customer_name, customer_phone, total)')
      .eq('id', deliveryId)
      .single();
    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    const receiverName = req.body.receiver_name || req.body.receiverName || delivery.orders.customer_name;
    const receiverPhone = req.body.receiver_phone || req.body.receiverPhone || delivery.orders.customer_phone;
    const receiverAddress = req.body.receiver_address || req.body.receiverAddress || delivery.customer_address;

    const result = await bostaClient.createShipment({
      receiverName,
      receiverPhone,
      receiverAddress,
      city: req.body.city,
      zone: req.body.zone,
      packageSize: req.body.package_size || req.body.packageSize,
      codAmount: Number(req.body.cod_amount ?? req.body.codAmount ?? delivery.cod_amount ?? 0),
      notes: req.body.notes || delivery.notes
    });

    await supabase
      .from('delivery_orders')
      .update({
        delivery_type: 'bosta',
        driver_id: null,
        bosta_shipment_id: result.shipmentId,
        tracking_number: result.trackingNumber,
        status: 'assigned',
        updated_at: new Date().toISOString()
      })
      .eq('id', deliveryId);

    await supabase.from('delivery_log').insert({
      delivery_order_id: deliveryId,
      event: `Bosta shipment created: ${result.trackingNumber}`,
      notes: result.shipmentId || ''
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function trackBosta(req, res) {
  try {
    const tracking = await bostaClient.getTrackingStatus(req.params.trackingNumber);
    res.json(tracking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function bostaLabel(req, res) {
  try {
    const shipmentId = String(req.params.shipmentId).replace(/[^a-zA-Z0-9_-]/g, '');
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*, orders(*)')
      .eq('bosta_shipment_id', shipmentId)
      .maybeSingle();

    if (!delivery) {
      const waybill = await bostaClient.getWaybillUrl(shipmentId);
      if (waybill.success && waybill.url) {
        try {
          const parsedUrl = new URL(waybill.url);
          if (parsedUrl.protocol === 'https:' && parsedUrl.hostname.endsWith('bosta.co')) {
            const pdfRes = await require('axios').get(parsedUrl.href, { responseType: 'arraybuffer' });
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', `attachment; filename="bosta-label-${shipmentId}.pdf"`);
            return res.send(pdfRes.data);
          }
          return res.status(400).json({ error: 'Invalid waybill URL domain.' });
        } catch (e) {
          return res.status(400).json({ error: 'Invalid waybill URL format.' });
        }
      }
      return res.status(404).json({ error: waybill.error || 'Shipment label not found.' });
    }

    const pdf = await generateWaybillPDF(delivery, delivery.orders);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="bosta-label-${shipmentId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function processBostaWebhook(req, res) {
  try {
    const event = bostaClient.parseWebhookPayload(req.body);
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('id, order_id, status')
      .or(`bosta_shipment_id.eq.${event.shipmentId},tracking_number.eq.${event.trackingNumber}`)
      .maybeSingle();

    if (delivery) {
      const newStatus = BOSTA_STATUS_MAP.has(event.status) ? BOSTA_STATUS_MAP.get(event.status) : delivery.status;
      const updates = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'delivered' && { delivered_at: event.timestamp, cod_collected: true }),
        ...(newStatus === 'failed' && { failed_reason: 'refused' }),
        ...(newStatus === 'returned' && { cod_collected: false })
      };

      await supabase.from('delivery_orders').update(updates).eq('id', delivery.id);
      await supabase.from('delivery_log').insert({
        delivery_order_id: delivery.id,
        event: `Bosta webhook: ${event.statusName || event.status}`,
        notes: event.reason || ''
      });

      if (newStatus === 'delivered') {
        await supabase.from('orders').update({ status: 'delivered', payment_status: 'paid' }).eq('id', delivery.order_id);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Bosta error:', err);
    res.status(200).json({ received: true });
  }
}

async function deliveryAnalytics(req, res) {
  try {
    const { data: deliveries, error } = await supabase
      .from('delivery_orders')
      .select('*, drivers(name, zone)');
    if (error) throw error;

    const rows = deliveries || [];
    const byDriver = Object.create(null);
    const byZone = Object.create(null);
    const failedReasonsMap = new Map();
    const deliveryTypes = { own_driver: { total: 0, delivered: 0, failed: 0 }, bosta: { total: 0, delivered: 0, failed: 0 } };
    let codCollected = 0;
    let codOutstanding = 0;

    for (const d of rows) {
      const driverName = d.drivers?.name || (d.delivery_type === 'bosta' ? 'Bosta' : 'Unassigned');
      const zone = d.drivers?.zone || 'Unassigned';
      const type = d.delivery_type || 'own_driver';
      if (!deliveryTypes[type]) deliveryTypes[type] = { total: 0, delivered: 0, failed: 0 };
      deliveryTypes[type].total++;
      if (d.status === 'delivered') deliveryTypes[type].delivered++;
      if (d.status === 'failed') deliveryTypes[type].failed++;

      if (!byDriver[driverName]) byDriver[driverName] = { name: driverName, zone, total: 0, delivered: 0, failed: 0, totalTimeMs: 0 };
      byDriver[driverName].total++;
      if (d.status === 'delivered') {
        byDriver[driverName].delivered++;
        if (d.assigned_at && d.delivered_at) byDriver[driverName].totalTimeMs += new Date(d.delivered_at) - new Date(d.assigned_at);
      }
      if (d.status === 'failed') byDriver[driverName].failed++;

      if (!byZone[zone]) byZone[zone] = { zone, total: 0, delivered: 0, totalTimeMs: 0 };
      byZone[zone].total++;
      if (d.status === 'delivered') {
        byZone[zone].delivered++;
        if (d.assigned_at && d.delivered_at) byZone[zone].totalTimeMs += new Date(d.delivered_at) - new Date(d.assigned_at);
      }

      if (d.status === 'failed') {
        const reason = d.failed_reason || 'unknown';
        failedReasonsMap.set(reason, (failedReasonsMap.get(reason) || 0) + 1);
      }
      if (d.cod_collected) codCollected += Number(d.cod_amount || 0);
      else if (!['failed', 'returned'].includes(d.status)) codOutstanding += Number(d.cod_amount || 0);
    }

    const driverAnalytics = Object.values(byDriver).map(d => ({
      ...d,
      success_rate: d.total ? Number(((d.delivered / d.total) * 100).toFixed(1)) : 0,
      avg_delivery_time_hrs: d.delivered ? Number(((d.totalTimeMs / d.delivered) / 3600000).toFixed(1)) : 0
    }));

    const zoneAnalytics = Object.values(byZone).map(z => ({
      ...z,
      avg_delivery_time_hrs: z.delivered ? Number(((z.totalTimeMs / z.delivered) / 3600000).toFixed(1)) : 0
    }));

    res.json({
      driverAnalytics,
      zoneAnalytics,
      failedReasons: Object.fromEntries(failedReasonsMap),
      cod: { collected: codCollected, outstanding: codOutstanding },
      costComparison: deliveryTypes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateDeliveryType(req, res) {
  const { delivery_type } = req.body;
  if (!delivery_type || !['own_driver', 'bosta'].includes(delivery_type)) {
    return res.status(400).json({ error: 'Invalid delivery type. Must be own_driver or bosta.' });
  }

  try {
    const { data: delivery } = await supabase
      .from('delivery_orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery order not found.' });
    }

    const updates = {
      delivery_type,
      updated_at: new Date().toISOString(),
      driver_id: null,
      assigned_at: null,
      status: 'pending',
      tracking_number: null,
      bosta_shipment_id: null
    };

    const { error } = await supabase
      .from('delivery_orders')
      .update(updates)
      .eq('id', req.params.id);

    if (error) throw error;

    await supabase.from('delivery_log').insert({
      delivery_order_id: req.params.id,
      event: `Delivery type changed to: ${delivery_type}`
    });

    res.json({ success: true, delivery_type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/', authenticate, listDeliveryOrders);
router.get('/orders', authenticate, listDeliveryOrders);
router.patch('/orders/:id/type', authenticate, authorize('admin', 'ceo', 'dispatcher', 'worker'), updateDeliveryType);
router.get('/summary', authenticate, getSummary);
router.post('/assign', authenticate, authorize('admin', 'ceo', 'dispatcher', 'worker'), assignDriver);
router.put('/:id/status', authenticate, updateDeliveryStatus);
router.patch('/orders/:id/status', authenticate, updateDeliveryStatus);
router.post('/:id/bosta', authenticate, authorize('admin', 'ceo', 'dispatcher', 'worker'), createBostaShipment);
router.post('/bosta/create', authenticate, authorize('admin', 'ceo', 'dispatcher', 'worker'), createBostaShipment);
router.get('/:id/track', authenticate, async (req, res) => {
  try {
    const { data: delivery } = await supabase.from('delivery_orders').select('tracking_number').eq('id', req.params.id).single();
    if (!delivery?.tracking_number) return res.status(400).json({ error: 'No tracking number available.' });
    req.params.trackingNumber = delivery.tracking_number;
    return trackBosta(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/bosta/track/:trackingNumber', authenticate, trackBosta);
router.get('/:id/waybill', authenticate, async (req, res) => {
  try {
    const safeId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const { data: delivery } = await supabase.from('delivery_orders').select('*, orders(*)').eq('id', safeId).single();
    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });
    const pdf = await generateWaybillPDF(delivery, delivery.orders);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="waybill-${safeId.slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/bosta/label/:shipmentId', authenticate, bostaLabel);
router.post('/bosta/webhook', verifyBostaWebhook, processBostaWebhook);
router.get('/driver/:id/orders', getDriverOrders);
router.put('/driver/:id/orders/:orderId/status', updateDriverOrderStatus);
router.patch('/driver/:id/orders/:orderId/status', updateDriverOrderStatus);
router.get('/analytics', authenticate, deliveryAnalytics);

// GET /api/delivery/dispatch-queue — pending own_driver orders grouped with available drivers
router.get('/dispatch-queue', authenticate, authorize('admin', 'ceo', 'dispatcher'), async (_req, res) => {
  try {
    const [ordersRes, driversRes] = await Promise.all([
      supabase
        .from('delivery_orders')
        .select(`
          *,
          orders(customer_name, customer_phone, total, items, order_number, shopify_order_name),
          drivers(name, phone, zone, availability_status)
        `)
        .eq('delivery_type', 'own_driver')
        .in('status', ['pending', 'assigned'])
        .order('created_at', { ascending: true }),
      supabase
        .from('drivers')
        .select('id, name, phone, zone, availability_status')
        .eq('status', 'active')
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (driversRes.error) throw driversRes.error;

    const orders = ordersRes.data || [];
    const drivers = driversRes.data || [];

    const driverLoads = {};
    for (const o of orders) {
      if (o.driver_id) driverLoads[o.driver_id] = (driverLoads[o.driver_id] || 0) + 1;
    }
    const enrichedDrivers = drivers.map(d => ({ ...d, active_orders: driverLoads[d.id] || 0 }));

    res.json({ orders, drivers: enrichedDrivers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
