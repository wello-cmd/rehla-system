// Financial Routes — FR-FN-01 through FR-FN-13
const express = require('express');
const router = express.Router();
const { supabase, fetchAll } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const { generatePLReportPDF } = require('../services/pdfGenerator');

// GET /api/financial/revenue — Revenue by period (FR-FN-01)
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const { period, start, end } = req.query;
    let dateFilter = {};
    const now = new Date();

    if (period === 'today') {
      dateFilter = { gte: now.toISOString().split('T')[0] };
    } else if (period === 'week') {
      const weekAgo = new Date(now - 7 * 86400000);
      dateFilter = { gte: weekAgo.toISOString().split('T')[0] };
    } else if (period === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { gte: monthAgo.toISOString().split('T')[0] };
    } else if (start && end) {
      dateFilter = { gte: start, lte: end };
    }

    let query = supabase.from('orders').select('total, created_at').eq('payment_status', 'paid');
    if (dateFilter.gte) query = query.gte('created_at', dateFilter.gte);
    if (dateFilter.lte) query = query.lte('created_at', dateFilter.lte);

    const orders = await fetchAll(query);
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

    res.json({
      period: period || 'custom',
      revenue: totalRevenue,
      order_count: orders.length,
      avg_order_value: orders.length > 0 ? totalRevenue / orders.length : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/pl — Profit & Loss (FR-FN-05 through FR-FN-08)
router.get('/pl', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    // Revenue (FR-FN-01, FR-FN-02)
    let ordersQuery = supabase.from('orders').select('id, total').eq('payment_status', 'paid');
    if (start) ordersQuery = ordersQuery.gte('created_at', start);
    if (end) ordersQuery = ordersQuery.lte('created_at', end);
    const orders = await fetchAll(ordersQuery);
    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);

    // COGS from order_items × cost_per_unit — batched to avoid URL limit (FR-FN-06)
    const orderIds = orders.map(o => o.id);
    let cogs = 0;
    for (let i = 0; i < orderIds.length; i += 500) {
      const { data: items } = await supabase
        .from('order_items').select('quantity, cost_per_unit')
        .in('order_id', orderIds.slice(i, i + 500));
      cogs += (items || []).reduce((s, item) => s + (Number(item.quantity) * Number(item.cost_per_unit || 0)), 0);
    }

    const grossProfit = revenue - cogs;

    let expQuery = supabase.from('expenses').select('amount').eq('status', 'approved');
    if (start) expQuery = expQuery.gte('date', start);
    if (end) expQuery = expQuery.lte('date', end);
    const expenses = await fetchAll(expQuery);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

    // Net Profit (FR-FN-07)
    const netProfit = grossProfit - totalExpenses;

    // Margins (FR-FN-08)
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    res.json({
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      grossMargin,
      netMargin,
      period: start && end ? `${start} to ${end}` : 'All Time'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/pl/trend — Monthly P&L trend (FR-FN-09)
router.get('/pl/trend', authenticate, async (req, res) => {
  try {
    const [orders, expenses] = await Promise.all([
      fetchAll(supabase.from('orders').select('total, created_at').eq('payment_status', 'paid')),
      fetchAll(supabase.from('expenses').select('amount, date').eq('status', 'approved')),
    ]);

    // Group by month
    const months = {};
    for (const o of orders) {
      const month = o.created_at?.substring(0, 7);
      if (!month) continue;
      if (!months[month]) months[month] = { revenue: 0, expenses: 0 };
      months[month].revenue += Number(o.total);
    }
    for (const e of expenses) {
      const month = e.date?.substring(0, 7);
      if (!month) continue;
      if (!months[month]) months[month] = { revenue: 0, expenses: 0 };
      months[month].expenses += Number(e.amount);
    }

    const trend = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        profit: data.revenue - data.expenses
      }));

    res.json(trend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/cashflow — Cash flow chart (FR-FN-10)
router.get('/cashflow', authenticate, async (req, res) => {
  try {
    const [orders, expenses] = await Promise.all([
      fetchAll(supabase.from('orders').select('total, created_at').eq('payment_status', 'paid')),
      fetchAll(supabase.from('expenses').select('amount, date').eq('status', 'approved')),
    ]);

    const months = {};
    for (const o of orders) {
      const month = o.created_at?.substring(0, 7);
      if (!month) continue;
      if (!months[month]) months[month] = { money_in: 0, money_out: 0 };
      months[month].money_in += Number(o.total);
    }
    for (const e of expenses) {
      const month = e.date?.substring(0, 7);
      if (!month) continue;
      if (!months[month]) months[month] = { money_in: 0, money_out: 0 };
      months[month].money_out += Number(e.amount);
    }

    const cashflow = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        money_in: data.money_in,
        money_out: data.money_out,
        net: data.money_in - data.money_out
      }));

    res.json(cashflow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/inventory-value — Inventory valuation (FR-FN-11)
router.get('/inventory-value', authenticate, async (req, res) => {
  try {
    const { data: products } = await supabase.from('products').select('stock_quantity, price, cost_per_unit');

    let totalCostValue = 0;
    let totalRetailValue = 0;
    for (const p of products || []) {
      totalCostValue += Number(p.stock_quantity) * Number(p.cost_per_unit || 0);
      totalRetailValue += Number(p.stock_quantity) * Number(p.price);
    }

    res.json({
      cost_value: totalCostValue,
      retail_value: totalRetailValue,
      potential_profit: totalRetailValue - totalCostValue,
      total_units: (products || []).reduce((s, p) => s + Number(p.stock_quantity), 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/pl/pdf — P&L PDF export (FR-FN-12)
router.get('/pl/pdf', authenticate, async (req, res) => {
  try {
    // Reuse P&L calculation — paginated to bypass PostgREST 1000-row cap
    const [orders, items, expenses] = await Promise.all([
      fetchAll(supabase.from('orders').select('total').eq('payment_status', 'paid')),
      fetchAll(supabase.from('order_items').select('quantity, cost_per_unit')),
      fetchAll(supabase.from('expenses').select('amount').eq('status', 'approved')),
    ]);

    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const cogs = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.cost_per_unit || 0)), 0);
    const grossProfit = revenue - cogs;
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    const pdf = await generatePLReportPDF({
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      period: 'All Time'
    });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="rehla-pl-report.pdf"');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
