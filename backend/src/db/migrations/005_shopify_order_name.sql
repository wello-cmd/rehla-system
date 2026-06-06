-- =============================================
-- Migration: Add Shopify Order Name to Orders
-- =============================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_order_name TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_shopify_name ON orders(shopify_order_name);

-- Force PostgREST to reload the schema cache so the backend API recognizes the new column instantly.
NOTIFY pgrst, 'reload schema';
