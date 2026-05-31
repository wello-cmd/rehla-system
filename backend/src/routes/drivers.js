// Driver Routes — FR-DL-04
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /api/drivers — List all drivers (FR-DL-04)
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*, user_profiles(email)')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers — Create driver (FR-DL-04)
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { name, phone, zone, user_id } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        name,
        phone,
        zone: zone || '',
        user_id: user_id || null,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id — Update driver
router.put('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { name, phone, zone, status } = req.body;
  try {
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (zone !== undefined) updates.zone = zone;
    if (status) updates.status = status;

    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:id/cod — COD tracking per driver (FR-DL-09)
router.get('/:id/cod', authenticate, async (req, res) => {
  try {
    const { data } = await supabase
      .from('delivery_orders')
      .select('cod_amount, status')
      .eq('driver_id', req.params.id)
      .gt('cod_amount', 0);

    const collected = (data || []).filter(d => d.status === 'delivered').reduce((s, d) => s + Number(d.cod_amount), 0);
    const pending = (data || []).filter(d => d.status !== 'delivered').reduce((s, d) => s + Number(d.cod_amount), 0);

    res.json({ collected, pending, total: collected + pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
