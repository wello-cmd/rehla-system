// Inventory Routes — FR-WH-01 through FR-WH-15
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const rateLimit = require('../middleware/rateLimiter');
const { generateBarcode, generateBulkBarcodes, generateLabelHtml, formatLabelLines } = require('../services/barcodeGenerator');
const { stringify } = require('csv-stringify/sync');
const shopifySync = require('../services/shopifySync');

// Fire-and-forget: mirror a stock change to Shopify without blocking the API response.
// Items not linked to Shopify (no inventory_item_id) are skipped silently.
function syncStockToShopify(kind, id) {
  if (!id) return;
  const op = kind === 'variant' ? shopifySync.pushVariantStock(id) : shopifySync.pushProductStock(id);
  Promise.resolve(op)
    .then(r => { if (r && r.ok) console.log(`[Shopify] stock pushed (${kind} ${id})`); })
    .catch(err => console.error(`[Shopify] stock push failed (${kind} ${id}):`, err.message || err));
}

// Apply rate limiting to all inventory routes (FR-WH-01 through FR-WH-15)
router.use(rateLimit(300, 15 * 60 * 1000)); // Max 300 requests per 15 mins per IP

// GET /api/inventory — List all products with nested variants (FR-WH-01)
router.get('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { data, error } = await supabase
      .from('products')
      .select('*, warehouses(name, code), clients(company_name), product_variants(id, sku, variant_name, size, color, price, cost_per_unit, stock_quantity, barcode, shopify_variant_id)')
      .order('name');

    if (error) throw error;

    // Aggregate inventory_log by product_id (cleaner than per-SKU now that products are parents)
    let exitsQuery = supabase
      .from('inventory_log')
      .select('product_id, quantity_changed')
      .eq('event_type', 'warehouse_exit');
    let soldQuery = supabase
      .from('inventory_log')
      .select('product_id, quantity_changed')
      .eq('event_type', 'sold');

    if (start_date) {
      exitsQuery = exitsQuery.gte('created_at', start_date);
      soldQuery  = soldQuery.gte('created_at', start_date);
    }
    if (end_date) {
      exitsQuery = exitsQuery.lte('created_at', end_date);
      soldQuery  = soldQuery.lte('created_at', end_date);
    }

    const [{ data: allExits }, { data: allSold }] = await Promise.all([exitsQuery, soldQuery]);

    const exitsByProduct = {};
    for (const e of allExits || []) {
      if (e.product_id) exitsByProduct[e.product_id] = (exitsByProduct[e.product_id] || 0) + Math.abs(e.quantity_changed);
    }
    const soldByProduct = {};
    for (const s of allSold || []) {
      if (s.product_id) soldByProduct[s.product_id] = (soldByProduct[s.product_id] || 0) + Math.abs(s.quantity_changed);
    }

    for (const product of data) {
      product.left_warehouse = exitsByProduct[product.id] || 0;
      product.total_sold     = soldByProduct[product.id]  || 0;
      product.in_warehouse   = product.stock_quantity + product.left_warehouse + product.total_sold;
      product.current_stock  = product.stock_quantity;
      product.low_stock      = product.stock_quantity < 10; // FR-WH-11
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory — Add new product
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { sku, name, description, stock_quantity, price, cost_per_unit, category, image_url, warehouse_id, brand, barcode, client_id } = req.body;
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
        client_id: client_id || null,
        barcode: barcode || require('../services/barcodeGenerator').generateBarcodeString()
      })
      .select('*, warehouses(name, code), clients(company_name)')
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
    const allowed = ['name', 'description', 'price', 'cost_per_unit', 'category', 'image_url', 'warehouse_id', 'brand', 'barcode', 'client_id'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Empty strings aren't valid UUIDs — store NULL (e.g. "REHLA Internal" = no client)
    for (const uuidField of ['client_id', 'warehouse_id']) {
      if (updates[uuidField] === '') updates[uuidField] = null;
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, warehouses(name, code), clients(company_name)')
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

    // Mirror the new level to Shopify
    syncStockToShopify('product', req.params.id);

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

// GET /api/inventory/:id/barcode — Print-ready label HTML (FR-WH-02, FR-WH-03)
router.get('/:id/barcode', async (req, res) => {
  try {
    const { variant_id } = req.query;
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, sku, name, barcode, category')
      .eq('id', req.params.id)
      .maybeSingle();

    if (productErr) throw productErr;
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    let labelProduct = product;
    // If a variant_id is specified, use the variant's barcode/sku instead
    if (variant_id) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('id, sku, barcode, size, color')
        .eq('id', variant_id)
        .eq('product_id', req.params.id)
        .maybeSingle();
      if (variant) {
        labelProduct = {
          ...product,
          sku: variant.sku,
          barcode: variant.barcode || variant.sku,
          size: [variant.size, variant.color].filter(Boolean).join(' / ')
        };
      }
    }

    // ?format=png → return just the barcode image (used for the in-app preview).
    // Default → return a print-ready HTML label (product name + size/color + refs).
    if (req.query.format === 'png') {
      const { barcodeText } = formatLabelLines(labelProduct);
      // labelProduct.size holds "size / color" when a variant is selected
      const alttext = labelProduct.size ? `${barcodeText}  ${labelProduct.size}` : barcodeText;
      const png = await generateBarcode(barcodeText, { alttext });
      res.set('Content-Type', 'image/png');
      return res.send(png);
    }

    const html = await generateLabelHtml(labelProduct);
    res.set('Content-Type', 'text/html');
    res.send(html);
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
      .select('*, warehouses(name, code), clients(company_name)')
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

    const results = products.map((p, i) => {
      const { line1, line2 } = formatLabelLines(p);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode_image: barcodes[i].success ? barcodes[i].image.toString('base64') : null,
        line1,
        line2
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/barcode/bulk-variants — Bulk barcode print with variant selection
router.post('/barcode/bulk-variants', authenticate, async (req, res) => {
  const { items } = req.body; // items: [{ product_id, variant_ids: [id1, id2] }]
  if (!items || !items.length) {
    return res.status(400).json({ error: 'items array required. Each item: { product_id, variant_ids? }' });
  }

  try {
    const productIds = items.map(i => i.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name, barcode, category')
      .in('id', productIds);

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

    // Collect all variant IDs needed
    const allVariantIds = items.flatMap(i => i.variant_ids || []);
    let variantMap = {};
    if (allVariantIds.length > 0) {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, product_id, sku, size, color, barcode, variant_name, stock_quantity, price')
        .in('id', allVariantIds);
      variantMap = Object.fromEntries((variants || []).map(v => [v.id, v]));
    }

    const labelItems = [];
    for (const item of items) {
      const product = productMap[item.product_id];
      if (!product) continue;

      if (item.variant_ids && item.variant_ids.length > 0) {
        // Generate one barcode per selected variant
        for (const vid of item.variant_ids) {
          const variant = variantMap[vid];
          if (!variant) continue;
          const barcodeText = variant.barcode || variant.sku;
          const variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ');
          labelItems.push({
            barcodeText,
            name: `${product.name}${variantLabel ? ` — ${variantLabel}` : ''}`,
            sku: variant.sku,
            product_id: product.id,
            variant_id: variant.id,
            size: variant.size || '',
            color: variant.color || '',
            product
          });
        }
      } else {
        // No variants selected — use product-level barcode
        labelItems.push({
          barcodeText: product.barcode || product.sku,
          name: product.name,
          sku: product.sku,
          product_id: product.id,
          variant_id: null,
          size: '',
          color: '',
          product
        });
      }
    }

    // Generate each barcode with size/color burned into the human-readable line
    const barcodes = [];
    for (const l of labelItems) {
      const variantLabel = [l.size, l.color].filter(Boolean).join(' / ');
      const alttext = variantLabel ? `${l.barcodeText}  ${variantLabel}` : l.barcodeText;
      try {
        const image = await generateBarcode(l.barcodeText, { alttext });
        barcodes.push({ image, success: true });
      } catch (e) {
        barcodes.push({ image: null, success: false });
      }
    }

    const results = labelItems.map((l, i) => {
      const { line1, line2 } = formatLabelLines({ ...l.product, barcode: l.barcodeText, sku: l.sku });
      return {
        id: l.product_id,
        variant_id: l.variant_id,
        sku: l.sku,
        name: l.name,
        size: l.size,
        color: l.color,
        barcode_image: barcodes[i].success ? barcodes[i].image.toString('base64') : null,
        line1,
        line2
      };
    });

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
      .select('sku, name, category, brand, stock_quantity, price, cost_per_unit, warehouses(name), clients(company_name)')
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
      Warehouse: p.warehouses?.name || '',
      Client: p.clients?.company_name || 'Internal'
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
    // Look up variant by SKU or barcode, join parent product for name + warehouse
    const { data: variant, error: lookupErr } = await supabase
      .from('product_variants')
      .select('*, products(id, name, warehouse_id, brand)')
      .or(`sku.eq.${searchValue},barcode.eq.${searchValue}`)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!variant) return res.status(404).json({ error: `Product not found: ${searchValue}` });

    const parent = variant.products;
    const displayName = `${parent?.name || ''}${variant.variant_name ? ` - ${variant.variant_name}` : ''}`;

    // FR-WH-09: Block if stock is insufficient
    if (variant.stock_quantity < qty) {
      return res.status(400).json({
        error: `Insufficient stock for ${displayName}. Available: ${variant.stock_quantity}`
      });
    }

    const prevQty = variant.stock_quantity;
    const newQty = prevQty - qty;

    // Update variant stock
    await supabase.from('product_variants').update({ stock_quantity: newQty }).eq('id', variant.id);

    // Recalculate and sync parent total stock
    const { data: siblings } = await supabase
      .from('product_variants').select('stock_quantity').eq('product_id', parent.id);
    const parentTotal = (siblings || []).reduce((s, v) => s + (v.stock_quantity || 0), 0);
    await supabase.from('products').update({ stock_quantity: parentTotal }).eq('id', parent.id);

    // Mirror the new variant level to Shopify
    syncStockToShopify('variant', variant.id);

    // FR-WH-08: Log warehouse exit
    await supabase.from('inventory_log').insert({
      product_id: parent.id,
      sku: variant.sku,
      event_type: 'warehouse_exit',
      quantity_changed: -qty,
      previous_quantity: prevQty,
      new_quantity: newQty,
      notes: 'Warehouse exit scan',
      handler_id: req.user.id,
      handler_name: req.user.name,
      warehouse_id: parent.warehouse_id
    });

    res.json({
      success: true,
      product: {
        id: parent.id,
        variant_id: variant.id,
        name: displayName,
        sku: variant.sku,
        barcode: variant.barcode,
        previous_stock: prevQty,
        current_stock: newQty,
        quantity_exited: qty,
        low_stock: newQty < 10
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/logs — List inventory logs (audit trail)
router.get('/logs', authenticate, authorize('admin', 'ceo', 'worker'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory_log')
      .select('*, products(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/warehouse/restock — Receive / add stock inbound
router.post('/warehouse/restock', authenticate, authorize('admin', 'ceo', 'worker'), async (req, res) => {
  const { sku, quantity, notes } = req.body;
  if (!sku || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'SKU and a positive quantity are required.' });
  }
  try {
    const searchValue = sku.toUpperCase();
    const { data: variant, error: findErr } = await supabase
      .from('product_variants')
      .select('*, products(id, name, warehouse_id)')
      .or(`sku.eq.${searchValue},barcode.eq.${sku}`)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!variant) return res.status(404).json({ error: `Product not found: ${sku}` });

    const parent = variant.products;
    const qty = parseInt(quantity, 10);
    const prevQty = variant.stock_quantity;
    const newQty = prevQty + qty;

    await supabase.from('product_variants').update({ stock_quantity: newQty }).eq('id', variant.id);

    // Recalculate parent total
    const { data: siblings } = await supabase
      .from('product_variants').select('stock_quantity').eq('product_id', parent.id);
    const parentTotal = (siblings || []).reduce((s, v) => s + (v.stock_quantity || 0), 0);
    await supabase.from('products').update({ stock_quantity: parentTotal }).eq('id', parent.id);

    // Mirror the new variant level to Shopify
    syncStockToShopify('variant', variant.id);

    await supabase.from('inventory_log').insert({
      product_id: parent.id,
      sku: variant.sku,
      event_type: 'restock',
      quantity_changed: qty,
      previous_quantity: prevQty,
      new_quantity: newQty,
      notes: notes || 'Manual restock',
      handler_name: req.user?.name || 'system'
    });

    const displayName = `${parent?.name || ''}${variant.variant_name ? ` - ${variant.variant_name}` : ''}`;
    res.json({
      product: {
        id: parent.id,
        variant_id: variant.id,
        name: displayName,
        sku: variant.sku,
        barcode: variant.barcode,
        previous_stock: prevQty,
        current_stock: newQty,
        quantity_added: qty
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Product Variants ────────────────────────────────────────────────────────

// GET /api/inventory/:productId/variants
router.get('/:productId/variants', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', req.params.productId)
      .order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:productId/variants
router.post('/:productId/variants', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { sku, size, color, stock_quantity, price, barcode } = req.body;
  if (!sku) return res.status(400).json({ error: 'Variant SKU is required.' });
  try {
    const { data, error } = await supabase
      .from('product_variants')
      .insert({ product_id: req.params.productId, sku: sku.toUpperCase(), size: size || '', color: color || '', stock_quantity: parseInt(stock_quantity || 0), price: price ? parseFloat(price) : null, barcode: barcode || null })
      .select().single();
    if (error) throw error;
    syncStockToShopify('variant', data.id);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:productId/variants/:variantId
router.patch('/:productId/variants/:variantId', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const allowed = ['sku', 'size', 'color', 'stock_quantity', 'price', 'barcode'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (updates.stock_quantity !== undefined) updates.stock_quantity = parseInt(updates.stock_quantity, 10);
  if (updates.price !== undefined) updates.price = parseFloat(updates.price);
  try {
    const { data, error } = await supabase
      .from('product_variants')
      .update(updates)
      .eq('id', req.params.variantId)
      .eq('product_id', req.params.productId)
      .select().single();
    if (error) throw error;
    if (updates.stock_quantity !== undefined) syncStockToShopify('variant', req.params.variantId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:productId/variants/:variantId
router.delete('/:productId/variants/:variantId', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('product_variants')
      .delete()
      .eq('id', req.params.variantId)
      .eq('product_id', req.params.productId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
