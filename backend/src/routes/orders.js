// Orders Routes
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// GET /api/orders
router.get('/', authenticate, async (req, res) => {
  try {
    const { start, end, status } = req.query;
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', req.params.id);
    res.json({ ...order, items: items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
