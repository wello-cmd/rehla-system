-- =============================================
-- REHLA MANAGEMENT SYSTEM — PostgreSQL Schema
-- Version 2.0 — Full SRS v1.0 Compliance
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. WAREHOUSES
-- =============================================
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. USER PROFILES (linked to Supabase Auth)
-- =============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'admin', 'dispatcher', 'worker', 'driver', 'accountant')),
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. PRODUCTS (SRS Table: products)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  barcode TEXT UNIQUE,
  price NUMERIC(10,2) NOT NULL,
  cost_per_unit NUMERIC(10,2) DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  image_url TEXT DEFAULT '',
  brand TEXT NOT NULL DEFAULT 'REHLA',
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  shopify_variant_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_shopify ON products(shopify_variant_id);

-- =============================================
-- 4. ORDERS (SRS Table: orders)
-- =============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL,
  shopify_order_id TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT 'N/A',
  customer_email TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'installment', 'bank_transfer')),
  source TEXT DEFAULT 'shopify' CHECK (source IN ('shopify', 'pos', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_shopify ON orders(shopify_order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- =============================================
-- 5. ORDER ITEMS
-- =============================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  cost_per_unit NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- =============================================
-- 6. INVENTORY LOG (SRS Table: inventory_log)
-- =============================================
CREATE TABLE IF NOT EXISTS inventory_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('warehouse_exit', 'sold', 'restock', 'adjustment', 'return')),
  quantity_changed INTEGER NOT NULL,
  previous_quantity INTEGER DEFAULT 0,
  new_quantity INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  handler_id UUID REFERENCES user_profiles(id),
  handler_name TEXT DEFAULT '',
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_log_sku ON inventory_log(sku);
CREATE INDEX idx_inventory_log_type ON inventory_log(event_type);
CREATE INDEX idx_inventory_log_created ON inventory_log(created_at);

-- =============================================
-- 7. SYNC LOG (SRS Table: sync_log)
-- =============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  products_updated INTEGER DEFAULT 0,
  products_skipped INTEGER DEFAULT 0,
  products_created INTEGER DEFAULT 0,
  orders_synced INTEGER DEFAULT 0,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('auto', 'manual', 'webhook')),
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_details TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0
);

-- =============================================
-- 8. DRIVERS (SRS Table: drivers)
-- =============================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  zone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  uuid_link UUID DEFAULT uuid_generate_v4() UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. DELIVERY ORDERS (SRS Table: delivery_orders)
-- =============================================
CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  delivery_type TEXT NOT NULL DEFAULT 'own_driver' CHECK (delivery_type IN ('own_driver', 'bosta')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'out_for_delivery', 'delivered', 'failed')),
  customer_address TEXT NOT NULL DEFAULT '',
  cod_amount NUMERIC(10,2) DEFAULT 0,
  failed_reason TEXT CHECK (failed_reason IS NULL OR failed_reason IN ('not_answered', 'wrong_address', 'refused', 'postponed')),
  tracking_number TEXT,
  bosta_shipment_id TEXT,
  notes TEXT DEFAULT '',
  assigned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_driver ON delivery_orders(driver_id);
CREATE INDEX idx_delivery_orders_bosta ON delivery_orders(bosta_shipment_id);

-- =============================================
-- 10. DELIVERY LOG (SRS Table: delivery_log)
-- =============================================
CREATE TABLE IF NOT EXISTS delivery_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 11. EXPENSES (SRS Table: expenses)
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('Inventory', 'Shipping', 'Marketing', 'Platform', 'Operations', 'Other')),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  date DATE NOT NULL,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_status ON expenses(status);

-- =============================================
-- 12. CLIENTS (SRS Table: clients — B2B registry)
-- =============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  tax_number TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 13. INVOICES (SRS Table: invoices)
-- =============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Paid', 'Overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_due ON invoices(due_date);

-- =============================================
-- 14. INVOICE ITEMS (SRS Table: invoice_items)
-- =============================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- =============================================
-- 15. PAYMENTS (SRS Table: payments)
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Instalment')),
  paid_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- =============================================
-- FUNCTIONS: Auto-flag overdue invoices (FR-IV-06)
-- =============================================
CREATE OR REPLACE FUNCTION flag_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE invoices
  SET status = 'Overdue'
  WHERE due_date < CURRENT_DATE
    AND status NOT IN ('Paid', 'Overdue');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FUNCTION: Generate next invoice number (FR-IV-03)
-- Format: INV-YYYY-XXXX
-- =============================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  year_str TEXT;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 10) AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year_str || '-%';
  
  RETURN 'INV-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
