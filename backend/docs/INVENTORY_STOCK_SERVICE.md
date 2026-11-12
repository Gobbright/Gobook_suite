# Central inventory stock service

## Existing stock system, shared calculations

`inventoryStockService.js` reads the existing Product, StockIn, StockOut, Invoice
and OnlineOrder collections. `inventoryStockCalculation.js` is the reusable pure
calculator. Existing posting workflows still maintain Product.stock and variant
stock counters; no second quantity balance collection is introduced.

New InventoryTransfer documents describe transfers, and InventoryReservation
documents describe holds. Transfers create paired movements in the existing
StockOut/StockIn collections, without changing company-wide product or variant
counters. Reservations do not change physical stock. Records retain transaction
references, lifecycle dates, actor IDs and cancellation/release reasons.

Calculations use Completed movements and exclude sources currently marked draft,
cancelled, Pending online order, or unposted transfer. Requested/received sales
returns do not count as restocked. Cancelled source movements remain stored for
audit, but are excluded from the normal report together with their compensation.
Historical reports follow the current cancellation state, not an as-was audit
reconstruction of a document that was subsequently cancelled.

Opening quantity is the net movement before From Date. Period inward/outward
are positive movements during the inclusive selected dates; closing is opening
plus inward minus outward. Physical equals closing; available equals physical
minus active reservations at the report cut-off. Without From Date, all recorded
movements through the cut-off are included. Dates use YYYY-MM-DD and UTC day
boundaries. With no To Date, the cut-off is now, not the end of today.

Matched internal transfers are removed from inward/outward totals whenever both
legs belong to the selected report group. Location reports show the respective
dispatch or receipt. Grouping supports product, location, variant and batch;
quantities are expressed in the configured product base unit. Purchase-unit
conversions must match the product's configured conversion, not a client-supplied
arbitrary multiplier.

## Costing and incomplete history

BusinessSettings.inventoryCostingMethod accepts `selling-price`,
`weighted-average`, or `fifo`. No previous costing-method setting existed, so
`selling-price` preserves the existing Stock Summary valuation default. This is
selling-value stock, not acquisition-cost accounting. Choose weighted-average or
FIFO explicitly for acquisition-cost valuation. Do not change methods mid-period
without reviewing transfers and historical valuations with the accountant.

FIFO uses receipt cost layers; weighted average is a moving average per stock
location/variant/batch. New purchase receipts snapshot the discounted net line
cost per base unit, excluding tax. Transfers retain costs (and FIFO acquisition
dates). New sales returns link to original sale lines and restore issued cost
where that issue history is available. Existing return records without these
links are not silently migrated or assigned invented costs.

Legacy Product.stock not explained by recorded movements is shown as an inferred
opening balance with `UNRECORDED_OPENING_BALANCE`. Where history exists but its
opening location is unknown, the residual stays unassigned rather than being
attributed to a guessed warehouse or variant. Missing location/variant/cost data
produce warnings. Incomplete cost history returns `closingValue: null` for FIFO
or weighted average, with a separately labelled `estimatedClosingValue`.
Reconcile historical data before transferring inferred opening balances.

## APIs

All routes below are under `/api/inventory`, behind existing authentication and
inventory module access. Mutation services additionally require an active owner,
Super Admin, or an actor with edit permission and authorized branch/warehouse
access. Tenant and branch restrictions come from the existing scope helpers.

- `GET /reports/stock`: calculated balances, warnings, cost layers and movement
  references. Filters: `from`/`to` (or `dateFrom`/`dateTo`), `branch`, `warehouse`,
  `productId`, `variantId`, `batch`, `groupBy`, `search`, `category`, `status`.
  Status supports active, inactive, low and out. GroupBy defaults to product.
- `GET /reports/summary`: existing paginated Stock Summary contract and KPIs,
  now derived from the same calculations. Existing stock, stockInQty,
  stockOutQty and stockValue fields remain available.
- `GET /reports/ledger`: existing movement listing, restricted to eligible
  posted movement references; adds calculated stockBalances and warnings. Its
  movement KPIs show gross audit activity, including transfer legs, whereas
  stockBalances show net stock calculations.
- `POST /reservations`: body contains productId, optional variantId/batchNumber,
  branch, warehouse, quantity, optional unit/expiresAt, referenceNo and requestId.
- `POST /reservations/:id/release`: body `{ "reason": "Order cancelled" }`.
- `POST /transfers`: creates a draft. Body contains productId, optional
  variantId/batchNumber, fromBranch/toBranch, fromWarehouse/toWarehouse,
  quantity, optional unit, date, referenceNo and requestId.
- `POST /transfers/:id/workflow`: body `{ "action": "post" }`, or
  `{ "action": "cancel", "reason": "Destination changed" }`.

requestId must be a stable 8-100 character identifier (letters, digits, dots,
dashes, underscores). Repeating an identical request returns its original
document; reusing the key for a different payload returns 409. Draft transfers
have no quantity effect. Posted transfers are not edited; cancellation retains
both original and compensating movements. Backdated transfers and cancellation
after subsequent destination movements are rejected and require reconciliation
or an explicit new return transfer.

Reservations currently require explicit release before the existing billing
workflow issues the held goods. They do not automatically fulfil online orders
or introduce a reservation UI. Existing billing, manual adjustments and online
order issues enforce holds; products using holds/transfers also enforce location
availability. The revision field on Product serializes these operations against
existing product writes; it is not another stock counter. Legacy online orders
still retain their existing product-only selection model.

## Transactions, audit and deployment

Posting and report snapshots reuse inventoryTransaction and Mongoose propagated
sessions. MongoDB must be a replica set or a transaction-capable sharded cluster;
a standalone server is not sufficient. Transfer dispatch, receipt, lifecycle
changes and concurrency guard writes commit together or all roll back.

New movements have source line IDs, unique movement keys, base quantity/unit
snapshots and cost metadata. Retrying an unchanged source posting preserves
movement IDs. A detected incomplete source-line set requires reconciliation.
Existing correction workflows still reverse/repost within their transaction,
but now preserve the old movement snapshots in the existing AuditLog collection.
Manual corrections/deletions also archive their previous movement snapshot.

Before deployment, back up the database and ensure indexes are built if production
disables Mongoose autoIndex. Use the normal reviewed index deployment process or
createIndexes for the affected models; do not use destructive syncIndexes.
New indexes cover movement identity, product/date/status, location/variant/date,
reservation lookup and transfer/reservation request identity. The unique movement
key index is partial, so legacy records without keys remain valid. No automatic
historical rewrite, backfill or reconciliation is run by this feature.

## Automated tests

### Stock Summary dashboard

The product table now supports server-side column sorting via `sortBy` and
`sortDirection` (asc/desc), in addition to existing legacy sort names. Supported
keys are description, sku, brand, category, warehouse, branch, physicalQty,
reservedQty, availableQty, minStockLevel, maxStockLevel, stockValue and stockStatus.
Stable product-ID tie-breaking prevents repeated/skipped equal-valued rows across
pages. Unknown values sort last in either direction. Search also matches variant
barcodes/model codes. `zeroStock=1` independently restricts physical stock to zero.

Overstock means physical quantity exceeds a configured maximum greater than zero;
zero maximum means no maximum is configured. Inactive, out-of-stock and low-stock
conditions take precedence, preserving existing available-stock alert semantics.
Status colors are green (In Stock), orange (Low Stock), red (Out of Stock), purple
(Overstock), and neutral gray (Inactive).

`GET /api/inventory/reports/stock/:productId/details` returns the selected product's
calculated opening/inward/outward/physical/reserved/available stock and valuation,
plus variant/location/batch rows from the same service snapshot. Company and
branch permissions, warehouse/date filters and incomplete-history warnings apply.
Variant-master stock counters are not used to populate these rows. Unassigned
historical quantities stay unassigned rather than being distributed arbitrarily.
Defined variants without eligible posted history have calculated zero rows;
legacy quantities lacking variant references remain in a separate unassigned row.

Both existing table layouts share column visibility, cross-page bulk selection,
filtered Excel/PDF exports, sorting, pagination and an accessible stock-details
drawer (Escape, focus trapping and focus restoration). Exports include all
filtered records, or only selected product IDs, in the current sort order and
visible data columns. Product-name and Details actions open the drawer; Stock
Ledger links preserve product/location/date/variant/batch scope. Missing-dimension
flags distinguish unassigned stock from an all-locations query. No posted stock
movements are modified by table or drawer actions.

`GET /api/inventory/reports/dashboard` reuses the stock service snapshot and
returns six KPIs (`stats`), warehouse quantity/value, category quantity/value,
product stock-status distribution, and the Stock In/Stock Out trend. `data` is
the paginated, distinct product list; KPI and chart totals cover all matches,
not just the page. `filterOptions` contains authorized database-backed choices.

Supported dashboard filters include warehouse, branch, category, brand, search,
dateFrom/dateTo, lifecycle status, and stockStatus (healthy, low, out, inactive,
reserved, zero). Physical stock and valuation are balances at the selected
cut-off. From Date restricts period movements, not the accumulated closing
balance. Low/out classifications use available quantity and active products;
the distribution includes an explicit inactive bucket. Reserved Stock is a
quantity; Total Products counts distinct products, not product-location rows.

Trends use real eligible movement quantities, daily for periods up to 62 days
and monthly for longer histories. Internal transfer pairs are netted only when
both legs are included; warehouse-filtered views show the actual boundary flow.
Draft/cancelled sources and future movements are excluded by the shared service.
Incomplete costs remain null and are displayed as unavailable, never zero.

`movementFrom`, `movementTo`, and `movementDirection` restrict the product list
to products with matching posted activity. `warehouseMissing=1` and
`categoryMissing=1` select actual unassigned records. Sorting supports value-desc,
value-asc, quantity and name. Page and limit apply only to the product list.

Both existing Stock Summary layouts share the charts. KPI, donut sector/legend,
warehouse bar and trend-series clicks navigate to `/products?stockDashboard=1`
with the current filters. This read-only stock drill-down reuses the existing
Stock Summary table; ordinary `/products` still opens unchanged product
management. No UI theme, sidebar or top-navigation changes are required.

Pure calculations:

```powershell
node scripts/runTests.js tests/inventoryStockCalculation.test.js
```

Real database transactions, concurrency, tenant isolation, report integration,
variant/unit/batch transfers, duplicate protection and injected receipt-failure
rollback (use a local test replica set):

```powershell
$env:INVENTORY_TEST_MONGODB_URI='mongodb://localhost:27017'
node scripts/runTests.js tests/inventoryStockService.integration.test.js
```

The integration suite creates a unique `gobook_stock_service_test_*` database
and drops only that guarded database. Without the environment variable it skips
database integration tests. Do not point test settings at production.
