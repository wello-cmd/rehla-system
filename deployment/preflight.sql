-- Read-only: run on the confirmed staging target before applying the bundle.
SELECT current_database() AS database_name, current_user AS database_role, version();
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;
SELECT 'products_negative_stock_or_price' AS check_name,count(*) AS invalid_count
FROM public.products WHERE stock_quantity<0 OR price<0 OR cost_per_unit<0
UNION ALL SELECT 'variants_negative_stock_or_price',count(*)
FROM public.product_variants WHERE stock_quantity<0 OR price<0
UNION ALL SELECT 'invalid_order_items',count(*)
FROM public.order_items WHERE quantity<=0 OR price<0
UNION ALL SELECT 'invalid_payments',count(*) FROM public.payments WHERE amount<=0;
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
SELECT routine_name,grantee,privilege_type FROM information_schema.routine_privileges
WHERE routine_schema='public' AND (routine_name LIKE 'rehla_%' OR routine_name='run_sql')
ORDER BY routine_name,grantee;
