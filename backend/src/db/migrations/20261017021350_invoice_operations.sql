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
