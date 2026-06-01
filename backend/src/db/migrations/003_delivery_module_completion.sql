-- Complete delivery module fields and statuses.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available';

ALTER TABLE drivers
  DROP CONSTRAINT IF EXISTS drivers_availability_status_check;

ALTER TABLE drivers
  ADD CONSTRAINT drivers_availability_status_check
  CHECK (availability_status IN ('available', 'busy'));

ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE delivery_orders
  DROP CONSTRAINT IF EXISTS delivery_orders_status_check;

ALTER TABLE delivery_orders
  ADD CONSTRAINT delivery_orders_status_check
  CHECK (status IN ('pending', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'returned'));
