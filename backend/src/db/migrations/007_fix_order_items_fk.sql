-- =============================================
-- Migration 007: Fix order_items → products FK
-- Change from default RESTRICT to SET NULL so
-- products can be deleted/updated without blocking.
-- order_items already store sku/name/price/qty
-- so losing the product_id reference is safe.
-- =============================================

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES products(id)
  ON DELETE SET NULL
  ON UPDATE SET NULL;

NOTIFY pgrst, 'reload schema';
