-- Track Shopify inventory item IDs separately from variant IDs so inventory webhooks can update the correct product.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT;

CREATE INDEX IF NOT EXISTS idx_products_shopify_inventory_item
  ON products(shopify_inventory_item_id);
