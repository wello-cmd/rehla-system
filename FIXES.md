# Rehla fixes — updated 18 October 2026

## Implemented locally

- Removed the root VibeCheck instruction file and its injected truthpack rules in `.claude/CLAUDE.md`.
- Fixed staff landing routes, forbidden-role handling, session refresh races, and logout on permission denial.
- Isolated Supabase sign-in/refresh clients from privileged database access.
- Restricted invoice and delivery APIs, denied unlinked drivers, and required active driver link tokens instead of ordinary driver IDs.
- Replaced POS checkout, stock movement, return restocking, invoice creation, payment recording, and invoice status changes with database transactions. Invalid quantities/payment values are rejected. Checkout and warehouse-exit retries retain their request key.
- Added invoice line records and settlement records to checkout; fixed missing variant schema fields, variant price fallback, repeated cart-line overselling, and invoice-number allocation.
- Kept product stock totals consistent with variant edits and queued stock changes for durable Shopify retries.
- Added service-only database RPC permissions and RLS/grant restrictions for the business tables defined in repository migrations.
- Added durable integration checkpoints and job leases, rejected partial sync results, removed credential-prefix logging, and tightened the Bosta label hostname check.
- Fixed the profit chart and scanner lint errors. Added accessible dialogs/labels, readable secondary text, mobile-menu focus behavior, reduced-motion rules, and an actual API-reachability indicator.
- Split frontend routes into separately loaded bundles. Initial application JavaScript is approximately 245 kB minified, down from 1,372 kB.
- Updated vulnerable packages and added CI checks.

## Verification

- 87 backend tests pass, including SQL execution in a disposable PGlite/PostgreSQL database: rollback after injected failures, duplicate checkout retries, quantity/payment validation, return restocking, parent totals, RPC permissions, role access and sync checkpoints.
- 23 frontend tests pass; lint and production build pass.
- Backend dependency audit and frontend production dependency audit report zero known vulnerabilities at verification time.
- Keyboard dialog behavior was checked in a local mocked browser fixture. Full signed-in production and physical-phone testing was not performed.
- The design detector completed; remaining warnings concern existing decorative card borders/print fonts, not the corrected transaction/access failures.

## Required before deployment

1. Back up the deployed database and rehearse restoration in an isolated environment.
2. Review and apply only these new migrations, in order, to staging first:
   - `backend/src/db/migrations/20261016210021_reliable_operations.sql`
   - `backend/src/db/migrations/20261017021350_invoice_operations.sql`
3. Check existing records for negative stock/prices and invalid quantities before validating the new NOT VALID constraints. The migrations do not rewrite historical records.
4. Confirm the service role retains required privileges and anonymous/authenticated clients cannot read/write the business tables or invoke business RPCs. Inspect any tables/policies added outside the repository separately.
5. Exercise concurrent sales, payments, scans, driver links, full/partial returns and Shopify/Bosta recovery in staging. PGlite verifies SQL behavior but is not a multi-connection production concurrency test.
6. Deploy the matching API and frontend together after database preparation. Missing RPCs return an upgrade-required error instead of performing unsafe fallback writes.

## Remaining limitations

- The `restrict_public_business_access` security migration was applied live and verified on 18 October. The two main business-operation migrations and matching app deployment are still pending staging; no external financial transactions or stock syncs were performed.
- Marking a return refunded records its workflow status; it does not transfer customer funds. Partial returns no longer mark the entire order refunded automatically.
- Historical POS invoices created before these changes may lack payment records; reconcile them before changing status through the stricter payment rules.
- Existing shared driver links do not expire automatically; deactivation or token rotation revokes them.
- Pending application/migration changes now renew integration leases once a minute. A failed renewal prevents checkpoint advancement. These changes still require deployment.
- The first durable sync imports full available history; plan staging verification and initial catch-up time.
- Dashboard panels now fail independently, identify unavailable metrics and offer Retry; refreshes retain the selected period and ignore stale responses. Important table columns remain accessible through horizontal scrolling on phones. Physical-phone verification is still required.

`SYSTEM-REVIEW.md` is the original pre-fix assessment; this file records the implemented changes and their deployment requirements.

## Additional repairs on 18 October

- Closed live anonymous access to all public business tables and prevented client-side staff-role modification. Staff can read only their own profile directly; backend service privileges remain intact.
- Enabled customer/refund RLS with management policies and accountant read access to refunds. Supabase security scan confirms the RLS errors are resolved.
- Applied the security repair after role-level tests against the captured live schema; saved the prior grants/policies in deployment/access-before-20261018.json.
- Restricted additional local finance, analytics, expenses, customer, Shopify and channel APIs. Workers no longer load forbidden delivery summary/analytics or driver-management controls.
- Fixed dashboard partial failures/stale refresh, mobile loss of important columns, and reduced-motion behavior.
- Verified dashboard error recovery and the worker delivery view in an isolated browser preview. The browser's viewport override did not produce a phone-sized CSS viewport, so this is not mobile certification.

### Outstanding external requirements

- The remaining Supabase security warning is leaked-password protection. It needs the Auth dashboard/configuration controls, which this MCP toolset does not expose: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Per user direction, attempted to reconcile BO-1729308, BO-1729309, BO-1729310 and BO-1744387 against Shopify. The Admin API returned 401 Unauthorized; the saved deployment uses the same rejected token. Reconnect Shopify, then compare authoritative variant/location inventory before changing these records. No stock was guessed or changed.
- Main operation migrations/app release need a confirmed staging environment, recoverable backup, and staging concurrency/integration checks. Branch creation remains blocked by Supabase's cost-confirmation requirement; the required cost tools are unavailable in this connection.
