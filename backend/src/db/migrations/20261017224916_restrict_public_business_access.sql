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
