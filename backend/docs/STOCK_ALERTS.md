# Stock Alerts

## Calculations and thresholds

The existing `/api/inventory/alerts` and `/alerts/stats` APIs now read the central
stock calculation service, not Product.stock counters. Only active, tracked
inventory products and eligible posted movements contribute. Draft/cancelled
source handling, units, warehouse/branch isolation and reservations come from
the existing service. Alerts are current-stock reports, not historical reports.

Product.minStockLevel, maxStockLevel and reorderLevel are default thresholds.
Product.warehouseStockLevels stores optional per-warehouse/per-branch overrides
and an enabled flag. Null override values inherit product defaults; explicit 0
does not mean inheritance. Maximum 0 means no upper limit. Product reorder point
0 falls back to the effective minimum; warehouse reorder 0 is an explicit zero
trigger. Disabling product alerts disables all its warehouse alerts. Configured
empty warehouse assignments have calculated zero stock, not invented receipts.

Thresholds are applied per location. Product defaults are fallback location
thresholds, not a company-wide quantity to divide arbitrarily among warehouses.
Single-location Stock Summary views also use the effective location limits;
multi-location aggregate views retain product defaults.

- Out of Stock: available quantity <= 0.
- Low Stock: positive available quantity <= effective minimum.
- Overstock: physical quantity > a configured positive maximum.
- Reorder Required: available quantity <= reorder point and suggested quantity
  is positive.

Suggested quantity tops available quantity up to Maximum, or Minimum when no
Maximum exists. A configured product minimum order quantity is respected when a
positive shortfall exists. Fractional quantities are supported. No automatic
doubling, arbitrary minimum of one, or invented target is used. If both targets
are zero, an out-of-stock alert may have no suggested purchase until configured.
The suggestion does not subtract outstanding purchase orders or forecast future
demand; it is a current available-stock/min-max calculation for user review.

Low/out/overstock and Reorder Required are separate reasons. For example, one
low-stock location can legitimately have a Low Stock and a Reorder Required
alert; two unresolved alerts of the same type at that location are forbidden.

## Lifecycle and refresh

StockAlert is an alert projection/history collection, not another stock ledger.
A partial unique index enforces one unresolved record per owner, product, branch,
warehouse and alert type. Open and Reviewed are both unresolved. Identical refreshes
preserve IDs and reviews. Material stock/reservation/threshold changes reopen a
reviewed alert. Conditions that no longer apply resolve their records and retain
the old snapshot. A later observed recurrence creates a new historical record.

Every alert API read reconciles a fresh central-stock snapshot inside the existing
MongoDB transaction helper. Owner guard revisions serialize overlapping refreshes;
bulk writes synchronize the projection atomically. These revisions are internal
concurrency metadata on AppUser, not quantity counters or changes to user status.
The read does not change stock, billing or accounting balances. Projection writes
and reviews require a transaction-capable MongoDB replica set/sharded cluster.

Both existing UI layouts refresh after local inventory/sales/order changes, on
focus/visibility and every 30 seconds while visible. Updates from other sessions
or external writes appear on the next refresh. With no reader open, the stored
projection is reconciled on the next API read; there is no always-on background
notification scheduler. Resolutions/reappearances between observations are not
reconstructed as fictional alert events. No email/SMS/push delivery is claimed.

## APIs and permissions

- `GET /inventory/alerts`: page/limit, search, type, warehouse, branch, brand,
  category, supplier, reviewed (Open/Reviewed), sort (priority/name/stock).
  Returns filtered stats, server-side pagination, current snapshots and refresh time.
- `GET /inventory/alerts/stats`: stats using the same snapshot and filters.
- `GET /inventory/alerts/thresholds/:productId`: saved defaults, overrides and
  authorized warehouse choices.
- `PATCH /inventory/alerts/thresholds/:productId`: scope product/warehouse,
  minStockLevel, maxStockLevel, reorderLevel, enabled; warehouse scope also needs
  warehouse and branch. Blank/inherited fields must be null. Configuration changes
  are validated, audited and reconciled atomically. Existing minimum order quantity
  remains managed by the existing product settings.
- `POST /inventory/alerts/review`: `{ "ids": ["..."] }`, 1-100 distinct IDs.
  Requires inventory edit permission and current unresolved, authorized IDs.
- `GET /inventory/alerts/:id/purchase-order`: recalculates a current suggestion
  and returns editor seed data, never a saved/posted document. Requires creation
  permission; stale/resolved/overstock/no-target alerts are rejected.

All routes retain existing authentication/module guards. Company-wide product
threshold edits require an owner/Super Admin; permitted members can configure
only authorized warehouses within their branch. Company and branch scoping is
also applied to alert refresh, review and purchase suggestions. Human threshold
changes and reviews are recorded in the existing AuditLog.

## Purchase-order shortcut

The existing new Purchase Order editor accepts `?stockAlert=<id>`, loads the fresh
seed via the API, prefills the actual product, base-unit suggested quantity, cost,
warehouse, branch and alert reference, and leaves saving to the user. Supplier
and variant selection remain deliberate user choices, not fabricated mappings.
Changing stock after opening the form does not auto-edit the user's draft; refresh
the suggestion before ordering if necessary. The shortcut does not post inventory
or prevent a user from intentionally creating multiple purchase orders.

## Deployment and tests

Back up production and build StockAlert indexes before enabling the feature if
autoIndex is disabled. Use the normal reviewed createIndexes process, not
destructive syncIndexes. New Product fields are additive; no historical stock is
rewritten or backfilled.

```powershell
$env:INVENTORY_TEST_MONGODB_URI='mongodb://localhost:27017'
node scripts/runTests.js tests/stockAlerts.test.js tests/stockAlerts.integration.test.js
```

Integration tests use and drop only unique guarded `gobook_stock_alert_test_*`
databases. Tests cover concurrent identity protection, review/reset/resolution,
warehouse overrides, branch/company permissions, rollback, source status and
purchase-editor seed safety. Frontend tests render both layouts and their loading,
empty, error and populated states using test-only fixtures.
