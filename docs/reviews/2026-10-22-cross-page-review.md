# Rehla cross-page consistency review — 22 October 2026

Scope: source review from UX/accessibility, operations, financial reporting and data-integrity perspectives. No application code, account settings or live records changed in this review. Existing Dispatch Desk design remains the visual authority. Browser walkthroughs with real working accounts remain necessary; the deployment credential problem is a separately documented blocker.

## Priorities

| Priority | Verified issue | Evidence | Recommended repair |
| --- | --- | --- | --- |
| P1 | Analytics can show old data beneath a newly selected period after a failure; responses can arrive out of order | frontend/src/pages/AnalyticsPage.jsx:39–74 | Bind results to applied period; sequence requests; show failed/stale refresh and retry |
| P1 | Failed reads resemble valid zero/empty results | CustomersPage.jsx:26–36,98–119; InventoryPage.jsx:151–168; DeliveryPage.jsx:62–80; WarehouseExitPage.jsx:29–34 | Shared loading/error/empty/stale conventions; keep failures visible rather than converting to zero |
| P1 | Dashboard and Analytics call revenue minus expenses net profit, while P&L also subtracts product costs | DashboardPage.jsx:63–69; backend/src/routes/analytics.js:391–399; financial.js:60–84 | One documented metric contract; disclose incomplete cost data |
| P1 | Refund processing can deduct returns more than once | backend/src/routes/analytics.js:83–112; shopify.js:49–55 | Rehearse full/partial/cross-period refunds; single merchandise-return recognition |
| P1 | Report headline/trend and Finance/P&L disagree on shipping, payment and refund basis | analytics.js:33,90; finance.js:20–30; financial.js:53–58; channels.js:23–25 | Separate net merchandise sales, shipping, gross order value, customer collection and courier remittance |
| P1 | Filtered P&L export reads all-time revenue and costs from a different order cohort | ProfitLossPage.jsx:24–27,51; backend/src/routes/financial.js:200–220 | Statement, chart and PDF consume the same dated report |
| P1 | Deselecting every barcode variant can still print a product label | InventoryPage.jsx:330–349,445–454 | Only explicit product selection prints product barcode; zero selection disables print; consistent copy cap |
| P2 | Accountant sees New Invoice but the destination rejects the role | InvoicesPage.jsx:195–196; App.jsx:125–134 | Align action visibility with route/backend permission rules; do not silently expand roles |
| P2 | Invoice creation loses active navigation and parent wayfinding | Sidebar.jsx:141; DashboardShell.jsx:31–33; InvoiceCreatePage.jsx:262–265 | Nested-route active matching, linked parent, visible cancel/back |
| P2 | Customer expansion/import and invoice field/delete controls lack reliable keyboard/accessible naming | CustomersPage.jsx:160–172,219–231; InvoiceCreatePage.jsx:123–247 | Semantic buttons, associated labels, expanded state and named row actions |
| P2 | Inventory end date excludes most of the selected day; movement period versus current stock scope unclear | backend/src/routes/inventory.js:143–166; InventoryPage.jsx:478–491,527–568 | Cairo-aware next-day exclusive boundary; label movement dates and current snapshots |
| P2 | Cairo dates differ across reports; fixed UTC+2 is wrong during DST | analytics.js:56–66; finance.js:8–10; financial.js:55–56; frontend/src/lib/formatters.js:28–48 | Shared Africa/Cairo day interval and grouping; explicit report timezone |
| P2 | Bosta and Shopify aggregate reads can truncate at database row cap | backend/src/routes/bosta.js:51–57; shopify.js:103–114 | Paginate aggregate inputs and propagate errors |
| P2 | COD collection changes with update path; existing Channels comparisons mix shipping and order populations | deliveries.js:415–420; services/bostaClient.js:198–218; channels.js:16–107 | Separate customer payment from courier remittance; reconcile matching order IDs |
| P2 | Export scope and selection state are ambiguous | InventoryPage.jsx:218–222,512–530; CustomersPage.jsx:186–196; AnalyticsPage.jsx:98–104 | Label full-catalogue exports explicitly; expose pressed/selected state |

Line numbers reflect the reviewed source and will shift during implementation. Findings are code-backed, not a complete visual/accessibility certification.

## Recommended implementation order

### First release: trustworthy workflows within the existing design

- Preserve Dispatch Desk. Standardize page title/actions, one primary action, secondary refresh/export, clear row actions, labels and keyboard states.
- Repair stale-report presentation, errors masquerading as zero, barcode empty selection, invoice action permissions, nested navigation and export scope wording.
- Use reusable request-state/date/permission helpers only where real repetition warrants them. Preserve existing public interfaces and staff permissions.
- Verify error recovery, role-specific navigation, selected-period fidelity, zero selection, keyboard access and narrow-screen operation with meaningful regressions and browser checks.

### Shared reporting foundation

- Agree on metric definitions before changing reported financial values.
- Centralize selected date range, Cairo timezone and consistent half-open date boundaries.
- Generate cards, charts, detail lists and exports from the same report result and scope.
- Disclose data source, period, last successful refresh, refund basis and cost completeness.
- Test unpaid, cancelled, partial/full/cross-period refunds, missing costs, both couriers, row-cap pagination and Cairo DST/date boundaries.

### Page-by-page application

Inventory and warehouse → invoices and expenses → deliveries and Bosta → Shopify, Analytics and P&L → customers and users. Each pass checks viewing, filtering, sorting, actions, saving, loading, errors, empty results, role access and mobile layout. Keep Shopify sales → Bosta fulfillment distinct from independent Rehla delivery; providers are not additive sales channels.

## Decisions needed for financial unification

1. Sales recognition and cancellations: choose the treatment of unpaid/cancelled orders and the date basis for merchandise returns. The current code has conflicting conventions; existing comments are not accounting policy.
2. Collection versus remittance: customer payment to a courier and courier settlement to Rehla must be distinct states. Confirm which existing COD field represents; do not infer remittance from delivered status.
3. Profit cost basis: agree cost completeness and whether historical product costs are transaction snapshots or current catalogue costs. Missing cost must not silently count as zero.

Proposed default: show merchandise net sales separately from cash collected; profit subtracts recorded COGS and approved operating expenses, explicitly provisional where costs are incomplete. No historical backfill or business-record correction is authorized by this proposal alone.

## Approved first pass — implemented 23 October

User approved workflow repairs and separately confirmed that customer payment and courier remittance must both be tracked. Financial formula reconciliation remains deferred.

Implemented:
- Latest Analytics request wins; successful data retains its applied date range. Failed refreshes show an inline error, clearly identified previous report, and Retry; initial failures do not display zero metrics.
- Inventory uses one print plan for payload, preview and actual copies: empty selections are skipped, product barcode requires explicit selection, zero labels disables printing, copies are whole and capped at200 per label. Export says all products; movement dates and current-stock scope are named. Initial errors/stale reads are visible with Retry.
- Invoice creation and New Invoice share the route's existing CEO/admin policy; accountant permission remains unchanged. Nested invoice navigation stays active, parent breadcrumb/back link added, form controls and item-delete buttons named.
- Customers use a semantic expansion button with expanded state and an accessible CSV import button; search and sorting expose their purpose/state. Initial read failure renders unavailable summaries rather than zero/empty.
- Delivery and invoice list reads show recoverable initial/stale errors. Warehouse queue remains visible and refreshable when empty or failed.

Verification: 36 frontend regression tests passed during development, including five Analytics report lifecycle tests, five barcode-selection tests and two navigation/permission tests. Production build and lint passed. Chrome fixture checks verified customer Enter expansion, labeled invoice controls, active invoice navigation, absent accountant New Invoice, explicit customer/delivery/Analytics failure, and warehouse retry/refresh. Fixtures removed before final build. No real business writes or accounting formula changes performed. Fresh final checks and deployment status recorded in release note.

Remaining: selected-period P&L exports, financial/refund/revenue/COGS definitions, Cairo DST-aware date boundaries and backend aggregate pagination are next data work. Separate collection/remittance states are approved product policy, not yet a deployed financial schema or backfill. Comprehensive real-account and physical-phone workflow certification remains outside these bounded fixture checks.
