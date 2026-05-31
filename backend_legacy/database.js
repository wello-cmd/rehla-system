const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

async function getDb() {
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  });
}

async function initDb() {
  const db = await getDb();

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON;');

  // 0. Warehouses Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL
    );
  `);

  // 1. Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('worker', 'driver', 'admin', 'ceo'))
    );
  `);

  // 2. Products Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT,
      warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
      brand TEXT NOT NULL DEFAULT 'REHLA'
    );
  `);

  // Run migrations for existing database tables in case they already exist
  try {
    await db.exec('ALTER TABLE products ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;');
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT 'REHLA';");
  } catch (e) {}
  try {
    await db.exec('ALTER TABLE warehouse_exits ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;');
  } catch (e) {}

  // 3. Orders Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      total_amount REAL NOT NULL,
      payment_status TEXT NOT NULL CHECK(payment_status IN ('paid', 'pending', 'failed')),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'installment')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Order Items Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL
    );
  `);

  // 5. Warehouse Exits Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_exits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      handler_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Deliveries Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      driver_id INTEGER REFERENCES users(id),
      customer_address TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'assigned', 'journey_started', 'out_for_delivery', 'delivered', 'failed')),
      cash_to_collect REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. Expenses Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('COGS', 'Marketing', 'Shipping', 'Ops')),
      amount REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      date TEXT NOT NULL,
      approved_by TEXT
    );
  `);

  // 8. Invoices Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Paid', 'Unpaid', 'Overdue'))
    );
  `);

  // Seed Users if empty
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const commonHash = bcrypt.hashSync('rehla123', salt);

    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'CEO-01', 'Sherif CEO', 'ceo@rehla.com', commonHash, 'ceo'
    );
    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'ADMIN-01', 'Mostafa Admin', 'admin@rehla.com', commonHash, 'admin'
    );
    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'WORKER-01', 'Ahmed Worker', 'worker@rehla.com', commonHash, 'worker'
    );
    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'DRIVER-01', 'Ahmed Hassan', 'driver@rehla.com', commonHash, 'driver'
    );
    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'DRIVER-02', 'Karim Mostafa', 'driver2@rehla.com', commonHash, 'driver'
    );
    await db.run(
      'INSERT INTO users (staff_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      'DRIVER-03', 'Omar Sayed', 'driver3@rehla.com', commonHash, 'driver'
    );
    console.log('Seeded Users successfully.');
  }

  // Seed Warehouses if empty
  const warehouseCount = await db.get('SELECT COUNT(*) as count FROM warehouses');
  if (warehouseCount.count === 0) {
    await db.run(
      'INSERT INTO warehouses (code, name, location) VALUES (?, ?, ?)',
      'WH-ZMLK', 'Zamalek Hub', '12 Zamalek Rd, Cairo'
    );
    await db.run(
      'INSERT INTO warehouses (code, name, location) VALUES (?, ?, ?)',
      'WH-MADI', 'Maadi Warehouse', 'Degla, Maadi, Cairo'
    );
    await db.run(
      'INSERT INTO warehouses (code, name, location) VALUES (?, ?, ?)',
      'WH-OCT', '6th of October Center', 'Industrial Area, 6th of October'
    );
    console.log('Seeded Warehouses successfully.');
  }

  // Seed Products if empty
  const productCount = await db.get('SELECT COUNT(*) as count FROM products');
  if (productCount.count === 0) {
    const defaultImg = 'https://lh3.googleusercontent.com/aida-public/AB6AXuC3BY6sWRYg3PRW8HXN-ziRIzhK8BjA9dFmYXmeOQqSK2n9ioG3CGGQM-6rD0VouqSgQX867MXLzSRIutumFUKot_TAFWOAZokq227gsWs4rB7LfaLUUieGFb-lQViwFyIUR7DLxIpjYb6iJytyorWmpteZ-WgKFotlZl4E2meJ4AmKL1HA7ax4ySpIlD8631W8hDMJ8q2v_yqcSeYHGIKUhIQrWpz-MhdAU9lkdz93ouXV5IJiJ8otzWZv1Zd6Dbze4g8lUABfInw';

    const whZmlk = await db.get("SELECT id FROM warehouses WHERE code = 'WH-ZMLK'");
    const whMadi = await db.get("SELECT id FROM warehouses WHERE code = 'WH-MADI'");
    const whOct = await db.get("SELECT id FROM warehouses WHERE code = 'WH-OCT'");

    const productsToSeed = [
      { sku: 'HW-BLK-L', name: 'Heavyweight Hoodie - Black', description: 'Oversized heavy black streetwear hoodie', stock: 45, price: 1200, category: 'Hoodies', img: defaultImg, brand: 'REHLA', warehouse_id: whZmlk.id },
      { sku: 'CG-OLV-32', name: 'Cargo Pants - Olive', description: 'Brutalist style multi-pocket olive cargo pants', stock: 32, price: 650, category: 'Pants', img: defaultImg, brand: 'UrbanFabric', warehouse_id: whMadi.id },
      { sku: 'T-WHT-MD', name: 'Boxy Tee - White', description: 'Immaculate white premium drop shoulder t-shirt', stock: 80, price: 450, category: 'T-Shirts', img: defaultImg, brand: 'REHLA', warehouse_id: whZmlk.id },
      { sku: 'C-KHA-32', name: 'Cargo Pant - Khaki', description: 'Raw materiality street fit khaki cargos', stock: 25, price: 1300, category: 'Pants', img: defaultImg, brand: 'DesertWorn', warehouse_id: whMadi.id },
      { sku: 'RH-HD-01', name: 'Oversized Hoodie', description: 'Premium heavyweight cotton black hoodie', stock: 42, price: 1200, category: 'Hoodies', img: defaultImg, brand: 'REHLA', warehouse_id: whZmlk.id },
      { sku: 'RH-TS-04', name: 'Heavyweight Tee', description: 'Thick charcoal boxy cut basic tee', stock: 68, price: 500, category: 'T-Shirts', img: defaultImg, brand: 'REHLA', warehouse_id: whZmlk.id },
      { sku: 'RH-CR-12', name: 'Crewneck Sweater', description: 'Minimalist museum off-white crewneck sweater', stock: 15, price: 950, category: 'Sweaters', img: defaultImg, brand: 'ZARA', warehouse_id: whOct.id },
      { sku: 'RH-PN-02', name: 'Sweatpants', description: 'Comfy fit ash gray premium sweatpants', stock: 54, price: 750, category: 'Pants', img: defaultImg, brand: 'Nike', warehouse_id: whOct.id },
      { sku: 'CAP-CRM', name: 'Logo Cap', description: 'Embroidered street style cream cap', stock: 90, price: 350, category: 'Accessories', img: defaultImg, brand: 'Adidas', warehouse_id: whOct.id },
      { sku: 'VST-BLK', name: 'Tech Vest', description: 'Tactical industrial black layering vest', stock: 12, price: 850, category: 'Vests', img: defaultImg, brand: 'TechWear', warehouse_id: whMadi.id }
    ];

    for (const p of productsToSeed) {
      await db.run(
        'INSERT INTO products (sku, name, description, stock_quantity, price, category, image_url, brand, warehouse_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p.sku, p.name, p.description, p.stock, p.price, p.category, p.img, p.brand, p.warehouse_id
      );
    }
    console.log('Seeded Products successfully.');
  }

  // Seed Orders, Items, Invoices, Deliveries & Expenses to show dashboard history immediately
  const orderCount = await db.get('SELECT COUNT(*) as count FROM orders');
  if (orderCount.count === 0) {
    // We want a rich set of historical data
    // Let's create orders representing about 450,200 EGP revenue in total (or make a smaller subset, say 10 orders representing real data)
    // Order 1:Omar Khaled
    await db.run(`INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at) 
      VALUES (10492, 'Omar Khaled', '+201234567890', 2109.00, 'paid', 'cash', '2026-05-30 11:32:00')`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10492, 5, 'RH-HD-01', 'Oversized Hoodie', 1, 1200.00)`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10492, 2, 'CG-OLV-32', 'Cargo Pants - Olive', 1, 650.00)`);
    await db.run(`INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status) 
      VALUES ('INV-10492', 10492, 'Omar Khaled', 'omar.khaled@gmail.com', '2026-05-30', '2026-06-13', 2109.00, 'Paid')`);
    await db.run(`INSERT INTO deliveries (order_id, driver_id, customer_address, status, cash_to_collect, notes) 
      VALUES (10492, 4, '14 Maadi Degla, St 231, Apt 4, Cairo', 'delivered', 0, 'Leave with security')`);

    // Order 2: Youssef Ali
    await db.run(`INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at) 
      VALUES (10491, 'Youssef Ali', '+201098765432', 850.00, 'paid', 'card', '2026-05-30 09:15:00')`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10491, 10, 'VST-BLK', 'Tech Vest - Black', 1, 850.00)`);
    await db.run(`INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status) 
      VALUES ('INV-10491', 10491, 'Youssef Ali', 'youssef.ali@yahoo.com', '2026-05-30', '2026-06-13', 850.00, 'Paid')`);
    await db.run(`INSERT INTO deliveries (order_id, driver_id, customer_address, status, cash_to_collect, notes) 
      VALUES (10491, 5, 'Building 12, Road 9, Maadi, Cairo', 'journey_started', 0, 'Call before delivery')`);

    // Order 3: Salma Tarek
    await db.run(`INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at) 
      VALUES (10490, 'Salma Tarek', '+201145678901', 1600.00, 'pending', 'cash', '2026-05-29 18:05:00')`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10490, 9, 'CAP-CRM', 'Logo Cap - Cream', 2, 350.00)`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10490, 8, 'RH-PN-02', 'Sweatpants', 1, 750.00)`);
    await db.run(`INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status) 
      VALUES ('INV-10490', 10490, 'Salma Tarek', 'salma.tarek@gmail.com', '2026-05-29', '2026-06-12', 1600.00, 'Unpaid')`);
    await db.run(`INSERT INTO deliveries (order_id, driver_id, customer_address, status, cash_to_collect, notes) 
      VALUES (10490, null, 'Building 42, St 213, Degla, Maadi, Cairo', 'pending', 1600.00, '')`);

    // Order 4: Karim Hassan
    await db.run(`INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at) 
      VALUES (10489, 'Karim Hassan', '+201209876543', 4200.00, 'failed', 'card', '2026-05-28 14:10:00')`);
    await db.run(`INSERT INTO order_items (order_id, product_id, sku, name, quantity, price) 
      VALUES (10489, 7, 'RH-CR-12', 'Crewneck Sweater', 4, 950.00)`);
    await db.run(`INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status) 
      VALUES ('INV-10489', 10489, 'Karim Hassan', 'karim.hassan@hotmail.com', '2026-05-28', '2026-06-11', 4200.00, 'Unpaid')`);

    // Add more orders to aggregate total revenue to EGP 450,200.00 to match the static UI mockup exactly
    // Order 5-10
    await db.run(`INSERT INTO orders (id, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at) 
      VALUES (10001, 'Anonymous Walk-in', 'N/A', 441441.00, 'paid', 'card', '2026-05-20 12:00:00')`);
    await db.run(`INSERT INTO invoices (invoice_number, order_id, customer_name, customer_email, issue_date, due_date, total_amount, status) 
      VALUES ('INV-10001', 10001, 'Anonymous Walk-in', 'walkin@rehla.com', '2026-05-20', '2026-05-20', 441441.00, 'Paid')`);

    // Expenses Seeding (representing EGP 82,300.00 total)
    // COGS: 52,300, Marketing: 15,000, Shipping: 10,000, Ops: 5,000
    await db.run(`INSERT INTO expenses (title, category, amount, status, date, approved_by) 
      VALUES ('Fabric Ingestion for Hoodies', 'COGS', 52300.00, 'approved', '2026-05-15', 'Sherif CEO')`);
    await db.run(`INSERT INTO expenses (title, category, amount, status, date, approved_by) 
      VALUES ('Instagram Ad Campaign Q2', 'Marketing', 15000.00, 'approved', '2026-05-18', 'Sherif CEO')`);
    await db.run(`INSERT INTO expenses (title, category, amount, status, date, approved_by) 
      VALUES ('Bosta Monthly Delivery Fees', 'Shipping', 10000.00, 'approved', '2026-05-25', 'Mostafa Admin')`);
    await db.run(`INSERT INTO expenses (title, category, amount, status, date, approved_by) 
      VALUES ('Office Internet & Utilities', 'Ops', 5000.00, 'approved', '2026-05-28', 'Mostafa Admin')`);
    await db.run(`INSERT INTO expenses (title, category, amount, status, date, approved_by) 
      VALUES ('Mock Pending Expense', 'Ops', 2500.00, 'pending', '2026-05-30', null)`);

    // Warehouse Exits
    await db.run(`INSERT INTO warehouse_exits (sku, quantity, handler_name, status, created_at) 
      VALUES ('RH-TS-04', 2, 'Ahmed H.', 'completed', '2026-05-30 14:32:00')`);
    await db.run(`INSERT INTO warehouse_exits (sku, quantity, handler_name, status, created_at) 
      VALUES ('RH-CR-12', 1, 'Tarek M.', 'completed', '2026-05-30 13:15:00')`);
    await db.run(`INSERT INTO warehouse_exits (sku, quantity, handler_name, status, created_at) 
      VALUES ('RH-PN-02', 5, 'Ahmed H.', 'completed', '2026-05-30 11:05:00')`);

    console.log('Seeded financial and transaction history.');
  }

  await db.close();
}

module.exports = {
  getDb,
  initDb
};
