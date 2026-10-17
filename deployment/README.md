# Staging migration handoff

Do not apply to an unidentified or unbacked-up database.

1. Confirm the Supabase project is staging and take a recoverable backup.
2. Restore that backup into an isolated environment before changing staging.
3. Run `preflight.sql` with SQL administration access. Review invalid historical rows and schema differences. No customer data needs to be pasted into chat.
4. Run `staging-migrations.sql` as a single SQL script. It wraps the pending operation migrations and reapplies the idempotent access repair last in one transaction with bounded lock/statement timeouts; a failure must roll back the transaction.
5. Re-run the privilege checks. Confirm service-role business operations work and client roles cannot read business tables or call business RPCs.
6. Test the matching application in staging: checkout retries, insufficient stock, parallel sales/scans/payments, role access, driver tokens, returns, and integration recovery.
7. Deploy the matching frontend/API only after staging passes. Keep scheduled external integrations disabled during isolated rehearsals.

Only the access-repair migration has been applied to the live database. The production application and remaining operation migrations are not deployed by this handoff.
