// Analytics Routes — FR-AN-01 through FR-AN-08
const express = require('express');
const router = express.Router();
const { supabase, fetchAll } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');

// Group an array of records by a time period key
function groupByPeriod(items, groupBy, dateField = 'created_at') {
  const map = {};
  for (const o of items) {
    const d = new Date(o[dateField]);
    if (isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const m = d.getMonth();
    let key;
    if (groupBy === 'day') {
      key = d.toISOString().substring(0, 10);
    } else if (groupBy === 'week') {
      const jan1 = new Date(y, 0, 1);
      const w = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      key = `${y}-W${String(w).padStart(2, '0')}`;
    } else if (groupBy === 'quarter') {
      key = `${y}-Q${Math.ceil((m + 1) / 3)}`;
    } else if (groupBy === 'half') {
      key = `${y}-${m < 6 ? 'H1' : 'H2'}`;
    } else if (groupBy === 'year') {
      key = String(y);
    } else {
      key = d.toISOString().substring(0, 7); // month default
    }
    if (!map[key]) map[key] = { label: key, revenue: 0, orders: 0 };
    map[key].revenue += Number(o.total || 0) - Number(o.total_refunded || 0);
    map[key].orders++;
  }
  return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
}

function periodKey(dateStr, groupBy) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (groupBy === 'day') return d.toISOString().substring(0, 10);
  if (groupBy === 'week') {
    const jan1 = new Date(y, 0, 1);
    const w = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
  }
  if (groupBy === 'quarter') return `${y}-Q${Math.ceil((m + 1) / 3)}`;
  if (groupBy === 'half') return `${y}-${m < 6 ? 'H1' : 'H2'}`;
  if (groupBy === 'year') return String(y);
  return d.toISOString().substring(0, 7);
}

function endParam(end) {
  return end ? end + 'T23:59:59.999Z' : null;
}

// GET /api/analytics/sales?start&end&groupBy
router.get('/sales', authenticate, async (req, res) => {
  try {
    const { start, end, groupBy = 'month' } = req.query;

    // Fetch ALL orders (including returned) to compute both GMV and net revenue
    let ordersQ = supabase.from('orders').select('id, total, total_refunded, created_at, status, payment_status').neq('status', 'cancelled');
    if (start) ordersQ = ordersQ.gte('created_at', start);
    if (end)   ordersQ = ordersQ.lte('created_at', endParam(end));
    const orders = await fetchAll(ordersQ);

    const activeOrders  = (orders || []).filter(o => o.status !== 'returned');
    const returnedOrders = (orders || []).filter(o => o.status === 'returned');
    const netTotal = o => Number(o.total) - Number(o.total_refunded || 0);

    const totalOrders   = activeOrders.length;
    const totalRevenue  = activeOrders.reduce((s, o) => s + netTotal(o), 0);
    const returnedCount = returnedOrders.length;
    const returnedRevenue = returnedOrders.reduce((s, o) => s + netTotal(o), 0);
    const paidOrders    = activeOrders.filter(o => o.payment_status === 'paid').length;
    const paidRevenue   = activeOrders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + netTotal(o), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Day-of-week heatmap
    const dayMap = { 0:'Sun', 1:'Mon', 2:'Tue', 3:'Wed', 4:'Thu', 5:'Fri', 6:'Sat' };
    const heatmap = Array(7).fill(null).map((_, i) => ({ day: dayMap[i], revenue: 0, orders: 0 }));
    for (const o of activeOrders) {
      const idx = new Date(o.created_at).getDay();
      heatmap[idx].revenue += netTotal(o);
      heatmap[idx].orders++;
    }

    // Revenue trend grouped by period (active orders only)
    const trend = groupByPeriod(activeOrders, groupBy);

    // Category revenue — join order_items → products via product_id to avoid SKU mismatch with variants
    let categoryRevenue = [];
    {
      let itemQ = supabase
        .from('order_items')
        .select('quantity, price, products(category)')
        .not('product_id', 'is', null);
      // Scope to the same date range as orders above
      if (start || end) {
        let dateQ = supabase.from('orders').select('id').eq('payment_status', 'paid');
        if (start) dateQ = dateQ.gte('created_at', start);
        if (end)   dateQ = dateQ.lte('created_at', endParam(end));
        const paidOrders = await fetchAll(dateQ);
        const ids = paidOrders.map(o => o.id);
        if (ids.length === 0) { categoryRevenue = []; }
        else {
          // Batch in chunks of 500 to stay within PostgREST limits
          const chunks = [];
          for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
          const allItems = [];
          for (const chunk of chunks) {
            const { data: chunkItems } = await supabase
              .from('order_items').select('quantity, price, products(category)')
              .in('order_id', chunk).not('product_id', 'is', null);
            allItems.push(...(chunkItems || []));
          }
          const revMap = {};
          for (const item of allItems) {
            const cat = item.products?.category || 'Other';
            if (!revMap[cat]) revMap[cat] = { name: cat, revenue: 0, units: 0 };
            revMap[cat].revenue += Number(item.quantity) * Number(item.price);
            revMap[cat].units   += Number(item.quantity);
          }
          categoryRevenue = Object.values(revMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
        }
      } else {
        const allItems = await fetchAll(itemQ);
        const revMap = {};
        for (const item of allItems) {
          const cat = item.products?.category || 'Other';
          if (!revMap[cat]) revMap[cat] = { name: cat, revenue: 0, units: 0 };
          revMap[cat].revenue += Number(item.quantity) * Number(item.price);
          revMap[cat].units   += Number(item.quantity);
        }
        categoryRevenue = Object.values(revMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
      }
    }

    // Hour-of-day distribution (useful for day mode)
    const hourly = Array(24).fill(null).map((_, h) => ({ hour: `${String(h).padStart(2,'0')}:00`, revenue: 0, orders: 0 }));
    for (const o of orders || []) {
      const h = new Date(o.created_at).getHours();
      hourly[h].revenue += Number(o.total);
      hourly[h].orders++;
    }

    res.json({ totalOrders, totalRevenue, avgOrderValue, paidOrders, paidRevenue, returnedCount, returnedRevenue, heatmap, trend, categoryRevenue, hourly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/top-products?start&end
router.get('/top-products', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    // Fetch paid order IDs in the date range, then batch-fetch items in 500-id chunks
    let orderQuery = supabase.from('orders').select('id').eq('payment_status', 'paid');
    if (start) orderQuery = orderQuery.gte('created_at', start);
    if (end)   orderQuery = orderQuery.lte('created_at', endParam(end));
    const paidOrders = await fetchAll(orderQuery);
    const orderIds = paidOrders.map(o => o.id);
    if ((start || end) && orderIds.length === 0) {
      return res.json({ byRevenue: [], byUnits: [] });
    }

    const allItems = [];
    if (orderIds.length === 0) {
      const { data } = await supabase.from('order_items').select('sku, name, quantity, price');
      allItems.push(...(data || []));
    } else {
      for (let i = 0; i < orderIds.length; i += 500) {
        const { data } = await supabase.from('order_items').select('sku, name, quantity, price')
          .in('order_id', orderIds.slice(i, i + 500));
        allItems.push(...(data || []));
      }
    }

    const productMap = {};
    for (const item of allItems) {
      if (!productMap[item.sku]) productMap[item.sku] = { sku: item.sku, name: item.name, units: 0, revenue: 0 };
      productMap[item.sku].units   += Number(item.quantity);
      productMap[item.sku].revenue += Number(item.quantity) * Number(item.price);
    }

    const byRevenue = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const byUnits   = Object.values(productMap).sort((a, b) => b.units   - a.units).slice(0, 10);
    res.json({ byRevenue, byUnits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/products (all-time inventory sell-through)
router.get('/products', authenticate, async (_req, res) => {
  try {
    const [products, itemsById, itemsBySku, variants] = await Promise.all([
      fetchAll(supabase.from('products').select('id, sku, name, stock_quantity, price, category')),
      fetchAll(supabase.from('order_items').select('product_id, quantity').not('product_id', 'is', null)),
      fetchAll(supabase.from('order_items').select('sku, quantity').is('product_id', null)),
      fetchAll(supabase.from('product_variants').select('id, product_id, sku')),
    ]);
    const skuToProductId = Object.fromEntries((variants || []).map(v => [v.sku, v.product_id]));

    const salesMap = {};
    for (const item of itemsById || []) {
      salesMap[item.product_id] = (salesMap[item.product_id] || 0) + Number(item.quantity);
    }
    for (const item of itemsBySku || []) {
      const pid = skuToProductId[item.sku];
      if (pid) salesMap[pid] = (salesMap[pid] || 0) + Number(item.quantity);
    }

    const analytics = (products || []).map(p => {
      const unitsSold  = salesMap[p.id] || 0;
      const totalStock = unitsSold + p.stock_quantity;
      return {
        sku: p.sku, name: p.name, category: p.category,
        units_sold: unitsSold, current_stock: p.stock_quantity,
        sell_through_rate: totalStock > 0 ? ((unitsSold / totalStock) * 100).toFixed(1) : '0.0',
        zero_sales: unitsSold === 0
      };
    });

    const worstPerformers = analytics.filter(a => !a.zero_sales).sort((a, b) => a.units_sold - b.units_sold).slice(0, 10);
    const zeroSales       = analytics.filter(a => a.zero_sales);
    res.json({ products: analytics, worstPerformers, zeroSales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/delivery?start&end
router.get('/delivery', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = supabase.from('delivery_orders').select('status, cod_amount, assigned_at, delivered_at, failed_reason, created_at, drivers(name, zone)');
    if (start) query = query.gte('created_at', start);
    if (end)   query = query.lte('created_at', endParam(end));
    const deliveries = await fetchAll(query);

    const driverStats = {};
    for (const d of deliveries || []) {
      const name = d.drivers?.name || 'Unassigned';
      if (!driverStats[name]) driverStats[name] = { name, zone: d.drivers?.zone || '', total: 0, delivered: 0, failed: 0, totalTimeMs: 0 };
      driverStats[name].total++;
      if (d.status === 'delivered') {
        driverStats[name].delivered++;
        if (d.assigned_at && d.delivered_at)
          driverStats[name].totalTimeMs += new Date(d.delivered_at) - new Date(d.assigned_at);
      }
      if (d.status === 'failed') driverStats[name].failed++;
    }

    const driverAnalytics = Object.values(driverStats).map(d => ({
      ...d,
      success_rate: d.total > 0 ? ((d.delivered / d.total) * 100).toFixed(1) : '0.0',
      avg_delivery_time_hrs: d.delivered > 0 ? ((d.totalTimeMs / d.delivered) / 3600000).toFixed(1) : null
    }));

    const failedReasons = {};
    for (const d of (deliveries || []).filter(d => d.status === 'failed')) {
      const r = d.failed_reason || 'unknown';
      failedReasons[r] = (failedReasons[r] || 0) + 1;
    }

    const statusBreakdown = {};
    for (const d of deliveries || []) {
      statusBreakdown[d.status] = (statusBreakdown[d.status] || 0) + 1;
    }

    res.json({
      driverAnalytics, failedReasons, statusBreakdown,
      total: (deliveries || []).length,
      delivered: (deliveries || []).filter(d => d.status === 'delivered').length,
      failed:    (deliveries || []).filter(d => d.status === 'failed').length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/delivery/cost-comparison?start&end
router.get('/delivery/cost-comparison', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = supabase.from('delivery_orders').select('delivery_type, status, cod_amount');
    if (start) query = query.gte('created_at', start);
    if (end)   query = query.lte('created_at', endParam(end));
    const deliveries = await fetchAll(query);

    const own   = deliveries.filter(d => d.delivery_type === 'own_driver');
    const bosta = deliveries.filter(d => d.delivery_type === 'bosta');

    const summarize = (arr) => ({
      total:     arr.length,
      delivered: arr.filter(d => d.status === 'delivered').length,
      failed:    arr.filter(d => d.status === 'failed').length,
      cod_collected: arr.filter(d => d.status === 'delivered').reduce((s, d) => s + Number(d.cod_amount || 0), 0)
    });

    res.json({ own_driver: summarize(own), bosta: summarize(bosta) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/financial-kpis?start&end&groupBy
router.get('/financial-kpis', authenticate, async (req, res) => {
  try {
    const { start, end, groupBy = 'month' } = req.query;

    let ordersQ   = supabase.from('orders').select('total, created_at').eq('payment_status', 'paid');
    let expensesQ = supabase.from('expenses').select('amount, date').eq('status', 'approved');
    if (start) { ordersQ = ordersQ.gte('created_at', start);  expensesQ = expensesQ.gte('date', start); }
    if (end)   { ordersQ = ordersQ.lte('created_at', endParam(end)); expensesQ = expensesQ.lte('date', end); }

    const [orders, expenses] = await Promise.all([fetchAll(ordersQ), fetchAll(expensesQ)]);

    const revenueMap = {};
    for (const o of orders) {
      const k = periodKey(o.created_at, groupBy);
      if (k) revenueMap[k] = (revenueMap[k] || 0) + Number(o.total);
    }

    const expenseMap = {};
    for (const e of expenses) {
      const k = periodKey(e.date, groupBy);
      if (k) expenseMap[k] = (expenseMap[k] || 0) + Number(e.amount);
    }

    const periods = [...new Set([...Object.keys(revenueMap), ...Object.keys(expenseMap)])].sort();
    const kpis = periods.map((period, i) => {
      const rev    = revenueMap[period] || 0;
      const exp    = expenseMap[period] || 0;
      const profit = rev - exp;
      const prevRev = i > 0 ? (revenueMap[periods[i - 1]] || 0) : 0;
      return {
        period, month: period,
        revenue: rev, expenses: exp, profit,
        profit_margin:  rev > 0 ? (((rev - exp) / rev) * 100).toFixed(1) : '0.0',
        expense_ratio:  rev > 0 ? ((exp / rev) * 100).toFixed(1) : '0.0',
        mom_growth:     prevRev > 0 ? (((rev - prevRev) / prevRev) * 100).toFixed(1) : 'N/A'
      };
    });

    res.json(kpis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
