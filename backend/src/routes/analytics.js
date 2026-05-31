// Analytics Routes — FR-AN-01 through FR-AN-08
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// GET /api/analytics/sales — Sales analytics (FR-AN-01)
router.get('/sales', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = supabase.from('orders').select('total, created_at').eq('payment_status', 'paid');
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);
    const { data: orders } = await query;

    const totalOrders = (orders || []).length;
    const totalRevenue = (orders || []).reduce((s, o) => s + Number(o.total), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Revenue by day of week heatmap
    const dayMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const heatmap = Array(7).fill(null).map((_, i) => ({ day: dayMap[i], revenue: 0, orders: 0 }));
    for (const o of orders || []) {
      const dayIdx = new Date(o.created_at).getDay();
      heatmap[dayIdx].revenue += Number(o.total);
      heatmap[dayIdx].orders++;
    }

    res.json({ totalOrders, totalRevenue, avgOrderValue, heatmap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/top-products — Top 5 products (FR-AN-02)
router.get('/top-products', authenticate, async (req, res) => {
  try {
    const { data: items } = await supabase.from('order_items').select('sku, name, quantity, price');

    const productMap = {};
    for (const item of items || []) {
      if (!productMap[item.sku]) productMap[item.sku] = { sku: item.sku, name: item.name, units: 0, revenue: 0 };
      productMap[item.sku].units += Number(item.quantity);
      productMap[item.sku].revenue += Number(item.quantity) * Number(item.price);
    }

    const byRevenue = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const byUnits = Object.values(productMap).sort((a, b) => b.units - a.units).slice(0, 5);

    res.json({ byRevenue, byUnits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/products — Product analytics (FR-AN-03)
router.get('/products', authenticate, async (req, res) => {
  try {
    const { data: products } = await supabase.from('products').select('id, sku, name, stock_quantity, price');
    const { data: items } = await supabase.from('order_items').select('sku, quantity');

    const salesMap = {};
    for (const item of items || []) {
      salesMap[item.sku] = (salesMap[item.sku] || 0) + Number(item.quantity);
    }

    const analytics = (products || []).map(p => {
      const unitsSold = salesMap[p.sku] || 0;
      const totalStock = unitsSold + p.stock_quantity;
      return {
        sku: p.sku,
        name: p.name,
        units_sold: unitsSold,
        current_stock: p.stock_quantity,
        sell_through_rate: totalStock > 0 ? ((unitsSold / totalStock) * 100).toFixed(1) : '0.0',
        zero_sales: unitsSold === 0
      };
    });

    const worstPerformers = analytics.filter(a => !a.zero_sales).sort((a, b) => a.units_sold - b.units_sold).slice(0, 5);
    const zeroSales = analytics.filter(a => a.zero_sales);

    res.json({ products: analytics, worstPerformers, zeroSales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/delivery — Delivery analytics (FR-AN-04)
router.get('/delivery', authenticate, async (req, res) => {
  try {
    const { data: deliveries } = await supabase
      .from('delivery_orders')
      .select('*, drivers(name, zone)');

    const driverStats = {};
    for (const d of deliveries || []) {
      const driverName = d.drivers?.name || 'Unassigned';
      if (!driverStats[driverName]) {
        driverStats[driverName] = { name: driverName, zone: d.drivers?.zone || '', total: 0, delivered: 0, failed: 0, totalTimeMs: 0 };
      }
      driverStats[driverName].total++;
      if (d.status === 'delivered') {
        driverStats[driverName].delivered++;
        if (d.assigned_at && d.delivered_at) {
          driverStats[driverName].totalTimeMs += new Date(d.delivered_at) - new Date(d.assigned_at);
        }
      }
      if (d.status === 'failed') driverStats[driverName].failed++;
    }

    const driverAnalytics = Object.values(driverStats).map(d => ({
      ...d,
      success_rate: d.total > 0 ? ((d.delivered / d.total) * 100).toFixed(1) : '0.0',
      avg_delivery_time_hrs: d.delivered > 0 ? ((d.totalTimeMs / d.delivered) / 3600000).toFixed(1) : null
    }));

    // Failed reasons breakdown
    const failedReasons = {};
    for (const d of (deliveries || []).filter(d => d.status === 'failed')) {
      const reason = d.failed_reason || 'unknown';
      failedReasons[reason] = (failedReasons[reason] || 0) + 1;
    }

    res.json({ driverAnalytics, failedReasons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/delivery/cost-comparison — Bosta vs own driver (FR-AN-05)
router.get('/delivery/cost-comparison', authenticate, async (req, res) => {
  try {
    const { data: deliveries } = await supabase.from('delivery_orders').select('delivery_type, status');

    const own = (deliveries || []).filter(d => d.delivery_type === 'own_driver');
    const bosta = (deliveries || []).filter(d => d.delivery_type === 'bosta');

    res.json({
      own_driver: { total: own.length, delivered: own.filter(d => d.status === 'delivered').length, failed: own.filter(d => d.status === 'failed').length },
      bosta: { total: bosta.length, delivered: bosta.filter(d => d.status === 'delivered').length, failed: bosta.filter(d => d.status === 'failed').length }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/financial-kpis — Financial KPIs (FR-AN-06)
router.get('/financial-kpis', authenticate, async (req, res) => {
  try {
    const { data: orders } = await supabase.from('orders').select('total, created_at').eq('payment_status', 'paid');
    const { data: expenses } = await supabase.from('expenses').select('amount, date').eq('status', 'approved');

    // Group revenue by month for MoM growth
    const monthlyRevenue = {};
    for (const o of orders || []) {
      const m = o.created_at?.substring(0, 7);
      if (m) monthlyRevenue[m] = (monthlyRevenue[m] || 0) + Number(o.total);
    }
    const monthlyExpenses = {};
    for (const e of expenses || []) {
      const m = e.date?.substring(0, 7);
      if (m) monthlyExpenses[m] = (monthlyExpenses[m] || 0) + Number(e.amount);
    }

    const months = [...new Set([...Object.keys(monthlyRevenue), ...Object.keys(monthlyExpenses)])].sort();
    const kpis = months.map((month, i) => {
      const rev = monthlyRevenue[month] || 0;
      const exp = monthlyExpenses[month] || 0;
      const prevRev = i > 0 ? (monthlyRevenue[months[i-1]] || 0) : 0;
      return {
        month,
        revenue: rev,
        expenses: exp,
        profit_margin: rev > 0 ? (((rev - exp) / rev) * 100).toFixed(1) : '0.0',
        expense_ratio: rev > 0 ? ((exp / rev) * 100).toFixed(1) : '0.0',
        mom_growth: prevRev > 0 ? (((rev - prevRev) / prevRev) * 100).toFixed(1) : 'N/A'
      };
    });

    res.json(kpis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
