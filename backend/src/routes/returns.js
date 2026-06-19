// Returns Routes — customer return management
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const shopifySync = require('../services/shopifySync');

// Fire-and-forget: mirror a stock change to Shopify without blocking the response.
function syncStockToShopify(kind, id) {
  if (!id) return;
  const op = kind === 'variant' ? shopifySync.pushVariantStock(id) : shopifySync.pushProductStock(id);
  Promise.resolve(op)
    .then(r => { if (r && r.ok) console.log(`[Shopify] stock pushed (${kind} ${id})`); })
    .catch(err => console.error(`[Shopify] stock push failed (${kind} ${id}):`, err.message || err));
}

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

    // Resolve the linked order once so every restock log row is traceable.
    let orderRef = null;
    if (ret.order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('order_number, shopify_order_name')
        .eq('id', ret.order_id)
        .maybeSingle();
      orderRef = order?.shopify_order_name || (order?.order_number != null ? `#${order.order_number}` : null);
    }

    // Pass 1 — resolve every returned item to a variant BEFORE touching stock,
    // so a single unmatched SKU can't leave a half-applied restock behind.
    const resolved = [];
    const skipped = [];
    for (const item of ret.items) {
      const qty = parseInt(item.quantity || 1, 10);
      if (qty <= 0) continue;

      // Prefer the exact variant captured from the order; fall back to SKU/barcode.
      let variant = null;
      if (item.variant_id) {
        const { data } = await supabase
          .from('product_variants')
          .select('id, product_id, sku, stock_quantity, products(warehouse_id)')
          .eq('id', item.variant_id)
          .maybeSingle();
        variant = data;
      }
      if (!variant && item.sku) {
        const sv = item.sku.toUpperCase();
        const { data } = await supabase
          .from('product_variants')
          .select('id, product_id, sku, stock_quantity, products(warehouse_id)')
          .or(`sku.eq.${sv},barcode.eq.${sv}`)
          .maybeSingle();
        variant = data;
      }

      if (!variant) { skipped.push(item.sku || '(no sku)'); continue; }
      resolved.push({ variant, qty });
    }

    if (skipped.length) {
      return res.status(409).json({
        error: `Could not match these SKUs to a product variant: ${skipped.join(', ')}. No stock was changed.`,
        code: 'UNMATCHED_SKUS'
      });
    }

    // Pass 2 — apply: bump each variant, recompute its parent total, sync Shopify, log.
    for (const { variant, qty } of resolved) {
      const prevQty = variant.stock_quantity || 0;
      const newQty = prevQty + qty;

      await supabase.from('product_variants').update({ stock_quantity: newQty }).eq('id', variant.id);
      const { data: siblings } = await supabase
        .from('product_variants').select('stock_quantity').eq('product_id', variant.product_id);
      const parentTotal = (siblings || []).reduce((s, v) => s + (v.stock_quantity || 0), 0);
      await supabase.from('products').update({ stock_quantity: parentTotal }).eq('id', variant.product_id);

      syncStockToShopify('variant', variant.id);

      await supabase.from('inventory_log').insert({
        product_id: variant.product_id,
        sku: variant.sku,
        event_type: 'return',
        quantity_changed: qty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        notes: `Return restock${orderRef ? ` — order ${orderRef}` : ''}`,
        handler_id: req.user?.id || null,
        handler_name: req.user?.name || '',
        warehouse_id: variant.products?.warehouse_id || null,
        order_id: ret.order_id || null,
        order_number: orderRef
      });
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
