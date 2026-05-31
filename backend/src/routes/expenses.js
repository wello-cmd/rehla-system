// Expense Routes — FR-FN-03, FR-FN-04
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /api/expenses
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses (FR-FN-03)
router.post('/', authenticate, async (req, res) => {
  const { title, description, category, amount, date } = req.body;
  if (!title || !category || amount === undefined || !date) {
    return res.status(400).json({ error: 'Title, category, amount, and date are required.' });
  }

  // FR-FN-04: Validate category
  const validCats = ['Inventory', 'Shipping', 'Marketing', 'Platform', 'Operations', 'Other'];
  if (!validCats.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be: ${validCats.join(', ')}` });
  }

  try {
    const status = ['admin', 'ceo'].includes(req.user.role) ? 'approved' : 'pending';
    const approved_by = status === 'approved' ? req.user.name : null;

    const { data, error } = await supabase
      .from('expenses')
      .insert({ title, description: description || '', category, amount, status, date, approved_by })
      .select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id/approve
router.put('/:id/approve', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { approve } = req.body;
  const status = approve ? 'approved' : 'rejected';
  try {
    const { error } = await supabase.from('expenses').update({ status, approved_by: req.user.name }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
