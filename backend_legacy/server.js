const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'rehla-secret-jwt-key-2026-brutalist';

// Configure CORS to accept requests from all origins (important for file:// browser load)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve frontend assets statically
app.use(express.static(path.join(__dirname, '../frontend')));

// Authentication Middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const db = await getDb();
    // Search user by email or staff ID
    const user = await db.get(
      'SELECT * FROM users WHERE email = ? OR staff_id = ?',
      username, username.toUpperCase()
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, staff_id: user.staff_id, name: user.name, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        staff_id: user.staff_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// --- INVENTORY ENDPOINTS ---

app.get('/api/inventory', async (req, res) => {
  try {
    const db = await getDb();
    const products = await db.all(`
      SELECT p.*, w.name as warehouse_name, w.code as warehouse_code 
      FROM products p
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
    `);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  const { sku, name, description, stock_quantity, price, category, image_url, warehouse_id, brand } = req.body;
  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: 'SKU, name, and price are required.' });
  }

  try {
    const db = await getDb();
    await db.run(
      'INSERT INTO products (sku, name, description, stock_quantity, price, category, image_url, warehouse_id, brand) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sku.toUpperCase(), name, description || '', stock_quantity || 0, price, category || 'Uncategorized', image_url || '', warehouse_id || null, brand || 'REHLA'
    );
    const newProduct = await db.get(`
      SELECT p.*, w.name as warehouse_name, w.code as warehouse_code 
      FROM products p
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.sku = ?
    `, sku.toUpperCase());
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inventory/:id', authenticate, async (req, res) => {
  const { stock_quantity, price, name, description, category, warehouse_id, brand } = req.body;
  try {
    const db = await getDb();
    const product = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const newStock = stock_quantity !== undefined ? stock_quantity : product.stock_quantity;
    const newPrice = price !== undefined ? price : product.price;
    const newName = name !== undefined ? name : product.name;
    const newDesc = description !== undefined ? description : product.description;
    const newCat = category !== undefined ? category : product.category;
    const newWhId = warehouse_id !== undefined ? warehouse_id : product.warehouse_id;
    const newBrand = brand !== undefined ? brand : product.brand;

    await db.run(
      'UPDATE products SET stock_quantity = ?, price = ?, name = ?, description = ?, category = ?, warehouse_id = ?, brand = ? WHERE id = ?',
      newStock, newPrice, newName, newDesc, newCat, newWhId, newBrand, req.params.id
    );

    const updated = await db.get(`
      SELECT p.*, w.name as warehouse_name, w.code as warehouse_code 
      FROM products p
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.id = ?
    `, req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  try {
    const db = await getDb();
    await db.run('DELETE FROM products WHERE id = ?', req.params.id);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WAREHOUSE ENDPOINTS ---

app.get('/api/warehouses', async (req, res) => {
  try {
    const db = await getDb();
    const warehouses = await db.all(`
      SELECT w.*, 
             COUNT(p.id) as sku_count, 
             COALESCE(SUM(p.stock_quantity), 0) as total_stock,
             GROUP_CONCAT(DISTINCT p.brand) as brands
      FROM warehouses w
      LEFT JOIN products p ON p.warehouse_id = w.id
      GROUP BY w.id
    `);

    // Parse brands string into an array
    const formatted = warehouses.map(wh => ({
      ...wh,
      brands: wh.brands ? wh.brands.split(',') : []
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/warehouses', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  const { code, name, location } = req.body;
  if (!code || !name || !location) {
    return res.status(400).json({ error: 'Code, name, and location are required.' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO warehouses (code, name, location) VALUES (?, ?, ?)',
      code.toUpperCase(), name, location
    );
    const newWh = await db.get('SELECT * FROM warehouses WHERE id = ?', result.lastID);
    res.status(201).json({
      ...newWh,
      sku_count: 0,
      total_stock: 0,
      brands: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock Shopify sync: increases random stocks, adds a mock pending order
app.post('/api/inventory/sync-shopify', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    // Simulate Shopify Ingestion:
    // 1. Add 10-20 stock to random items
    const products = await db.all('SELECT id, stock_quantity FROM products');
    for (const p of products) {
      const addedStock = Math.floor(Math.random() * 15) + 5;
      await db.run('UPDATE products SET stock_quantity = ? WHERE id = ?', p.stock_quantity + addedStock, p.id);
    }
    // 2. Insert a new Shopify Order
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
    const orderId = 20000 + randomSuffix;
    const orderTotal = 1650.00;
    
    await db.run(
      `INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      orderId, 'Shopify Customer', '+201011122233', orderTotal, 'paid', 'card'
    );

    await db.run(
      `INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      orderId, 1, 'HW-BLK-L', 'Heavyweight Hoodie - Black', 1, 1200.00
    );
    await db.run(
      `INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      orderId, 3, 'T-WHT-MD', 'Boxy Tee - White', 1, 450.00
    );

    // Create invoice
    const invNum = `INV-${orderId}`;
    await db.run(
      `INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status)
       VALUES (?, ?, ?, ?, DATE('now'), DATE('now', '+14 days'), ?, ?)`,
      invNum, orderId, 'Shopify Customer', 'shopify@gmail.com', orderTotal, 'Paid'
    );

    // Create pending delivery
    await db.run(
      `INSERT INTO deliveries (order_id, customer_address, status, cash_to_collect)
       VALUES (?, ?, ?, ?)`,
      orderId, 'Shopify Integrated Hub Address, Zamalek, Cairo', 'pending', 0
    );

    res.json({ success: true, message: 'Shopify sync complete. Synced 10 items, ingested Order #' + orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POS CHECKOUT ---

app.post('/api/pos/checkout', authenticate, async (req, res) => {
  const { items, payment_method, amount_received, customer_name, customer_phone, delivery_address } = req.body;

  if (!items || items.length === 0 || !payment_method) {
    return res.status(400).json({ error: 'Items list and payment method are required.' });
  }

  try {
    const db = await getDb();
    
    // Calculate total and check/update inventory
    let totalDue = 0;
    const itemsWithDetails = [];

    for (const item of items) {
      const prod = await db.get('SELECT * FROM products WHERE id = ? OR sku = ?', item.id, item.sku);
      if (!prod) {
        return res.status(400).json({ error: `Product not found: ${item.id || item.sku}` });
      }
      if (prod.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}` });
      }
      
      const lineCost = prod.price * item.quantity;
      totalDue += lineCost;
      itemsWithDetails.push({
        product_id: prod.id,
        sku: prod.sku,
        name: prod.name,
        quantity: item.quantity,
        price: prod.price,
        warehouse_id: prod.warehouse_id
      });
    }

    const tax = totalDue * 0.14;
    const finalTotal = totalDue + tax;

    // Deduct stock
    for (const item of itemsWithDetails) {
      await db.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', item.quantity, item.product_id);
    }

    // Insert Order
    const paymentStatus = payment_method === 'cash' ? 'paid' : 'paid'; // assuming completed sales are settled immediately
    const insertOrderResult = await db.run(
      'INSERT INTO orders (customer_name, customer_phone, total_amount, payment_status, payment_method) VALUES (?, ?, ?, ?, ?)',
      customer_name || 'Walk-in Customer', customer_phone || 'N/A', finalTotal, paymentStatus, payment_method
    );
    const orderId = insertOrderResult.lastID;

    // Insert Order Items
    for (const item of itemsWithDetails) {
      await db.run(
        'INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
        orderId, item.product_id, item.sku, item.name, item.quantity, item.price
      );
    }

    // Auto-create Invoice
    const invoiceNum = 'INV-' + (10000 + orderId);
    await db.run(
      `INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status)
       VALUES (?, ?, ?, ?, DATE('now'), DATE('now', '+14 days'), ?, ?)`,
      invoiceNum, orderId, customer_name || 'Walk-in Customer', 'walkin@rehla.com', finalTotal, 'Paid'
    );

    // Auto-create Warehouse exit logs
    for (const item of itemsWithDetails) {
      await db.run(
        'INSERT INTO warehouse_exits (sku, quantity, handler_name, warehouse_id) VALUES (?, ?, ?, ?)',
        item.sku, item.quantity, req.user.name, item.warehouse_id
      );
    }

    // Optional delivery creation
    if (delivery_address) {
      await db.run(
        'INSERT INTO deliveries (order_id, customer_address, status, cash_to_collect) VALUES (?, ?, ?, ?)',
        orderId, delivery_address, 'pending', payment_method === 'cash' ? finalTotal : 0
      );
    }

    res.status(201).json({
      success: true,
      order_id: orderId,
      invoice_number: invoiceNum,
      total: finalTotal,
      tax,
      subtotal: totalDue,
      change: amount_received ? (amount_received - finalTotal) : 0,
      items: itemsWithDetails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WAREHOUSE EXITS ENDPOINTS ---

app.get('/api/warehouse/exits', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const exits = await db.all(`
      SELECT e.*, w.name as warehouse_name, w.code as warehouse_code 
      FROM warehouse_exits e
      LEFT JOIN warehouses w ON e.warehouse_id = w.id
      ORDER BY e.created_at DESC
    `);
    res.json(exits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/warehouse/exits', authenticate, async (req, res) => {
  const { sku, quantity } = req.body;
  if (!sku || !quantity) {
    return res.status(400).json({ error: 'SKU and quantity are required.' });
  }

  try {
    const db = await getDb();
    // Validate SKU
    const product = await db.get('SELECT * FROM products WHERE sku = ?', sku.toUpperCase());
    if (!product) {
      return res.status(400).json({ error: `SKU ${sku} not found.` });
    }
    if (product.stock_quantity < quantity) {
      return res.status(400).json({ error: `Not enough stock. Available: ${product.stock_quantity}` });
    }

    // Deduct stock
    await db.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', quantity, product.id);

    // Insert log
    await db.run(
      'INSERT INTO warehouse_exits (sku, quantity, handler_name, warehouse_id) VALUES (?, ?, ?, ?)',
      sku.toUpperCase(), quantity, req.user.name, product.warehouse_id
    );

    res.status(201).json({ success: true, message: `Deducted ${quantity} of ${sku}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DELIVERIES ENDPOINTS ---

app.get('/api/deliveries', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    let query = `
      SELECT d.*, o.customer_name, o.customer_phone, o.total_amount, o.payment_method, u.name as driver_name 
      FROM deliveries d
      LEFT JOIN orders o ON d.order_id = o.id
      LEFT JOIN users u ON d.driver_id = u.id
      ORDER BY d.created_at DESC
    `;
    let params = [];

    // Drivers can only see their assigned deliveries
    if (req.user.role === 'driver') {
      query = `
        SELECT d.*, o.customer_name, o.customer_phone, o.total_amount, o.payment_method, u.name as driver_name 
        FROM deliveries d
        LEFT JOIN orders o ON d.order_id = o.id
        LEFT JOIN users u ON d.driver_id = u.id
        WHERE d.driver_id = ?
        ORDER BY d.created_at DESC
      `;
      params = [req.user.id];
    }

    const deliveries = await db.all(query, ...params);
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deliveries/assign', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  const { delivery_id, driver_id } = req.body;
  if (!delivery_id || !driver_id) {
    return res.status(400).json({ error: 'delivery_id and driver_id are required.' });
  }

  try {
    const db = await getDb();
    // Validate driver
    const driver = await db.get("SELECT * FROM users WHERE id = ? AND role = 'driver'", driver_id);
    if (!driver) {
      return res.status(400).json({ error: 'Invalid driver.' });
    }

    await db.run(
      "UPDATE deliveries SET driver_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      driver_id, delivery_id
    );

    res.json({ success: true, message: `Assigned delivery to driver ${driver.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/deliveries/:id/status', authenticate, async (req, res) => {
  const { status, notes } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  try {
    const db = await getDb();
    const delivery = await db.get('SELECT * FROM deliveries WHERE id = ?', req.params.id);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found.' });
    }

    // Verify ownership for driver role
    if (req.user.role === 'driver' && delivery.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized. Not your delivery.' });
    }

    await db.run(
      'UPDATE deliveries SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      status, notes || delivery.notes, req.params.id
    );

    // If delivered, update invoice and order status
    if (status === 'delivered') {
      await db.run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", delivery.order_id);
      await db.run("UPDATE invoices SET status = 'Paid' WHERE order_id = ?", delivery.order_id);
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXPENSES ENDPOINTS ---

app.get('/api/expenses', async (req, res) => {
  try {
    const db = await getDb();
    const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC');
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', authenticate, async (req, res) => {
  const { title, category, amount, date } = req.body;
  if (!title || !category || amount === undefined || !date) {
    return res.status(400).json({ error: 'Title, category, amount, and date are required.' });
  }

  try {
    const db = await getDb();
    // Default status: Admin/CEO are pre-approved, others are pending
    const status = (req.user.role === 'admin' || req.user.role === 'ceo') ? 'approved' : 'pending';
    const approved_by = status === 'approved' ? req.user.name : null;

    await db.run(
      'INSERT INTO expenses (title, category, amount, status, date, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
      title, category, amount, status, date, approved_by
    );

    res.status(201).json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id/approve', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  const { approve } = req.body; // boolean
  const status = approve ? 'approved' : 'rejected';

  try {
    const db = await getDb();
    await db.run(
      'UPDATE expenses SET status = ?, approved_by = ? WHERE id = ?',
      status, req.user.name, req.params.id
    );
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- INVOICES ENDPOINTS ---

app.get('/api/invoices', async (req, res) => {
  try {
    const db = await getDb();
    const invoices = await db.all('SELECT * FROM invoices ORDER BY issue_date DESC');
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'Unauthorized role.' });
  }
  const { invoice_number, customer_name, customer_email, issue_date, due_date, total_amount, status } = req.body;

  if (!invoice_number || !customer_name || total_amount === undefined) {
    return res.status(400).json({ error: 'invoice_number, customer_name, and total_amount are required.' });
  }

  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO invoices (invoice_number, customer_name, customer_email, issue_date, due_date, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      invoice_number, customer_name, customer_email || '', issue_date || 'DATE("now")', due_date || 'DATE("now", "+14 days")', total_amount, status || 'Unpaid'
    );
    res.status(201).json({ success: true, invoice_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/invoices/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  try {
    const db = await getDb();
    await db.run('UPDATE invoices SET status = ? WHERE id = ?', status, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ANALYTICS ENDPOINTS ---

app.get('/api/analytics/summary', async (req, res) => {
  try {
    const db = await getDb();

    // In a real system, these aggregates would scan orders/expenses dynamically
    const revenueRow = await db.get("SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'paid'");
    const totalRevenue = revenueRow.total || 0;

    const expenseRow = await db.get("SELECT SUM(amount) as total FROM expenses WHERE status = 'approved'");
    const totalExpenses = expenseRow.total || 0;

    // Gross profit is modeled as 60% of revenue in our system model
    const grossProfit = totalRevenue * 0.6;
    const netProfit = grossProfit - totalExpenses;

    const outstandingRow = await db.get("SELECT SUM(total_amount) as total FROM invoices WHERE status != 'Paid'");
    const outstanding = outstandingRow.total || 0;

    res.json({
      revenue: totalRevenue,
      grossProfit: grossProfit,
      netProfit: netProfit,
      expenses: totalExpenses,
      outstanding: outstanding
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/trends', async (req, res) => {
  try {
    const db = await getDb();

    // 1. Top 5 Products sold (aggregating quantity from order_items)
    const topProducts = await db.all(`
      SELECT sku, name, SUM(quantity) as units_sold, SUM(quantity * price) as revenue
      FROM order_items
      GROUP BY sku
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    // 2. Expense breakdown by category
    const expenseBreakdown = await db.all(`
      SELECT category, SUM(amount) as total
      FROM expenses
      WHERE status = 'approved'
      GROUP BY category
    `);

    // 3. Recent orders
    const recentOrders = await db.all(`
      SELECT id, customer_name, total_amount, payment_status, payment_method, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      topProducts,
      expenseBreakdown,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CEO AI ASSISTANT QUERY RESOLVER ---

app.post('/api/ai/query', authenticate, async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query prompt required.' });
  }

  const prompt = query.toLowerCase();
  const db = await getDb();

  try {
    let title = "Assistant Insights";
    let htmlAnswer = "";
    let dataList = [];

    if (prompt.includes("revenue") || prompt.includes("sales") || prompt.includes("sell")) {
      const result = await db.get("SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'paid'");
      const sum = result.total || 0;
      title = "Revenue Dashboard Report";
      htmlAnswer = `<p>Our current settled cash flow is **EGP ${sum.toLocaleString()}**. This aggregates Shopify checkouts and completed physical dispatches.</p>`;
    } 
    else if (prompt.includes("best") || prompt.includes("top") || prompt.includes("popular")) {
      const topItems = await db.all(`
        SELECT sku, name, SUM(quantity) as qty, SUM(quantity * price) as rev 
        FROM order_items 
        GROUP BY sku 
        ORDER BY qty DESC 
        LIMIT 3
      `);
      title = "Volume Leaders Report (7 Days)";
      htmlAnswer = `<p>Here are the best sellers based on order logs:</p>`;
      dataList = topItems.map(item => ({
        label: item.sku,
        name: item.name,
        qty: item.qty,
        revenue: `EGP ${item.rev.toLocaleString()}`
      }));
    }
    else if (prompt.includes("stock") || prompt.includes("inventory") || prompt.includes("low")) {
      const lowStock = await db.all("SELECT sku, name, stock_quantity FROM products ORDER BY stock_quantity ASC LIMIT 5");
      title = "Low Stock Alerts";
      htmlAnswer = `<p>The current stock counts in Zamalek Warehouse are:</p>`;
      dataList = lowStock.map(p => ({
        label: p.sku,
        name: p.name,
        qty: p.stock_quantity,
        revenue: p.stock_quantity <= 15 ? 'CRITICAL_REPLENISH' : 'ADEQUATE'
      }));
    }
    else if (prompt.includes("expense") || prompt.includes("cost") || prompt.includes("spent")) {
      const approvedExp = await db.all("SELECT title, category, amount FROM expenses WHERE status = 'approved'");
      const sumResult = await db.get("SELECT SUM(amount) as total FROM expenses WHERE status = 'approved'");
      const sum = sumResult.total || 0;
      title = "Operational Cost Breakdown";
      htmlAnswer = `<p>Total approved expenditure stands at **EGP ${sum.toLocaleString()}**.</p>`;
      dataList = approvedExp.map(e => ({
        label: e.category,
        name: e.title,
        qty: '',
        revenue: `EGP ${e.amount.toLocaleString()}`
      }));
    }
    else if (prompt.includes("delivery") || prompt.includes("driver") || prompt.includes("fleet")) {
      const statusCounts = await db.all("SELECT status, COUNT(*) as count FROM deliveries GROUP BY status");
      title = "Active Fleet Dispatch Summary";
      htmlAnswer = `<p>Fleet operation status metrics:</p>`;
      dataList = statusCounts.map(s => ({
        label: 'DELIVERY',
        name: `Status: ${s.status.toUpperCase()}`,
        qty: s.count,
        revenue: 'ACTIVE'
      }));
    }
    else if (prompt.includes("profit") || prompt.includes("margin")) {
      const revResult = await db.get("SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'paid'");
      const rev = revResult.total || 0;
      const expResult = await db.get("SELECT SUM(amount) as total FROM expenses WHERE status = 'approved'");
      const exp = expResult.total || 0;
      const gp = rev * 0.6;
      const np = gp - exp;
      title = "Profit & Loss Executive Summary";
      htmlAnswer = `
        <p>Current Gross Profit (COGS modeled at 40%): **EGP ${gp.toLocaleString()}**</p>
        <p>Operational Costs: **EGP ${exp.toLocaleString()}**</p>
        <p>Net Executive Profit Margin: **EGP ${np.toLocaleString()}**</p>
      `;
    }
    else {
      title = "Rehla Command Guide";
      htmlAnswer = `
        <p>Welcome to Rehla's local intelligence assistant. You can prompt me for live metrics:</p>
        <ul style="list-style-type: square; margin-left: 20px; margin-top: 10px;">
          <li><strong>"What is our revenue?"</strong> (Checks settled orders)</li>
          <li><strong>"What are the best sellers?"</strong> (Aggregates sold quantities)</li>
          <li><strong>"Check inventory levels"</strong> (Warns of low stocks)</li>
          <li><strong>"Show delivery status"</strong> (Counts dispatcher queue)</li>
          <li><strong>"Are we profitable?"</strong> (Computes net margins)</li>
        </ul>
      `;
    }

    res.json({
      title,
      html: htmlAnswer,
      data: dataList
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run DB init and start listening
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`REHLA Backend Server is listening on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("Failed to start database:", err);
});
