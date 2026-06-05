-- Migration 004: 3PL Fulfillment Schema Updates

-- 1. Add 3PL fee structures to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS fulfillment_fee_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_fee_monthly NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_fee_per_unit NUMERIC(10,2) DEFAULT 0;

-- 2. Link products to clients for Multi-Tenant Warehousing
ALTER TABLE products
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 3. Create an index to quickly filter inventory by client
CREATE INDEX IF NOT EXISTS idx_products_client_id ON products(client_id);
