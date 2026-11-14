# Dynamic report filters

Sales Reports and Purchase Reports share the compact `DynamicFilterSearch` and
`ReportFilterInput` interface and the existing `GET /api/sales/invoices` endpoint.
Ordinary invoice requests keep their existing response and calculations. Add
`report=sales` or `report=purchase` to request the corresponding filtered report.

## Request and response

`filters` is a JSON condition group. Fields and operators are validated against
`backend/src/services/reportFilterConfig.js`; client-supplied MongoDB queries and
database field paths are rejected. For example:

```json
{
  "logic": "and",
  "conditions": [
    { "field": "customer", "operator": "equals", "values": ["ABC Traders"] },
    { "field": "amount", "operator": "greaterThan", "value": 10000 },
    { "field": "date", "operator": "between", "min": "2026-11-01", "max": "2026-11-13" }
  ]
}
```

Groups support `and` and `or`, up to 30 conditions, three nested group levels,
100 values per condition, and 16,000 characters of serialized filter input.
Text searches escape regular expressions. Numbers must be finite. Dates must be
valid calendar dates. No-value operators omit the value.

Additional parameters are `analysis`, `marginBy`, `metric`, `sort`, `direction`,
`page`, and `limit`. Page size is capped at 500. Responses contain the report page
in `data`, the total number of grouped results in `total`, distinct matching
invoices in `recordCount`, and totals across **all** matching results in `totals`.

The default Sales and Purchase Report UI uses `analysis=documents`, which returns
one row per invoice ID with combined matching product names, quantities and
discounted amounts. A rate is shown only when all matching lines have the same
rate; mixed rates display a dash. Separate documents with the same invoice number
remain separate. Report options → Item details (`analysis=transactions`) shows
individual invoice lines. Existing grouped analysis views also remain available
under Report options. The five summary cards show distinct invoice count,
quantity, subtotal, GST and net sales. Saved invoice GST and final totals are
allocated proportionally to matching lines, retaining charges and rounding;
they are not calculated from the current page. The header Export menu provides
CSV and PDF; Print uses the same applied filters.

Option filters support multiple checked values, Select All (or Select All Shown
when searched/paginated), and Clear Selection. Choices stay in the picker when
switching fields; Add filters adds all selected fields together. Editing or
extending an existing field updates its chip. Values within one field match any
selected value; different fields follow the report's AND/OR setting. Selection
is limited to 100 values per field and 30 filter conditions.

Tenant and branch restrictions are applied independently of user filter groups.
Invoice amounts and payment statuses reuse the existing billing logic. Product
category, brand and cost fall back to the scoped product master when absent from
the saved line. Item conditions are checked against the same invoice line, and
only matching lines contribute to report totals. Overall discounts retain their
original proportional allocation across the invoice. The existing sales report
formulas are retained in `salesReportCalculations.js`.

Date boundaries are inclusive calendar dates. Invoices without a saved invoice
date use the creation date in `Asia/Kolkata`.

## Field metadata and options

- `?report=sales&view=filter-config` returns public field definitions without
  database paths.
- `?report=sales&view=filter-options&field=customer&q=abc&page=1&limit=50` returns
  searchable, paginated values from scoped report records.
- The metadata view also serves the `purchase`, `stockSummary`, `stockMovement`,
  `ledger`, and `gst` configurations.
- The invoice report data adapter supports `sales` and `purchase`. Inventory,
  ledger and GST data adapters remain on their existing report endpoints; their
  pages have not been migrated to the new builder in this change.

To reuse the UI, pass a report's public fields, a condition group, an `onChange`
handler, `onApply`, and a scoped `loadOptions` function to `DynamicFilterSearch`.
`ReportFilterInput` supports multi-select, single-select, searchable selection,
date ranges, number ranges, text and boolean values. Adapt the backend report's
computed fields before calling the shared compiler; never accept database paths
from the browser.

## Persistence and exports

Applying a filter updates data, totals and pagination together. Draft filter
changes are marked pending until Apply. Filters remain active while paging,
sorting or changing views within the open report. Opening or reloading the report
starts with an empty filter bar and unfiltered results; previous session filters
are not restored automatically. Saved filter combinations are stored in browser
local storage, scoped by business, user and report, and are loaded only when the
user selects one. They can be deleted and are not synced across browsers or devices.

CSV, PDF and print fetch all pages using the currently applied filters and sort.
Export cells and print HTML are escaped using the existing download service.
Specialised industry reports remain available through the Industry reports
button on eligible Sales Reports pages.

Purchase Reports uses supplier columns and filters, purchase-specific saved
filters, and Net Purchases in the top summary cards. It counts `purchase-entry`
bills, excluding purchase orders, supplier returns, debit notes and sales from
the purchase totals. Supported views are documents, transactions, invoice, product,
category, brand, supplier and branch; sales-only profit metrics are not offered.
Existing supplier price, pending-order, returns, payable and delivery reports
remain available through Report options → More purchase reports. Saved filter
names can be reused independently between Sales and Purchase Reports.

## Verification

```powershell
# From frontend
node --test tests/dynamicReportFilters.test.js tests/salesReportSelections.test.js

# From backend; use a local disposable MongoDB instance
$env:REPORT_FILTER_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27029'
node --test tests/reportFilters.test.js tests/reportFilters.integration.test.js
```

The integration test creates a uniquely named `gobook_report_filters_test_*`
database and drops only that database on completion. It never loads the app's
production MongoDB URI. Tests cover validation, operator injection, dates,
same-line matching, cost/discount calculations, payment aliases, filters,
pagination, totals, sorting, searchable options and tenant/branch isolation.
