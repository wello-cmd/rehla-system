> Historical assessment before fixes. See [FIXES.md](FIXES.md) for current implementation and deployment status.

# Rehla system review

Reviewed 16 October 2026 using Impeccable technical-audit guidance, Superpowers workflow guidance, source inspection, production build, lint, and limited browser inspection.

## Recommendation

Prioritize reliable stock and financial records, enforce permissions, and repair role-specific login before adding features. The application already covers inventory, warehouse work, sales, deliveries, returns, customer management, and finance. The next investment should make those existing workflows trustworthy.

This review did not change application code or run production database writes, migrations, sync scripts, or the backend server. Existing local modifications were preserved. Findings describe the current working tree, including those modifications.

## Evidence and limits

- Frontend production build: passed. Main JavaScript bundle: 1,372.18 kB minified / 391.96 kB gzip. Build emitted a large-chunk warning.
- Frontend lint: failed with two errors: missing `Cell` in ProfitLossPage and render-time ref mutation in BarcodeScanner.
- Impeccable detector: completed with nine style warnings, mainly colored card borders. These are low priority; the Arial finding is print-label styling and is not treated as a defect.
- Browser: login loaded with labeled email/password fields and sign-in control. Password visibility control measured 26 × 26 CSS pixels. Screenshot capture failed. Requested narrow viewport did not yield the expected CSS viewport, so mobile rendering is not certified.
- No authenticated browser walkthrough or live database policy inspection was performed. Security exposure depends in part on deployed grants and policies, which must be checked separately.
- No automated regression suite or CI workflow was found in the inspected active frontend/backend. `backend/test_bosta_list.js` is an integration utility, not an application regression suite; legacy flow tests are outside the active application.

## Impeccable audit score

Provisional implementation assessment, not a visual-design or WCAG certification.

| Dimension | Score | Main finding |
|---|---:|---|
| Accessibility | 1/4 | Low contrast, unassociated field labels, missing dialog semantics |
| Performance | 2/4 | All main routes imported eagerly; large initial bundle |
| Responsive design | 2/4 | Useful mobile adaptations exist; small controls and hidden operational information need validation |
| Theming | 2/4 | Shared tokens and light/dark support exist; dim text fails contrast in both themes |
| Implementation integrity | 2/4 | Consistent app structure, but misleading online status and weak failure handling |
| **Total** | **9/20** | **Major improvements needed** |

Implementation-integrity verdict: coherent operational structure, but fails the reliability bar for important business actions. Cosmetic detector warnings do not drive that verdict.

## Prioritized findings

### 1. [P1] Stock and checkout changes need transactions and retry protection

Evidence: `backend/src/routes/pos.js:62` updates stock before inserting the order, then separately creates items, invoice, inventory log, and delivery. Several Supabase results are never checked. Similar separate writes occur in `inventory.js:668` and `returns.js:143`.

Impact: a later failure can leave stock deducted without a completed sale; simultaneous scans/sales can overwrite each other's quantities. Retrying a request can repeat business actions.

Needed: transactional database operations with guarded stock updates, checked errors, idempotency keys, and safe retry behavior. Test concurrent sales, duplicate requests, and failures between writes.

### 2. [P1] Validate quantities and payment rules on the server

Evidence: `backend/src/routes/pos.js:11` checks items/payment presence but does not enforce positive integer quantities. The warehouse exit handler at `inventory.js:608` uses `quantity || 1` and only checks whether stock is less than that value. Product and variant stock columns lack nonnegative checks in the supplied migrations.

Impact: a negative quantity can increase stock during a sale/exit. Invalid discounts, insufficient amounts received, and malformed numeric input are not consistently rejected before records are written. POS always writes `payment_status: 'paid'`.

Needed: explicit request schemas, positive integer quantities, finite money values, discount limits, supported payment methods, payment-state rules, and database constraints.

### 3. [P1] Backend permissions must match the role model

Evidence: `backend/src/routes/invoices.js:157` permits any authenticated user to mark any invoice Paid. `pos.js:8` and `inventory.js:605` also lack role authorization despite narrower frontend route permissions.

Impact: hiding a screen does not prevent a logged-in user from calling its API. A worker or driver can reach operations outside the intended role model.

Needed: a documented permission matrix enforced in each API handler, including object-level access checks, with negative tests for every role.

### 4. [P1] Driver delivery listing fails open

Evidence: `backend/src/routes/deliveries.js:65–71` applies a driver filter only when a linked driver record is found. The listing endpoints require authentication but do not otherwise deny a driver with no mapping.

Impact: a driver account without a matching record can receive the unfiltered delivery list, including customer details.

Needed: deny access or return an empty list when the driver mapping is missing or its lookup fails. Test unlinked drivers explicitly.

### 5. [P1] Verify and version database access policies

Evidence: no `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements were found in the supplied migrations. Backend data access uses a service-role client in `backend/src/db/supabase.js`.

Impact: API authorization is critical because service-role access can bypass RLS. Separately, exposed tables may be directly accessible if client roles have grants and deployed RLS is absent. This review does not establish actual production exposure.

Needed: inspect deployed grants/RLS, version the intended policies and grants, and test anonymous and authenticated direct database access. Supabase recommends RLS on every exposed table and restricting client grants: [official RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 6. [P1] Accountants and dispatchers need valid post-login destinations

Evidence: `frontend/src/pages/LoginPage.jsx:20` always navigates to `/`. `frontend/src/App.jsx:53–57` sends disallowed roles back to `/`, while `/` permits only admin/CEO at line 85. Only workers and drivers have special handling.

Impact: accountants and dispatchers can authenticate successfully and land on a route that repeatedly redirects to itself, preventing access to their work.

Needed: one role-to-home mapping shared by login and route guards, plus a proper forbidden page. Verify login and direct-link access for all six roles.

### 7. [P1] Profit chart has a data-dependent runtime error

Evidence: `frontend/src/pages/ProfitLossPage.jsx:199` renders `Cell` without importing it. Lint confirms `no-undef`.

Impact: nonempty profit-trend data reaches an undefined component and can crash rendering. Successful bundling does not catch this.

Needed: correct the import and verify the chart with positive, negative, and empty trend data. Also resolve BarcodeScanner's lint error at line 10 before making lint a release gate.

### 8. [P1] Invoice numbers need concurrency-safe allocation

Evidence: `backend/src/routes/pos.js:104–109` reads the last invoice number and adds one. `001_initial_schema.sql:291` uses a similar maximum-plus-one database function. Invoice numbers have a unique constraint.

Impact: concurrent requests can choose the same number. POS ignores the invoice-insert error and may still report a successful checkout with a number whose invoice was not created.

Needed: sequence or locked counter allocation inside the sale transaction; propagate every insert failure. Verify parallel checkouts.

### 9. [P1] Improve text contrast and accessible form/dialog behavior

Evidence: `frontend/src/index.css` sets dim text to `#554f51`; contrast against `#161616` is approximately 2.26:1. Light-theme dim text `#9aa3af` against white is approximately 2.55:1. These colors are used for small labels/table headings. `InventoryPage.jsx:692–709` places labels beside inputs without association; its dialog container at line 685 has no dialog role, modal state, or accessible title linkage. Escape handling exists, which is useful, but does not replace dialog semantics or focus management.

Impact: small operational labels are difficult to read; screen-reader users cannot reliably identify fields or the active modal. Applicable criteria include WCAG 1.4.3, 1.3.1, and 4.1.2.

Needed: readable secondary-text tokens, explicit label associations, shared accessible dialog components with focus entry/trapping/restoration, and keyboard/screen-reader verification. Use `$impeccable harden`, then `$impeccable adapt`.

### 10. [P1] Persist integration sync checkpoints

Evidence: `backend/src/services/cronJobs.js:6–18` stores the order checkpoint only in memory and starts at ten minutes ago after restart. Customers use a similar twenty-minute fallback.

Impact: after longer downtime, changes older than the fallback window may be missed by incremental polling unless another reconciliation path catches them. Multiple server instances can run the same jobs.

Needed: durable checkpoints, overlap/deduplication, job leases, retry visibility, and periodic reconciliation. Test recovery after downtime exceeding each fallback window.

### 11. [P1] Add automated business-workflow verification

Evidence: active package scripts have no test command; no active CI workflow was found. Build succeeds despite the missing chart component.

Impact: stock corruption, authorization regressions, and broken role routing can reach a release without being caught.

Needed: targeted tests for checkout/stock concurrency, returns, payments, role permissions, login destinations, and financial charts. Add lint, build, and these tests to CI. Document backup recovery and rehearse restoration in an isolated environment; no claim is made here about existing provider backups.

### 12. [P2] Preserve sessions when access is forbidden

Evidence: `frontend/src/lib/api.js:44–55` refreshes for every 403 and then clears the entire session if access is still denied. Parallel requests also have no shared refresh-in-flight mechanism.

Impact: legitimate role restrictions log users out; several failing requests can start competing refresh attempts.

Needed: distinguish expired authentication from permission denial, share refresh work across requests, and show a recoverable access-denied state. Use `$impeccable harden`.

### 13. [P2] Reduce initial loading cost

Evidence: `frontend/src/App.jsx` eagerly imports all pages; the main production bundle is 1.37 MB minified. BarcodeScanner already uses a separate chunk.

Impact: login and routine warehouse tasks carry code for unrelated charts, finance, and integrations, which costs more on slower connections/devices.

Needed: lazy route loading, feature-level dependency boundaries, and production performance measurements. Use `$impeccable optimize`.

### 14. [P2] Show real operational status and recoverable loading failures

Evidence: `Sidebar.jsx:201` always displays SYSTEM ONLINE. `DashboardPage.jsx:93` loads six resources in one `Promise.all`; one rejection discards all results from that batch and shows only a toast.

Impact: users can be reassured by an online indicator during service failure, while missing/failed metrics can be confused with empty or zero data.

Needed: real connection and last-sync state, partial dashboard results, persistent error messages, per-panel retry, and clear unknown-versus-zero values. Use `$impeccable harden` and `$impeccable clarify`.

## Mobile and product work to validate next

- Preserve delivery address, assigned driver, tracking, invoice due dates, and return reasons in expandable mobile details. Current CSS hides these table columns; availability through alternative views needs an authenticated walkthrough.
- Increase frequently used mobile controls toward 44 × 44 CSS pixels. Shared small/icon buttons are 32 pixels high; the login password control measured 26 × 26. This is a usability target, not a claim that every sub-44-pixel control violates WCAG AA.
- Test POS, scanning, delivery, and returns at real phone widths, 200% zoom, keyboard-only navigation, slow networks, duplicate taps, and interrupted requests.
- Record product/role workflows in PRODUCT.md and existing visual rules in DESIGN.md. Neither exists at the active project root; the legacy design file is not automatically authoritative.
- Validate which language(s), offline behavior, and staff recovery/help flows the business actually needs before expanding scope.

## What to preserve

- Consistent shell and role-filtered navigation groups.
- Shared theme variables, light/dark themes, and visible keyboard-focus styling.
- Login labels, autocomplete, loading feedback, and accessible password-toggle name.
- Mobile inventory cards, scrollable tables, safe-area rules, and dedicated scanner loading.
- Server token verification, reusable role middleware, and rate limiting on authentication/delivery routes.

## Recommended execution order

1. Repair role landing routes and the confirmed lint/runtime errors.
2. Enforce API permissions, deny missing driver mappings, and verify deployed database access.
3. Make checkout, inventory, restocking, and invoice allocation transactional and retry-safe; validate all business input.
4. Add regression tests and CI around those workflows; make integration recovery durable.
5. Run `$impeccable harden` for accessible forms/dialogs and honest error/status feedback.
6. Run `$impeccable adapt` for operational mobile tasks.
7. Run `$impeccable optimize` for route loading and measured performance.
8. Finish with `$impeccable polish`, then rerun `$impeccable audit`.

Findings: 0 verified P0, 11 P1, 3 P2. Potential deployed database exposure could change severity after verification. No P3 cosmetic work is recommended ahead of these items.
