// Warehouse Routes
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /api/warehouses
router.get('/', async (req, res) => {
  try {
    const { data: warehouses, error } = await supabase.from('warehouses').select('*');
    if (error) throw error;

    // Enrich with product counts
    for (const wh of warehouses) {
      const { data: products } = await supabase
        .from('products')
        .select('id, stock_quantity, brand')
        .eq('warehouse_id', wh.id);

      wh.sku_count = (products || []).length;
      wh.total_stock = (products || []).reduce((s, p) => s + p.stock_quantity, 0);
      wh.brands = [...new Set((products || []).map(p => p.brand))];
    }

    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouses
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { code, name, location } = req.body;
  if (!code || !name || !location) {
    return res.status(400).json({ error: 'Code, name, and location are required.' });
  }
  try {
    const { data, error } = await supabase
      .from('warehouses')
      .insert({ code: code.toUpperCase(), name, location })
      .select().single();
    if (error) throw error;
    res.status(201).json({ ...data, sku_count: 0, total_stock: 0, brands: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
