// Client Routes — FR-IV-01 (B2B Client Registry)
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /api/clients
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('clients').select('*').order('company_name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { company_name, contact_person, phone, email, address, tax_number, fulfillment_fee_percentage, storage_fee_monthly, storage_fee_per_unit } = req.body;
  if (!company_name || !contact_person) {
    return res.status(400).json({ error: 'Company name and contact person are required.' });
  }
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({ 
        company_name, 
        contact_person, 
        phone: phone || '', 
        email: email || '', 
        address: address || '', 
        tax_number: tax_number || '',
        fulfillment_fee_percentage: fulfillment_fee_percentage || 0,
        storage_fee_monthly: storage_fee_monthly || 0,
        storage_fee_per_unit: storage_fee_per_unit || 0
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const allowed = ['company_name', 'contact_person', 'phone', 'email', 'address', 'tax_number', 'fulfillment_fee_percentage', 'storage_fee_monthly', 'storage_fee_per_unit'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    const { data, error } = await supabase.from('clients').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
