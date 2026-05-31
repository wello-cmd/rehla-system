// AI Assistant Routes — Bonus module
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// POST /api/ai/query — CEO AI query resolver
router.post('/query', authenticate, authorize('ceo', 'admin'), async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query prompt required.' });

  const prompt = query.toLowerCase();

  try {
    let title = 'Assistant Insights';
    let answer = '';
    let dataList = [];

    if (prompt.includes('revenue') || prompt.includes('sales') || prompt.includes('sell')) {
      const { data: orders } = await supabase.from('orders').select('total').eq('payment_status', 'paid');
      const sum = (orders || []).reduce((s, o) => s + Number(o.total), 0);
      title = 'Revenue Dashboard Report';
      answer = `Current total settled revenue: EGP ${sum.toLocaleString()}`;
    }
    else if (prompt.includes('best') || prompt.includes('top') || prompt.includes('popular')) {
      const { data: items } = await supabase.from('order_items').select('sku, name, quantity, price');
      const map = {};
      for (const i of items || []) {
        if (!map[i.sku]) map[i.sku] = { sku: i.sku, name: i.name, qty: 0, rev: 0 };
        map[i.sku].qty += Number(i.quantity);
        map[i.sku].rev += Number(i.quantity) * Number(i.price);
      }
      title = 'Top Products Report';
      dataList = Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
      answer = 'Top selling products by volume:';
    }
    else if (prompt.includes('stock') || prompt.includes('inventory') || prompt.includes('low')) {
      const { data: products } = await supabase.from('products').select('sku, name, stock_quantity').order('stock_quantity').limit(5);
      title = 'Low Stock Alerts';
      dataList = (products || []).map(p => ({ sku: p.sku, name: p.name, qty: p.stock_quantity, status: p.stock_quantity <= 10 ? 'CRITICAL' : 'OK' }));
      answer = 'Current lowest stock levels:';
    }
    else if (prompt.includes('expense') || prompt.includes('cost') || prompt.includes('spent')) {
      const { data: expenses } = await supabase.from('expenses').select('title, category, amount').eq('status', 'approved');
      const sum = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);
      title = 'Expense Breakdown';
      dataList = expenses || [];
      answer = `Total approved expenses: EGP ${sum.toLocaleString()}`;
    }
    else if (prompt.includes('delivery') || prompt.includes('driver') || prompt.includes('fleet')) {
      const { data: deliveries } = await supabase.from('delivery_orders').select('status');
      const counts = {};
      for (const d of deliveries || []) counts[d.status] = (counts[d.status] || 0) + 1;
      title = 'Fleet Status';
      dataList = Object.entries(counts).map(([status, count]) => ({ status, count }));
      answer = 'Current delivery fleet metrics:';
    }
    else if (prompt.includes('profit') || prompt.includes('margin')) {
      const { data: orders } = await supabase.from('orders').select('total').eq('payment_status', 'paid');
      const { data: items } = await supabase.from('order_items').select('quantity, cost_per_unit');
      const { data: expenses } = await supabase.from('expenses').select('amount').eq('status', 'approved');
      const rev = (orders || []).reduce((s, o) => s + Number(o.total), 0);
      const cogs = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.cost_per_unit || 0), 0);
      const exp = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);
      title = 'P&L Summary';
      answer = `Revenue: EGP ${rev.toLocaleString()} | COGS: EGP ${cogs.toLocaleString()} | Expenses: EGP ${exp.toLocaleString()} | Net Profit: EGP ${(rev - cogs - exp).toLocaleString()}`;
    }
    else {
      title = 'Rehla Assistant';
      answer = 'Try asking about: revenue, top products, stock levels, expenses, deliveries, or profit margins.';
    }

    res.json({ title, answer, data: dataList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
