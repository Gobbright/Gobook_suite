# Ledger management

The existing `/ledger/new` workspace retains its original sidebar categories,
layout, theme and responsive sizing. Ledger lists and voucher navigation keep
their existing routes. New sections reuse the existing ledger table, action
menus, editor dialog, export helpers and read-only voucher details.

## Financial data

- The workspace requests `/accounting/ledger?balances=posted`. Group and ledger
  balances come from `AccountingVoucher` lines with status `Posted`, plus the
  signed master opening. Cached ledger debit/credit counters are not used as
  financial evidence.
- A positive balance is Dr; a negative balance is Cr. Opening before From Date
  includes earlier posted movements. Period movements exclude that opening.
  Closing equals opening plus period debit minus period credit.
- A financial-year filter derives its dates from the company's `fyStart`.
  Earlier-year balances carry forward without returning earlier-year
  transactions in the selected period. Invalid dates and dates outside the
  selected year are rejected.
- Branch balances include only permitted branch transactions. A master opening
  assigned to another or unassigned branch is not attributed to that branch.
- Voucher type, reference, cost centre, reconciliation status, amount and text
  filters narrow displayed rows without recomputing historical running balances.
  The summary cards continue to show the complete selected date period.
- Draft and Cancelled vouchers cannot be included in normal financial balances.

`GET /accounting/reports/ledger-statement` accepts `ledgerId` (preferred) or
`ledgerName`, `from`, `to`, `financialYear` and `branch`. Ledger IDs distinguish
same-name accounts belonging to different users within a company. Owner,
company and branch scopes apply to all reads and mutations.

## Metadata, groups and credit

`LedgerAccount` adds optional code, contact, GSTIN, credit limit and credit days,
plus revision, opening-history and audit records. Existing documents remain
valid. Codes are unique per owner when provided; empty codes are not indexed.

Customer/Customers maps to Sundry Debtors; Supplier/Suppliers maps to Sundry
Creditors. New custom groups retain a parent and canonical accounting group, so
their vouchers continue to participate in debtor/creditor and financial reports.
Groups are company-scoped and unique within a company. Existing sidebar root
categories are unchanged.

- `GET /accounting/ledger-groups`
- `POST /accounting/ledger-groups`: `{ name, parent }`
- `GET /accounting/ledger/:id/details`: profile, credit exposure, outstanding
  bill references, opening history, voucher adjustments and audit history.

Contact and tax fields fall back to an unambiguous same-owner, same-name
Customer/Vendor master, including legacy unassigned-branch records. Ledger
overrides are stored independently. Explicit credit-limit changes synchronize
the matched customer/vendor record atomically; supplier credit days synchronize
as well. Customer credit days are maintained on the ledger. Ambiguous matches
are never silently updated.

Outstanding references use actual posted allocations, including partial and
multiple settlements, advances and on-account entries. Due dates are derived
from the originating bill date and configured credit days. Available credit
and limit warnings use posted closing exposure, not dummy values or cached
movement totals.

## Protection and audit

Ledger create/edit/deactivate operations use the existing MongoDB transaction
service and Accounting action permissions. Every new master change records
actor, timestamp, reason and before/after values. Revisions detect stale edits.
Historical global audit records are also exposed; missing legacy history is
identified explicitly rather than fabricated.

Names with accounting history cannot be renamed. Openings with posted history
cannot be overwritten; use an Opening Balance adjustment voucher. Unposted
opening corrections require a reason and append signed opening history. Debit
and credit movements cannot be injected through ledger editing or importing.
Imports reuse the same validated, audited mutations and report failed rows
without changing their existing data. No posted voucher is edited by ledger
metadata operations.

## Verification

```powershell
cd backend
node scripts/runTests.js tests/ledgerManagement.test.js tests/ledgerWorkspace.test.js tests/accountingIntegration.test.js tests/salesLifecycleWorkflow.test.js tests/bankVoucherReconciliation.test.js
$env:LEDGER_TEST_MONGODB_URI = 'mongodb://localhost:27017'
node scripts/runTests.js tests/ledgerManagement.integration.test.js
cd ../frontend
node --test tests/ledgerWorkspace.test.js tests/automobileLedger.test.js
npx.cmd playwright test --config playwright.ledger.config.js
```

Real database tests create and drop a unique `gobook_ledger_test_*` database.
They do not modify application records. Browser tests use Chrome. Set
`LEDGER_TEST_BASE_URL` to an existing Vite test server to skip starting one.
Restart the backend after deployment so Mongoose can initialize the new group,
code and ledger-statement indexes.
