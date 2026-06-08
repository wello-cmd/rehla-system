const express = require('express');
const router = express.Router();
const { supabase, fetchAll } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Helper to filter dates
const applyDateFilter = (query, start, end, dateColumn = 'created_at') => {
  if (start) query = query.gte(dateColumn, start);
  if (end) query = query.lte(dateColumn, end);
  return query;
};

// Part 1: Revenue Tracking
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    // Fetch paid orders
    let queryPaid = supabase.from('orders').select('id, total, created_at').eq('payment_status', 'paid');
    queryPaid = applyDateFilter(queryPaid, start, end);
    const paidOrders = await fetchAll(queryPaid);

    // Fetch refunded orders
    let queryRefunded = supabase.from('orders').select('total, created_at').eq('payment_status', 'refunded');
    queryRefunded = applyDateFilter(queryRefunded, start, end);
    const refundedOrders = await fetchAll(queryRefunded);

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = paidOrders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const totalRefunded = refundedOrders.reduce((sum, o) => sum + Number(o.total), 0);

    // Line chart data (Group by day)
    const revenueByDay = {};
    for (const o of paidOrders) {
      const day = o.created_at.split('T')[0];
      revenueByDay[day] = (revenueByDay[day] || 0) + Number(o.total);
    }
    const chartData = Object.keys(revenueByDay).sort().map(date => ({
      date,
      revenue: revenueByDay[date]
    }));

    // Top 5 Products
    const orderIds = paidOrders.map(o => o.id);
    let topProductsRevenue = [];
    let topProductsQty = [];

    if (orderIds.length > 0) {
      const allItems = [];
      for (let i = 0; i < orderIds.length; i += 500) {
        const { data: chunk } = await supabase.from('order_items')
          .select('name, quantity, price')
          .in('order_id', orderIds.slice(i, i + 500));
        allItems.push(...(chunk || []));
      }

      const productStats = {};
      for (const item of allItems) {
        if (!productStats[item.name]) {
          productStats[item.name] = { name: item.name, revenue: 0, quantity: 0 };
        }
        productStats[item.name].quantity += Number(item.quantity);
        productStats[item.name].revenue += Number(item.quantity) * Number(item.price);
      }

      const productsArr = Object.values(productStats);
      topProductsRevenue = [...productsArr].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      topProductsQty = [...productsArr].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    }

    res.json({
      totalRevenue,
      orderCount,
      avgOrderValue,
      totalRefunded,
      chartData,
      topProductsRevenue,
      topProductsQty
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 2: Expense Management - List & Analytics
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = supabase.from('expenses').select('*').order('date', { ascending: false });
    query = applyDateFilter(query, start, end, 'date');
    const { data: expenses } = await query;

    // Category donut chart
    const categoryTotals = {};
    for (const exp of expenses || []) {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + Number(exp.amount);
    }
    const donutData = Object.keys(categoryTotals).map(cat => ({
      category: cat,
      amount: categoryTotals[cat]
    }));

    // MoM Comparison (All time needed for comparison)
    const { data: allExpenses } = await supabase.from('expenses').select('amount, date').eq('status', 'approved');
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;

    for (const exp of allExpenses || []) {
      const expMonth = exp.date?.substring(0, 7);
      if (expMonth === currentMonth) thisMonthTotal += Number(exp.amount);
      if (expMonth === lastMonth) lastMonthTotal += Number(exp.amount);
    }

    res.json({
      expenses,
      donutData,
      mom: {
        thisMonth: thisMonthTotal,
        lastMonth: lastMonthTotal,
        growth: lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 2: Expense Management - CRUD
router.post('/expenses', authenticate, async (req, res) => {
  const { description, category, amount, date } = req.body;
  if (!description || !category || amount === undefined || !date) {
    return res.status(400).json({ error: 'Description, category, amount, and date are required.' });
  }
  try {
    const status = ['admin', 'ceo'].includes(req.user.role) ? 'approved' : 'pending';
    const approved_by = status === 'approved' ? req.user.name : null;

    // Map description to title for existing DB schema compatibility
    const { data, error } = await supabase
      .from('expenses')
      .insert({ title: description, description, category, amount, status, date, approved_by })
      .select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/expenses/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { description, category, amount, date } = req.body;
  try {
    const { data, error } = await supabase
      .from('expenses')
      .update({ title: description, description, category, amount, date })
      .eq('id', req.params.id)
      .select().single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/expenses/:id', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 3: Profit & Loss
router.get('/pnl', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    let ordersQuery = supabase.from('orders').select('id, total, created_at').eq('payment_status', 'paid');
    ordersQuery = applyDateFilter(ordersQuery, start, end);
    const orders = await fetchAll(ordersQuery);
    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);

    const orderIds = orders.map(o => o.id);
    let cogs = 0;
    if (orderIds.length > 0) {
      for (let i = 0; i < orderIds.length; i += 500) {
        const { data: items } = await supabase.from('order_items')
          .select('quantity, cost_per_unit')
          .in('order_id', orderIds.slice(i, i + 500));
        cogs += (items || []).reduce((s, item) => s + (Number(item.quantity) * Number(item.cost_per_unit || 0)), 0);
      }
    }

    const grossProfit = revenue - cogs;

    let expQuery = supabase.from('expenses').select('amount').eq('status', 'approved');
    expQuery = applyDateFilter(expQuery, start, end, 'date');
    const expenses = await fetchAll(expQuery);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

    const netProfit = grossProfit - totalExpenses;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    // Monthly Trend Data for Chart
    const [allOrders, allExpenses, allItems] = await Promise.all([
      fetchAll(supabase.from('orders').select('id, total, created_at').eq('payment_status', 'paid')),
      fetchAll(supabase.from('expenses').select('amount, date').eq('status', 'approved')),
      fetchAll(supabase.from('order_items').select('quantity, cost_per_unit, order_id')),
    ]);

    const monthlyData = {};
    for (const o of allOrders) {
      const month = o.created_at?.substring(0, 7);
      if (!month) continue;
      if (!monthlyData[month]) monthlyData[month] = { revenue: 0, cogs: 0, expenses: 0 };
      monthlyData[month].revenue += Number(o.total);
    }

    const orderMonthMap = {};
    for (const o of allOrders) orderMonthMap[o.id] = o.created_at?.substring(0, 7);

    for (const item of allItems) {
      const month = orderMonthMap[item.order_id];
      if (month && monthlyData[month]) {
        monthlyData[month].cogs += (Number(item.quantity) * Number(item.cost_per_unit || 0));
      }
    }

    for (const e of allExpenses) {
      const month = e.date?.substring(0, 7);
      if (!month) continue;
      if (!monthlyData[month]) monthlyData[month] = { revenue: 0, cogs: 0, expenses: 0 };
      monthlyData[month].expenses += Number(e.amount);
    }

    const trendChart = Object.keys(monthlyData).sort().map(month => {
      const rev = monthlyData[month].revenue;
      const c = monthlyData[month].cogs;
      const exp = monthlyData[month].expenses;
      return {
        month,
        revenue: rev,
        grossProfit: rev - c,
        expenses: exp,
        netProfit: (rev - c) - exp
      };
    });

    res.json({
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      grossMargin,
      netMargin,
      trendChart
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 4: Inventory Value
router.get('/inventory-value', authenticate, async (req, res) => {
  try {
    const { data: products } = await supabase.from('products').select('stock_quantity, price, cost_per_unit');

    let totalCost = 0;
    let totalRetail = 0;
    for (const p of products || []) {
      totalCost += Number(p.stock_quantity) * Number(p.cost_per_unit || 0);
      totalRetail += Number(p.stock_quantity) * Number(p.price);
    }

    res.json({
      costValue: totalCost,
      retailValue: totalRetail,
      potentialProfit: totalRetail - totalCost
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 5: Cash Flow Summary
router.get('/cashflow', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    let ordersQuery = supabase.from('orders').select('total, created_at').eq('payment_status', 'paid');
    ordersQuery = applyDateFilter(ordersQuery, start, end);
    const [orders, expenses] = await Promise.all([
      fetchAll(ordersQuery),
      fetchAll(applyDateFilter(supabase.from('expenses').select('amount, date').eq('status', 'approved'), start, end, 'date'))
    ]);

    const monthlyData = {};
    for (const o of orders) {
      const month = o.created_at?.substring(0, 7);
      if (!month) continue;
      if (!monthlyData[month]) monthlyData[month] = { moneyIn: 0, moneyOut: 0 };
      monthlyData[month].moneyIn += Number(o.total);
    }
    for (const e of expenses) {
      const month = e.date?.substring(0, 7);
      if (!month) continue;
      if (!monthlyData[month]) monthlyData[month] = { moneyIn: 0, moneyOut: 0 };
      monthlyData[month].moneyOut += Number(e.amount);
    }

    let runningBalance = 0;
    const cashflow = Object.keys(monthlyData).sort().map(month => {
      const moneyIn = monthlyData[month].moneyIn;
      const moneyOut = monthlyData[month].moneyOut;
      const net = moneyIn - moneyOut;
      runningBalance += net;
      
      return {
        month,
        moneyIn,
        moneyOut,
        net,
        runningBalance,
        isNegative: net < 0
      };
    });

    res.json({ cashflow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part 6: 3PL Fulfillment Billing
router.post('/generate-3pl', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { month_start, month_end } = req.body; // YYYY-MM-DD
    if (!month_start || !month_end) return res.status(400).json({ error: 'month_start and month_end are required' });

    const { data: clients } = await supabase.from('clients').select('*');
    if (!clients) return res.json({ success: true, message: 'No clients found', invoices_created: 0 });

    let invoicesCreated = 0;

    // Get the starting invoice number once before the loop to avoid duplicates
    const year = new Date().getFullYear();
    const { data: lastInvRow } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextInvoiceNum = lastInvRow ? parseInt(lastInvRow.invoice_number.split('-')[2]) + 1 : 1;

    for (const client of clients) {
      if (client.fulfillment_fee_percentage <= 0 && client.storage_fee_monthly <= 0 && client.storage_fee_per_unit <= 0) continue;

      const { data: products } = await supabase.from('products').select('id, stock_quantity, price').eq('client_id', client.id);
      if (!products || products.length === 0) continue;

      const productIds = products.map(p => p.id);
      const totalUnitsStored = products.reduce((sum, p) => sum + Number(p.stock_quantity), 0);

      // Find delivered orders in the time period
      const { data: deliveredOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'delivered')
        .gte('created_at', month_start)
        .lte('created_at', month_end + 'T23:59:59Z');

      const orderIds = (deliveredOrders || []).map(o => o.id);
      let commissionTotal = 0;

      if (orderIds.length > 0) {
        const { data: soldItems } = await supabase
          .from('order_items')
          .select('quantity, price')
          .in('order_id', orderIds)
          .in('product_id', productIds);

        const totalSalesValue = (soldItems || []).reduce((sum, i) => sum + (Number(i.quantity) * Number(i.price)), 0);
        commissionTotal = totalSalesValue * (Number(client.fulfillment_fee_percentage) / 100);
      }

      const storageFlat = Number(client.storage_fee_monthly) || 0;
      const storagePerUnit = totalUnitsStored * (Number(client.storage_fee_per_unit) || 0);
      const totalStorage = storageFlat + storagePerUnit;
      const totalInvoiceAmount = totalStorage + commissionTotal;

      if (totalInvoiceAmount > 0) {
        const invoiceNumber = `INV-${year}-${String(nextInvoiceNum++).padStart(4, '0')}`;
        const issueDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data: invoice, error: invErr } = await supabase
          .from('invoices')
          .insert({
            client_id: client.id,
            invoice_number: invoiceNumber,
            customer_name: client.company_name,
            customer_email: client.email || '',
            status: 'Draft',
            issue_date: issueDate,
            due_date: dueDate,
            subtotal: totalInvoiceAmount,
            total: totalInvoiceAmount,
            notes: `3PL Fulfillment Billing: ${month_start} to ${month_end}`
          })
          .select().single();

        if (invErr) throw invErr;

        // Create invoice items — schema column is `subtotal`, not `total`
        const itemsToInsert = [];
        if (commissionTotal > 0) {
          itemsToInsert.push({ invoice_id: invoice.id, description: `Fulfillment Commission (${client.fulfillment_fee_percentage}%)`, quantity: 1, unit_price: commissionTotal, subtotal: commissionTotal });
        }
        if (storageFlat > 0) {
          itemsToInsert.push({ invoice_id: invoice.id, description: `Monthly Storage Fee`, quantity: 1, unit_price: storageFlat, subtotal: storageFlat });
        }
        if (storagePerUnit > 0) {
          itemsToInsert.push({ invoice_id: invoice.id, description: `Per-Unit Storage Fee (${totalUnitsStored} units)`, quantity: totalUnitsStored, unit_price: Number(client.storage_fee_per_unit), subtotal: storagePerUnit });
        }
        if (itemsToInsert.length > 0) {
          await supabase.from('invoice_items').insert(itemsToInsert);
        }

        invoicesCreated++;
      }
    }

    res.json({ success: true, invoices_created: invoicesCreated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
