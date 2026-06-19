-- 008_warehouse_exit_order_link.sql
-- Link warehouse-exit (and other) inventory_log rows to the Shopify order they fulfill,
-- so every item that leaves the warehouse is traceable back to an order.

ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
-- Human-readable order reference captured at scan time (e.g. Shopify "#1001").
-- Kept denormalised so the audit trail survives even if the order row is later deleted.
ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS order_number TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_log_order ON inventory_log(order_id);
