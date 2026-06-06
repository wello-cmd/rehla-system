// POS Checkout Routes — Bonus module (retained from existing system)
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// POST /api/pos/checkout
router.post('/checkout', authenticate, async (req, res) => {
  const { items, payment_method, amount_received, customer_name, customer_phone, delivery_address, discount_amount, discount_reason } = req.body;

  if (!items || items.length === 0 || !payment_method) {
    return res.status(400).json({ error: 'Items list and payment method are required.' });
  }

  try {
    let subtotal = 0;
    const itemsWithDetails = [];

    for (const item of items) {
      const { data: prod } = await supabase
        .from('products')
        .select('*')
        .or(`id.eq.${item.id},sku.eq.${(item.sku || '').toUpperCase()}`)
        .single();

      if (!prod) return res.status(400).json({ error: `Product not found: ${item.id || item.sku}` });
      if (prod.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}` });
      }

      const lineCost = prod.price * item.quantity;
      subtotal += lineCost;
      itemsWithDetails.push({
        product_id: prod.id, sku: prod.sku, name: prod.name,
        quantity: item.quantity, price: prod.price, cost_per_unit: prod.cost_per_unit,
        warehouse_id: prod.warehouse_id
      });
    }

    const discount = Math.max(0, parseFloat(discount_amount || 0));
    const total = Math.max(0, subtotal - discount);

    // Deduct stock after all items have been validated.
    for (const item of itemsWithDetails) {
      const { data: current } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
      const newQuantity = Number(current.stock_quantity) - Number(item.quantity);
      if (newQuantity < 0) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}. Available: ${current.stock_quantity}` });
      }
      await supabase.from('products').update({ stock_quantity: newQuantity }).eq('id', item.product_id);
    }

    // Insert Order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_name: customer_name || 'Walk-in Customer',
        customer_phone: customer_phone || 'N/A',
        subtotal, total,
        discount_amount: discount,
        discount_reason: discount_reason || '',
        payment_status: 'paid',
        payment_method,
        source: 'pos'
      })
      .select().single();

    if (orderErr) throw orderErr;

    // Insert Order Items
    for (const item of itemsWithDetails) {
      await supabase.from('order_items').insert({
        order_id: order.id, product_id: item.product_id, sku: item.sku,
        name: item.name, quantity: item.quantity, price: item.price, cost_per_unit: item.cost_per_unit
      });
    }

    // Auto-create Invoice
    const year = new Date().getFullYear();
    const { data: lastInv } = await supabase.from('invoices').select('invoice_number')
      .like('invoice_number', `INV-${year}-%`).order('invoice_number', { ascending: false }).limit(1).single();
    let nextNum = 1;
    if (lastInv) nextNum = parseInt(lastInv.invoice_number.split('-')[2]) + 1;
    const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

    await supabase.from('invoices').insert({
      invoice_number: invoiceNumber, order_id: order.id,
      customer_name: customer_name || 'Walk-in Customer', customer_email: '',
      subtotal, total, status: 'Paid'
    });

    // Log warehouse exits
    for (const item of itemsWithDetails) {
      await supabase.from('inventory_log').insert({
        product_id: item.product_id, sku: item.sku, event_type: 'sold',
        quantity_changed: -item.quantity, notes: 'POS sale',
        handler_id: req.user.id, handler_name: req.user.name, warehouse_id: item.warehouse_id
      });
    }

    // Optional delivery
    if (delivery_address) {
      await supabase.from('delivery_orders').insert({
        order_id: order.id, customer_address: delivery_address,
        cod_amount: payment_method === 'cash' ? total : 0
      });
    }

    res.status(201).json({
      success: true, order_id: order.id, invoice_number: invoiceNumber,
      total, subtotal, discount_amount: discount, change: amount_received ? (amount_received - total) : 0,
      items: itemsWithDetails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
