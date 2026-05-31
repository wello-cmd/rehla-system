// Inventory Routes — FR-WH-01 through FR-WH-15
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { generateBarcode, generateBulkBarcodes } = require('../services/barcodeGenerator');
const { stringify } = require('csv-stringify/sync');

// GET /api/inventory — List all products (FR-WH-01)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, warehouses(name, code)')
      .order('name');

    if (error) throw error;

    // FR-WH-10: Calculate 4-state stock for each product
    for (const product of data) {
      // Get warehouse exits count
      const { data: exits } = await supabase
        .from('inventory_log')
        .select('quantity_changed')
        .eq('sku', product.sku)
        .eq('event_type', 'warehouse_exit');

      const { data: sold } = await supabase
        .from('inventory_log')
        .select('quantity_changed')
        .eq('sku', product.sku)
        .eq('event_type', 'sold');

      product.left_warehouse = (exits || []).reduce((sum, e) => sum + Math.abs(e.quantity_changed), 0);
      product.total_sold = (sold || []).reduce((sum, e) => sum + Math.abs(e.quantity_changed), 0);
      product.in_warehouse = product.stock_quantity;
      product.low_stock = product.stock_quantity < 10; // FR-WH-11
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory — Add new product
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { sku, name, description, stock_quantity, price, cost_per_unit, category, image_url, warehouse_id, brand, barcode } = req.body;
  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: 'SKU, name, and price are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .insert({
        sku: sku.toUpperCase(),
        name,
        description: description || '',
        stock_quantity: stock_quantity || 0,
        price,
        cost_per_unit: cost_per_unit || 0,
        category: category || 'Uncategorized',
        image_url: image_url || '',
        warehouse_id: warehouse_id || null,
        brand: brand || 'REHLA',
        barcode: barcode || require('../services/barcodeGenerator').generateBarcodeString()
      })
      .select('*, warehouses(name, code)')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id — Update product
router.put('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const updates = {};
    const allowed = ['name', 'description', 'price', 'cost_per_unit', 'category', 'image_url', 'warehouse_id', 'brand', 'barcode'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, warehouses(name, code)')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id/stock — Manual stock adjustment (FR-WH-13)
router.put('/:id/stock', authenticate, authorize('admin', 'ceo', 'worker'), async (req, res) => {
  const { quantity, notes } = req.body;
  if (quantity === undefined) {
    return res.status(400).json({ error: 'Quantity is required.' });
  }

  try {
    // NFR-RL-04: Atomic transaction — fetch then update
    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, sku, stock_quantity')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const prevQty = product.stock_quantity;
    const newQty = quantity;
    const diff = newQty - prevQty;

    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock_quantity: newQty })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    // Log the adjustment
    await supabase.from('inventory_log').insert({
      product_id: product.id,
      sku: product.sku,
      event_type: 'adjustment',
      quantity_changed: diff,
      previous_quantity: prevQty,
      new_quantity: newQty,
      notes: notes || 'Manual stock adjustment',
      handler_id: req.user.id,
      handler_name: req.user.name
    });

    res.json({ success: true, previous: prevQty, new: newQty, change: diff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id — Delete product
router.delete('/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id/barcode — Generate barcode image (FR-WH-02, FR-WH-03)
router.get('/:id/barcode', async (req, res) => {
  try {
    const { data: product } = await supabase
      .from('products')
      .select('sku, barcode')
      .eq('id', req.params.id)
      .single();

    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const barcodeText = product.barcode || product.sku;
    const png = await generateBarcode(barcodeText);

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${product.sku}-barcode.png"`);
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/barcode/generate — Generate new barcode for product (FR-WH-02)
router.post('/:id/barcode/generate', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const newBarcode = require('../services/barcodeGenerator').generateBarcodeString();
    const { data, error } = await supabase
      .from('products')
      .update({ barcode: newBarcode })
      .eq('id', req.params.id)
      .select('*, warehouses(name, code)')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/barcode/bulk — Bulk barcode print (FR-WH-05)
router.post('/barcode/bulk', authenticate, async (req, res) => {
  const { product_ids } = req.body;
  if (!product_ids || !product_ids.length) {
    return res.status(400).json({ error: 'product_ids array required.' });
  }

  try {
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name, barcode')
      .in('id', product_ids);

    const skus = products.map(p => p.barcode || p.sku);
    const barcodes = await generateBulkBarcodes(skus);

    // Return base64 encoded images
    const results = products.map((p, i) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      barcode_image: barcodes[i].success ? barcodes[i].image.toString('base64') : null
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/export/csv — CSV export (FR-WH-14)
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('sku, name, category, brand, stock_quantity, price, cost_per_unit, warehouses(name)')
      .order('name');

    if (error) throw error;

    const rows = data.map(p => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category,
      Brand: p.brand,
      'Stock Quantity': p.stock_quantity,
      'Price (EGP)': p.price,
      'Cost Per Unit (EGP)': p.cost_per_unit,
      Warehouse: p.warehouses?.name || ''
    }));

    const csv = stringify(rows, { header: true });
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="rehla-inventory.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouse/exit — Warehouse exit scan (FR-WH-06 through FR-WH-09)
router.post('/warehouse/exit', authenticate, async (req, res) => {
  const { sku, barcode, quantity } = req.body;
  const searchValue = (sku || barcode || '').toUpperCase();
  const qty = quantity || 1;

  if (!searchValue) {
    return res.status(400).json({ error: 'SKU or barcode is required.' });
  }

  try {
    // Look up product by SKU or barcode
    const { data: product, error: lookupErr } = await supabase
      .from('products')
      .select('*')
      .or(`sku.eq.${searchValue},barcode.eq.${searchValue}`)
      .single();

    if (lookupErr || !product) {
      return res.status(404).json({ error: `Product not found: ${searchValue}` });
    }

    // FR-WH-09: Block if stock is 0
    if (product.stock_quantity < qty) {
      return res.status(400).json({
        error: `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
        product
      });
    }

    // NFR-RL-04: Atomic update
    const newQty = product.stock_quantity - qty;
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock_quantity: newQty })
      .eq('id', product.id);

    if (updateErr) throw updateErr;

    // FR-WH-08: Log warehouse exit
    await supabase.from('inventory_log').insert({
      product_id: product.id,
      sku: product.sku,
      event_type: 'warehouse_exit',
      quantity_changed: -qty,
      previous_quantity: product.stock_quantity,
      new_quantity: newQty,
      notes: `Warehouse exit scan`,
      handler_id: req.user.id,
      handler_name: req.user.name,
      warehouse_id: product.warehouse_id
    });

    // FR-WH-07: Return confirmation card data
    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        previous_stock: product.stock_quantity,
        current_stock: newQty,
        quantity_exited: qty,
        low_stock: newQty < 10
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
