// Returns Routes — customer return management
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /api/returns — list all returns with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, start, end } = req.query;
    let query = supabase
      .from('returns')
      .select('*, orders(order_number, shopify_order_name, customer_name, total)')
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

// POST /api/returns — create a new return
router.post('/', authenticate, authorize('admin', 'ceo', 'dispatcher'), async (req, res) => {
  const { order_id, customer_name, items, reason, notes } = req.body;
  if (!items?.length || !reason) {
    return res.status(400).json({ error: 'Items and reason are required.' });
  }
  try {
    const { data, error } = await supabase
      .from('returns')
      .insert({
        order_id: order_id || null,
        customer_name: customer_name || '',
        items,
        reason,
        notes: notes || '',
        handler_name: req.user?.name || '',
        status: 'pending'
      })
      .select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/returns/:id/approve — approve a return
router.patch('/:id/approve', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('returns')
      .update({ status: 'approved', handler_name: req.user?.name || '' })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/returns/:id/restock — mark restocked and add stock back
router.patch('/:id/restock', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { data: ret, error: fetchErr } = await supabase
      .from('returns')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !ret) return res.status(404).json({ error: 'Return not found.' });
    if (ret.restocked) return res.status(400).json({ error: 'Already restocked.' });

    // Add stock back for each item
    for (const item of ret.items) {
      if (!item.sku) continue;
      const { data: product } = await supabase
        .from('products')
        .select('id, stock_quantity')
        .eq('sku', item.sku.toUpperCase())
        .maybeSingle();

      if (product) {
        const qty = parseInt(item.quantity || 1, 10);
        const newQty = product.stock_quantity + qty;
        await supabase.from('products').update({ stock_quantity: newQty }).eq('id', product.id);
        await supabase.from('inventory_log').insert({
          product_id: product.id,
          sku: item.sku.toUpperCase(),
          event_type: 'return',
          quantity_changed: qty,
          previous_quantity: product.stock_quantity,
          new_quantity: newQty,
          notes: `Return ID: ${ret.id}`,
          handler_name: req.user?.name || ''
        });
      }
    }

    const { data, error } = await supabase
      .from('returns')
      .update({ status: 'restocked', restocked: true, handler_name: req.user?.name || '' })
      .eq('id', req.params.id)
      .select().single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/returns/:id/refund — mark as refunded
router.patch('/:id/refund', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('returns')
      .update({ status: 'refunded', handler_name: req.user?.name || '' })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;

    // Update linked order status if present
    if (data.order_id) {
      await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', data.order_id);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
