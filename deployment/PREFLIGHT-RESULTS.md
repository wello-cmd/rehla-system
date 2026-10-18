# Connected-project preflight — 18 October 2026

Target: awanfghsobsicljjlxmx. Treated as live: approximately 9,509 orders, 10,434 customers, and no development branches reported.

Read-only inspection confirmed:
- Pending Rehla migrations are not installed.
- Customers and Shopify refund tables have RLS disabled and broad anon/authenticated grants. The updated pending migration now includes these tables; no remote remediation was applied.
- Invalid historical data: 2 products and 4 variants with negative stock or price/cost values. Order-item/payment checks found no invalid rows. No historical values were changed.
- The security advisor also reports leaked-password protection disabled. This is an Auth setting, separate from the SQL migrations.

Local rehearsal:
- Exported schema definitions only to backend/test/fixtures/live-schema.sql; no business records or credentials.
- Replayed that schema into disposable PGlite, applied both pending migrations, then ran 18 transaction/permission tests successfully.
- All 74 backend regression tests also pass.
- This is a schema-compatibility rehearsal, not a live-data restore test or multi-connection concurrency certification.

Remote staging blocker:
- create_branch(name=rehla-migration-rehearsal) returned an error requiring get_cost/confirm_cost and a confirmation_id.
- Those two cost tools are not exposed by this MCP connection. No branch was created or billed by this operation.
- Create/approve a staging branch in the Supabase dashboard, or connect an existing staging project. The connected main database was left unchanged.

Before promotion, verify a recoverable backup, resolve the meaning of negative historical stock/values, and exercise integrations/concurrent requests in staging. Review customer/refund access through Express with the service role before applying the stricter grants.

Security advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

## Follow-up repair — 18 October

Applied restrict_public_business_access to the connected live project. Verified anonymous profile/customer/refund access is denied; authenticated users cannot modify staff profiles; customer/refund RLS is enabled; service-role customer access is retained. The security advisor now reports only disabled leaked-password protection. No stock quantities were changed. The two business-operation migrations remain pending staging.

Shopify inventory verification was attempted using the configured Admin API credentials. Shopify returned HTTP 401; the saved deployment credential matches the rejected token. This blocks source-based stock reconciliation until the integration is reconnected. No credentials were included in logs/reports.

## Release completed — 18 October, 13:05 UTC

The historical pending statuses above are superseded by RELEASE-20261018.md. Production app cb38d73 is live; reliable_operations_and_invoices_release and pin_function_search_paths are applied. Business row counts and service-only RPC permissions verified.
