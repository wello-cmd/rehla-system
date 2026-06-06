// Customers Routes — aggregate end-customers from orders
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// GET /api/customers — aggregate unique customers from orders
router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, customer_name, customer_phone, customer_email, total, status, payment_status, created_at, order_number, shopify_order_name, discount_amount')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Deduplicate by phone (primary key for Egyptian customers), fallback to email, then name
    const map = {};
    for (const o of orders || []) {
      const phone = (o.customer_phone || '').trim().replace(/\s/g, '');
      const email = (o.customer_email || '').trim().toLowerCase();
      const name  = (o.customer_name  || '').trim();

      // Build a stable key: prefer phone → email → name
      const key = phone && phone !== 'N/A' && phone !== '' ? `phone:${phone}`
                : email && email !== '' ? `email:${email}`
                : `name:${name}`;

      if (!map[key]) {
        map[key] = {
          key,
          name,
          phone: phone && phone !== 'N/A' ? phone : '',
          email,
          order_count: 0,
          total_spent: 0,
          paid_orders: 0,
          first_order_at: o.created_at,
          last_order_at:  o.created_at,
          orders: [],
        };
      }

      const c = map[key];
      // Keep most complete name
      if (name && name.length > c.name.length) c.name = name;
      if (!c.phone && phone && phone !== 'N/A') c.phone = phone;
      if (!c.email && email) c.email = email;

      c.order_count++;
      c.total_spent += Number(o.total || 0);
      if (o.payment_status === 'paid') c.paid_orders++;
      if (o.created_at < c.first_order_at) c.first_order_at = o.created_at;
      if (o.created_at > c.last_order_at)  c.last_order_at  = o.created_at;
      c.orders.push({
        id: o.id,
        order_number: o.order_number || o.shopify_order_name || '—',
        total: o.total,
        status: o.status,
        payment_status: o.payment_status,
        created_at: o.created_at,
        discount_amount: o.discount_amount,
      });
    }

    let customers = Object.values(map).map(c => ({
      ...c,
      avg_order_value: c.order_count > 0 ? (c.total_spent / c.order_count) : 0,
      orders: c.orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
    })).sort((a, b) => b.total_spent - a.total_spent);

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(q)  ||
        c.phone.includes(q)               ||
        c.email.toLowerCase().includes(q)
      );
    }

    res.json({ customers, total: customers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
