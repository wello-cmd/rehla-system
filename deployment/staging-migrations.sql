-- Confirm target and recoverable backup. Security repair is idempotent and must remain last.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- 20261016210021_reliable_operations.sql
-- Apply before deploying the API. Every business operation below runs in one transaction.
-- RPCs deliberately use invoker rights and are callable only by the backend service role.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_name text;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_per_unit numeric(10,2) DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url text DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_shopify_variant ON product_variants(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check CHECK(payment_method IN ('Cash','Card','Bank Transfer','Instalment'));
CREATE TABLE IF NOT EXISTS operation_requests (
  actor_id uuid NOT NULL REFERENCES user_profiles(id), scope text NOT NULL, request_key text NOT NULL,
  payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,scope,request_key)
);
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  job text PRIMARY KEY, last_success_at timestamptz, lease_until timestamptz, lease_token uuid
);
CREATE TABLE IF NOT EXISTS stock_sync_queue (
  variant_id uuid PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, last_error text
);
-- NOT VALID leaves legacy data untouched, but rejects new invalid writes immediately.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_stock_nonnegative') THEN
  ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK(stock_quantity>=0) NOT VALID;
  ALTER TABLE product_variants ADD CONSTRAINT variants_stock_nonnegative CHECK(stock_quantity>=0) NOT VALID;
  ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK(price>=0 AND cost_per_unit>=0) NOT VALID;
  ALTER TABLE product_variants ADD CONSTRAINT variants_price_nonnegative CHECK(price>=0) NOT VALID;
  ALTER TABLE order_items ADD CONSTRAINT order_items_positive CHECK(quantity>0 AND price>=0) NOT VALID;
  ALTER TABLE payments ADD CONSTRAINT payments_positive CHECK(amount>0) NOT VALID;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_invoice_number() RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; yr text := to_char(current_date,'YYYY');
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rehla:invoice-number',0));
 SELECT coalesce(max(substring(invoice_number from '[0-9]+$')::bigint),0)+1 INTO n
 FROM invoices WHERE invoice_number ~ ('^INV-'||yr||'-[0-9]+$');
 RETURN 'INV-'||yr||'-'||lpad(n::text,greatest(4,length(n::text)),'0');
END $$;

CREATE OR REPLACE FUNCTION rehla_stock_move(
 p_variant_id uuid,p_delta integer,p_actor uuid,p_event text,p_notes text DEFAULT '',
 p_order_id uuid DEFAULT NULL,p_request_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v product_variants%rowtype; p products%rowtype; actor user_profiles%rowtype;
 prev integer; output jsonb; prior operation_requests%rowtype; payload jsonb;
BEGIN
 SELECT * INTO actor FROM user_profiles WHERE id=p_actor;
 IF NOT FOUND OR actor.role NOT IN ('admin','ceo','worker','dispatcher') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_delta IS NULL OR p_delta=0 OR p_event NOT IN ('warehouse_exit','sold','restock','return','adjustment')
 OR (p_event IN ('warehouse_exit','sold') AND p_delta>0)
 OR (p_event IN ('restock','return') AND p_delta<0) THEN RAISE EXCEPTION 'Invalid stock quantity or event' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('variant',p_variant_id,'delta',p_delta,'event',p_event,'notes',p_notes,'order',p_order_id);
 IF p_request_key IS NOT NULL THEN
  IF length(p_request_key)>128 OR length(p_request_key)<1 THEN RAISE EXCEPTION 'Invalid request key' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':stock:'||p_request_key,0));
  SELECT * INTO prior FROM operation_requests WHERE actor_id=p_actor AND scope='stock' AND request_key=p_request_key;
  IF FOUND THEN
   IF prior.payload<>payload THEN RAISE EXCEPTION 'Request key reused for different input' USING ERRCODE='22023'; END IF;
   RETURN prior.result;
  END IF;
 END IF;
 SELECT * INTO v FROM product_variants WHERE id=p_variant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found' USING ERRCODE='P0002'; END IF;
 -- Lock parents first: all operations affecting sibling variants serialize consistently.
 SELECT * INTO p FROM products WHERE id=v.product_id FOR UPDATE;
 SELECT * INTO v FROM product_variants WHERE id=p_variant_id FOR UPDATE;
 prev:=v.stock_quantity;
 IF prev::bigint+p_delta<0 OR prev::bigint+p_delta>2147483647 THEN RAISE EXCEPTION 'Insufficient or invalid stock' USING ERRCODE='22023'; END IF;
 UPDATE product_variants SET stock_quantity=stock_quantity+p_delta WHERE id=v.id;
 UPDATE products SET stock_quantity=(SELECT coalesce(sum(stock_quantity),0) FROM product_variants WHERE product_id=p.id) WHERE id=p.id;
 INSERT INTO inventory_log(product_id,sku,event_type,quantity_changed,previous_quantity,new_quantity,notes,handler_id,handler_name,warehouse_id,order_id,order_number)
 VALUES(p.id,v.sku,p_event,p_delta,prev,prev+p_delta,p_notes,p_actor,actor.name,p.warehouse_id,p_order_id,
 (SELECT coalesce(shopify_order_name,'#'||order_number::text) FROM orders WHERE id=p_order_id));
 INSERT INTO stock_sync_queue(variant_id) VALUES(v.id) ON CONFLICT(variant_id) DO UPDATE SET updated_at=clock_timestamp(),attempts=0,last_error=NULL;
 output:=jsonb_build_object('id',p.id,'variant_id',v.id,'name',p.name,'sku',v.sku,'barcode',v.barcode,'previous_stock',prev,'current_stock',prev+p_delta,'low_stock',prev+p_delta<10);
 IF p_request_key IS NOT NULL THEN INSERT INTO operation_requests VALUES(p_actor,'stock',p_request_key,payload,output,now()); END IF;
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION rehla_checkout(p_payload jsonb,p_actor uuid,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor user_profiles%rowtype; prior operation_requests%rowtype; item jsonb; lines jsonb:='[]';
 v product_variants%rowtype; p products%rowtype; line jsonb; qty integer; price numeric;
 subtotal numeric:=0; discount numeric; total numeric; received numeric; method text;
 sale_id uuid; inv_id uuid; inv_number text; output jsonb; product_ids uuid[]:='{}'; variant_ids uuid[]:='{}';
BEGIN
 SELECT * INTO actor FROM user_profiles WHERE id=p_actor;
 IF NOT FOUND OR actor.role NOT IN ('admin','ceo','worker') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Checkout request key required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':checkout:'||p_request_key,0));
 SELECT * INTO prior FROM operation_requests WHERE actor_id=p_actor AND scope='checkout' AND request_key=p_request_key;
 IF FOUND THEN
  IF prior.payload<>p_payload THEN RAISE EXCEPTION 'Request key reused for different input' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Items required (maximum 200)' USING ERRCODE='22023'; END IF;
 method:=p_payload->>'payment_method';
 IF method IS NULL OR method NOT IN ('cash','card','bank_transfer','installment') THEN RAISE EXCEPTION 'Invalid payment method' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  IF coalesce(item->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Quantity must be a positive integer' USING ERRCODE='22023'; END IF;
  qty:=(item->>'quantity')::integer;
  SELECT * INTO v FROM product_variants WHERE
    (item->>'variant_id' IS NOT NULL AND id=(item->>'variant_id')::uuid)
    OR (item->>'variant_id' IS NULL AND sku=upper(item->>'sku'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Product variant not found' USING ERRCODE='P0002'; END IF;
  product_ids:=array_append(product_ids,v.product_id); variant_ids:=array_append(variant_ids,v.id);
 END LOOP;
 PERFORM id FROM products WHERE id=ANY(product_ids) ORDER BY id FOR UPDATE;
 PERFORM id FROM product_variants WHERE id=ANY(variant_ids) ORDER BY id FOR UPDATE;
 -- Re-read authoritative prices and stock under locks, consolidate repeated variants.
 FOR v IN SELECT * FROM product_variants WHERE id=ANY(variant_ids) ORDER BY id LOOP
  SELECT * INTO p FROM products WHERE id=v.product_id;
  SELECT sum((i->>'quantity')::integer) INTO qty FROM jsonb_array_elements(p_payload->'items') i
   WHERE (i->>'variant_id'=v.id::text) OR (i->>'variant_id' IS NULL AND upper(i->>'sku')=v.sku);
  price:=coalesce(v.price,p.price);
  IF price IS NULL OR price<0 THEN RAISE EXCEPTION 'Invalid product price' USING ERRCODE='22023'; END IF;
  IF qty>v.stock_quantity THEN RAISE EXCEPTION 'Insufficient stock for %',v.sku USING ERRCODE='22023'; END IF;
  subtotal:=subtotal+price*qty;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_id',p.id,'variant_id',v.id,'sku',v.sku,'name',p.name,
   'quantity',qty,'price',price,'cost_per_unit',p.cost_per_unit,'prev_stock',v.stock_quantity,'new_stock',v.stock_quantity-qty));
 END LOOP;
 IF coalesce(p_payload->>'discount_amount','0') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid discount' USING ERRCODE='22023'; END IF;
 discount:=coalesce((p_payload->>'discount_amount')::numeric,0);
 IF discount>subtotal THEN RAISE EXCEPTION 'Discount exceeds subtotal' USING ERRCODE='22023'; END IF;
 total:=subtotal-discount;
 IF p_payload->>'amount_received' IS NOT NULL THEN
  IF p_payload->>'amount_received' !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid payment received' USING ERRCODE='22023'; END IF;
  received:=(p_payload->>'amount_received')::numeric;
 END IF;
 IF method='cash' AND (received IS NULL OR received<total) THEN RAISE EXCEPTION 'Amount received is less than total payment' USING ERRCODE='22023'; END IF;
 INSERT INTO orders(customer_name,customer_phone,subtotal,total,discount_amount,discount_reason,payment_status,payment_method,source,items)
 VALUES(coalesce(nullif(p_payload->>'customer_name',''),'Walk-in Customer'),coalesce(nullif(p_payload->>'customer_phone',''),'N/A'),subtotal,total,discount,
 coalesce(p_payload->>'discount_reason',''),CASE WHEN method='installment' THEN 'pending' ELSE 'paid' END,method,'pos',lines) RETURNING id INTO sale_id;
 inv_number:=generate_invoice_number();
 INSERT INTO invoices(invoice_number,order_id,customer_name,subtotal,total,status)
 VALUES(inv_number,sale_id,coalesce(nullif(p_payload->>'customer_name',''),'Walk-in Customer'),subtotal,total,CASE WHEN method='installment' THEN 'Sent' ELSE 'Paid' END) RETURNING id INTO inv_id;
 IF method<>'installment' AND total>0 THEN
  INSERT INTO payments(invoice_id,amount,payment_method)
  VALUES(inv_id,total,CASE WHEN method='cash' THEN 'Cash' WHEN method='card' THEN 'Card' ELSE 'Bank Transfer' END);
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  PERFORM rehla_stock_move((line->>'variant_id')::uuid,-(line->>'quantity')::integer,p_actor,'sold','POS sale',sale_id,NULL);
  INSERT INTO order_items(order_id,product_id,variant_id,sku,name,quantity,price,cost_per_unit)
   VALUES(sale_id,(line->>'product_id')::uuid,(line->>'variant_id')::uuid,line->>'sku',line->>'name',(line->>'quantity')::integer,(line->>'price')::numeric,(line->>'cost_per_unit')::numeric);
  INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,subtotal)
   VALUES(inv_id,line->>'name',(line->>'quantity')::integer,(line->>'price')::numeric,(line->>'price')::numeric*(line->>'quantity')::integer);
 END LOOP;
 IF coalesce(p_payload->>'delivery_address','')<>'' THEN
  INSERT INTO delivery_orders(order_id,customer_address,cod_amount) VALUES(sale_id,p_payload->>'delivery_address',0);
 END IF;
 output:=jsonb_build_object('success',true,'order_id',sale_id,'invoice_number',inv_number,'total',total,'subtotal',subtotal,'discount_amount',discount,
 'change',CASE WHEN method='cash' THEN received-total ELSE 0 END,'payment_status',CASE WHEN method='installment' THEN 'pending' ELSE 'paid' END,'items',lines);
 INSERT INTO operation_requests VALUES(p_actor,'checkout',p_request_key,p_payload,output,now());
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION rehla_restock_return(p_return_id uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE ret returns%rowtype; actor user_profiles%rowtype; item jsonb; v_id uuid; resolved jsonb:='[]';
BEGIN
 SELECT * INTO actor FROM user_profiles WHERE id=p_actor;
 IF NOT FOUND OR actor.role NOT IN ('admin','ceo') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO ret FROM returns WHERE id=p_return_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
 IF ret.restocked THEN RETURN to_jsonb(ret); END IF;
 IF ret.status<>'approved' THEN RAISE EXCEPTION 'Approve the return before restocking' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(ret.items)<>'array' OR jsonb_array_length(ret.items)=0 THEN RAISE EXCEPTION 'Return items required' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(ret.items) LOOP
  IF coalesce(item->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Invalid return quantity' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_id FROM product_variants WHERE
   (item->>'variant_id' IS NOT NULL AND id=(item->>'variant_id')::uuid)
   OR (item->>'variant_id' IS NULL AND (sku=upper(item->>'sku') OR barcode=upper(item->>'sku')));
  IF v_id IS NULL THEN RAISE EXCEPTION 'Could not match return item' USING ERRCODE='P0002'; END IF;
  resolved:=resolved||jsonb_build_array(jsonb_build_object('id',v_id,'qty',(item->>'quantity')::integer));
 END LOOP;
 PERFORM id FROM products WHERE id IN(SELECT product_id FROM product_variants WHERE id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(resolved))) ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(resolved) ORDER BY value->>'id' LOOP
  PERFORM rehla_stock_move((item->>'id')::uuid,(item->>'qty')::integer,p_actor,'return','Return restock',ret.order_id,NULL);
 END LOOP;
 UPDATE returns SET status='restocked',restocked=true,handler_name=actor.name WHERE id=ret.id RETURNING * INTO ret;
 RETURN to_jsonb(ret);
END $$;

CREATE OR REPLACE FUNCTION rehla_set_product_stock(p_product_id uuid,p_quantity integer,p_actor uuid,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE p products%rowtype; actor user_profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM user_profiles WHERE id=p_actor;
 IF NOT FOUND OR actor.role NOT IN ('ceo','admin','worker') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_quantity IS NULL OR p_quantity<0 THEN RAISE EXCEPTION 'Stock must be a nonnegative integer' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id) THEN RAISE EXCEPTION 'Adjust variant stock instead of the product total' USING ERRCODE='22023'; END IF;
 UPDATE products SET stock_quantity=p_quantity WHERE id=p.id;
 INSERT INTO inventory_log(product_id,sku,event_type,quantity_changed,previous_quantity,new_quantity,notes,handler_id,handler_name)
 VALUES(p.id,p.sku,'adjustment',p_quantity-p.stock_quantity,p.stock_quantity,p_quantity,p_notes,p_actor,actor.name);
 RETURN jsonb_build_object('success',true,'previous',p.stock_quantity,'new',p_quantity,'change',p_quantity-p.stock_quantity);
END $$;

CREATE OR REPLACE FUNCTION rehla_refund_return(p_return_id uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE ret returns%rowtype; actor user_profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM user_profiles WHERE id=p_actor;
 IF NOT FOUND OR actor.role NOT IN ('ceo','admin') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO ret FROM returns WHERE id=p_return_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
 IF ret.status='pending' THEN RAISE EXCEPTION 'Approve return before refund' USING ERRCODE='22023'; END IF;
 -- A partial return must never mark the entire order refunded. Record its own state only.
 UPDATE returns SET status='refunded',handler_name=actor.name WHERE id=ret.id RETURNING * INTO ret;
 RETURN to_jsonb(ret);
END $$;

CREATE OR REPLACE FUNCTION rehla_claim_sync(p_job text,p_lease_seconds integer DEFAULT 1800) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE row sync_checkpoints%rowtype; token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO sync_checkpoints(job) VALUES(p_job) ON CONFLICT DO NOTHING;
 SELECT * INTO row FROM sync_checkpoints WHERE job=p_job FOR UPDATE;
 IF row.lease_until>now() THEN RETURN NULL; END IF;
 UPDATE sync_checkpoints SET lease_token=token,lease_until=now()+make_interval(secs=>least(greatest(p_lease_seconds,30),7200)) WHERE job=p_job;
 RETURN jsonb_build_object('token',token,'since',coalesce(row.last_success_at,'1970-01-01'::timestamptz));
END $$;
CREATE OR REPLACE FUNCTION rehla_renew_sync(p_job text,p_token uuid,p_lease_seconds integer DEFAULT 1800) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE sync_checkpoints SET lease_until=now()+make_interval(secs=>least(greatest(p_lease_seconds,30),7200))
 WHERE job=p_job AND lease_token=p_token AND lease_until>now();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION rehla_finish_sync(p_job text,p_token uuid,p_success boolean,p_started_at timestamptz) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE sync_checkpoints SET last_success_at=CASE WHEN p_success THEN p_started_at ELSE last_success_at END,lease_until=NULL,lease_token=NULL
 WHERE job=p_job AND lease_token=p_token AND lease_until>now();
 RETURN FOUND;
END $$;

-- The app uses Express APIs only; browsers never need direct business-table access.
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['warehouses','user_profiles','products','orders','order_items','inventory_log','sync_log','drivers','delivery_orders','delivery_log','expenses','clients','invoices','invoice_items','payments','product_variants','returns','operation_requests','sync_checkpoints','stock_sync_queue','customers','shopify_refunds'] LOOP
  -- Older local installations predate the two integration tables.
  IF t IN ('customers','shopify_refunds') AND to_regclass(format('public.%I',t)) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'rehla_%' OR p.proname IN ('generate_invoice_number','flag_overdue_invoices','run_sql')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION rehla_variant_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
 parent:=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END;
 PERFORM id FROM products WHERE id=parent FOR UPDATE;
 UPDATE products SET stock_quantity=(SELECT coalesce(sum(stock_quantity),0) FROM product_variants WHERE product_id=parent) WHERE id=parent;
 IF TG_OP<>'DELETE' THEN
  INSERT INTO stock_sync_queue(variant_id) VALUES(NEW.id) ON CONFLICT(variant_id) DO UPDATE SET updated_at=clock_timestamp(),attempts=0,last_error=NULL;
 END IF;
 IF TG_OP='UPDATE' AND OLD.product_id<>NEW.product_id THEN
  PERFORM id FROM products WHERE id=OLD.product_id FOR UPDATE;
  UPDATE products SET stock_quantity=(SELECT coalesce(sum(stock_quantity),0) FROM product_variants WHERE product_id=OLD.product_id) WHERE id=OLD.product_id;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS rehla_variant_totals ON product_variants;
CREATE TRIGGER rehla_variant_totals AFTER INSERT OR UPDATE OR DELETE ON product_variants FOR EACH ROW EXECUTE FUNCTION rehla_variant_totals();
REVOKE ALL ON FUNCTION rehla_variant_totals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rehla_variant_totals() TO service_role;

-- 20261017021350_invoice_operations.sql
-- Invoice headers/items and payment/status updates must commit together.
-- These routines run with the caller's privileges and are exposed only to the
-- backend service role; they never grant callers additional table privileges.
CREATE OR REPLACE FUNCTION public.rehla_create_invoice(p_payload jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item jsonb;
  invoice_row invoices%ROWTYPE;
  qty numeric;
  price numeric;
  total_amount numeric := 0;
  line_rows jsonb := '[]'::jsonb;
  line_row invoice_items%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_actor AND role IN ('admin', 'ceo')) THEN
    RAISE EXCEPTION 'Invoice creation role not allowed' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR NULLIF(btrim(p_payload->>'customer_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invoice items must be a nonempty array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'Invoice items must be a nonempty array' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    qty := (item->>'quantity')::numeric;
    price := (item->>'unit_price')::numeric;
    IF qty IS NULL OR qty::text IN ('NaN', 'Infinity', '-Infinity') OR qty <= 0 OR qty <> trunc(qty) OR qty > 2147483647 THEN
      RAISE EXCEPTION 'Invoice quantity must be a positive integer' USING ERRCODE = '22023';
    END IF;
    IF price IS NULL OR price::text IN ('NaN', 'Infinity', '-Infinity') OR price < 0 THEN
      RAISE EXCEPTION 'Invoice unit price must be finite and nonnegative' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(item->>'description'), '') IS NULL THEN
      RAISE EXCEPTION 'Invoice item description is required' USING ERRCODE = '22023';
    END IF;
    total_amount := total_amount + qty * round(price, 2);
  END LOOP;
  IF total_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO invoices(client_id, invoice_number, customer_name, customer_email, issue_date, due_date, subtotal, total, notes, status)
  VALUES (NULLIF(p_payload->>'client_id', '')::uuid, generate_invoice_number(), p_payload->>'customer_name',
    COALESCE(p_payload->>'customer_email', ''), COALESCE(NULLIF(p_payload->>'issue_date', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_payload->>'due_date', '')::date, CURRENT_DATE + 14), total_amount, total_amount,
    COALESCE(p_payload->>'notes', ''), 'Draft') RETURNING * INTO invoice_row;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    qty := (item->>'quantity')::numeric;
    price := round((item->>'unit_price')::numeric, 2);
    INSERT INTO invoice_items(invoice_id, description, quantity, unit_price, subtotal)
    VALUES (invoice_row.id, item->>'description', qty::integer, price, qty * price) RETURNING * INTO line_row;
    line_rows := line_rows || jsonb_build_array(to_jsonb(line_row));
  END LOOP;
  RETURN to_jsonb(invoice_row) || jsonb_build_object('items', line_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.rehla_record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  invoice_row invoices%ROWTYPE;
  payment_row payments%ROWTYPE;
  total_paid numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_actor AND role IN ('admin', 'ceo', 'accountant')) THEN
    RAISE EXCEPTION 'Payment role not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') OR round(p_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be finite and positive' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('Cash', 'Bank Transfer', 'Instalment') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO invoice_row FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO payments(invoice_id, amount, payment_method) VALUES (p_invoice_id, round(p_amount, 2), p_method)
    RETURNING * INTO payment_row;
  SELECT COALESCE(sum(amount), 0) INTO total_paid FROM payments WHERE invoice_id = p_invoice_id;
  IF total_paid >= invoice_row.total THEN
    UPDATE invoices SET status = 'Paid' WHERE id = p_invoice_id;
  END IF;
  RETURN to_jsonb(payment_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.rehla_set_invoice_status(p_invoice_id uuid, p_status text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  invoice_row invoices%ROWTYPE;
  total_paid numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_actor AND role IN ('admin', 'ceo', 'accountant')) THEN
    RAISE EXCEPTION 'Invoice status role not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Draft', 'Sent', 'Paid', 'Overdue') THEN
    RAISE EXCEPTION 'Invalid invoice status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO invoice_row FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;
  IF p_status = 'Paid' THEN
    SELECT COALESCE(sum(amount), 0) INTO total_paid FROM payments WHERE invoice_id = p_invoice_id;
    IF total_paid < invoice_row.total THEN
      RAISE EXCEPTION 'Recorded payments do not cover the invoice balance' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE invoices SET status = p_status WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rehla_create_invoice(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rehla_record_payment(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rehla_set_invoice_status(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehla_create_invoice(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rehla_record_payment(uuid, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rehla_set_invoice_status(uuid, text, uuid) TO service_role;

-- 20261017224916_restrict_public_business_access.sql
-- Security repair compatible with existing server-side service-role access.
-- Public API keys must not read or mutate private business records.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',t.tablename);
 END LOOP;
END $$;
REVOKE ALL ON public.user_profiles FROM authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_user_profiles ON public.user_profiles;
DROP POLICY IF EXISTS authenticated_all_user_profiles ON public.user_profiles;
DROP POLICY IF EXISTS staff_read_own_profile ON public.user_profiles;
CREATE POLICY staff_read_own_profile ON public.user_profiles FOR SELECT TO authenticated
 USING (id=(SELECT auth.uid()));

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['customers','shopify_refunds'] LOOP
  IF to_regclass(format('public.%I',table_name)) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',table_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',table_name);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
  EXECUTE format('DROP POLICY IF EXISTS management_access ON public.%I',table_name);
  EXECUTE format('CREATE POLICY management_access ON public.%I FOR ALL TO authenticated USING
   (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=(SELECT auth.uid()) AND role IN (''ceo'',''admin'')))
   WITH CHECK (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=(SELECT auth.uid()) AND role IN (''ceo'',''admin'')))',table_name);
 END LOOP;
 IF to_regclass('public.shopify_refunds') IS NOT NULL THEN
  EXECUTE 'DROP POLICY IF EXISTS finance_read_refunds ON public.shopify_refunds';
  EXECUTE 'CREATE POLICY finance_read_refunds ON public.shopify_refunds FOR SELECT TO authenticated USING
   (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=(SELECT auth.uid()) AND role=''accountant''))';
 END IF;
END $$;
NOTIFY pgrst,'reload schema';

COMMIT;
