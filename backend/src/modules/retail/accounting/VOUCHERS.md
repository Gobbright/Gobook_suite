# Accounting vouchers

The existing voucher entry and listing screens use `AccountingVoucher` as the
double-entry record for manual entries and Sales/Purchase source documents.
The existing theme and ledger table are retained.

## Entry and posting

- Contra, Payment, Receipt, Journal, Sales, Purchase, Credit Note and Debit Note
  are available alongside the pre-existing specialist voucher types.
- Automatic numbers are previews until save. A transaction reserves a sequence
  per owner, financial year and voucher type. Manual numbers remain unique in
  that scope. A form request key makes retries idempotent.
- Entries require at least two distinct active ledgers and positive finite
  amounts. Posted entries must balance to the paise. Drafts may be unbalanced
  and never change ledger totals or financial reports.
- Financial years follow the company's configured `fyStart`. A supplied year
  must match the date. Lists and reports accept a `financialYear` filter.
- Against Bill lines support multiple `allocations` containing `type`,
  `reference` and `amount`. Types are New Reference, Against Reference,
  Advance and On Account. Their amounts must sum to the ledger line amount.
- Against Reference allocations use outstanding posted balances in the same
  owner/company/year scope. Ledger writes serialize concurrent allocations;
  overpayments and duplicate new references are rejected.
- PDF and image attachments reuse the authenticated GridFS file service:
  at most ten files, 2 MB each. Only the current owner's files uploaded for
  `accounting-vouchers` can be attached.

All create, post, alteration, cancellation, reversal and source-posting work uses
the existing MongoDB transaction service. MongoDB must run as a replica set or
sharded cluster. There is no nontransactional posting fallback.

## Management and permissions

Voucher routes require the existing Accounting module and action permissions
(`view`, `create`, `edit`, `delete`); company owners retain full access.
Posted alteration requires edit permission, a reason and a current revision
when provided by the client. The UI supplies the revision. Drafts alone can be
deleted. Posted vouchers cannot become drafts or be deleted through voucher APIs.

Cancellation retains the voucher, removes its ledger effect and records its
reason. Reversal retains the posted original and creates a linked opposite
Journal voucher. Repeated reversal and alteration of reversed vouchers are
blocked. Audit events retain actor, timestamp, reason and before/after values.
Legacy vouchers explicitly indicate when historical audit events are absent.

Source-linked vouchers must be corrected/cancelled through their original
Sales or Purchase workflow, preserving existing inventory, tax and payment
rules. Unchanged source postings are idempotent. Changes retain the same voucher
identity and audit its prior values. Source payment references identify the
original bill. Manual bill settlements must be resolved before changing their
originating references. Existing source workflows continue to manage their
own linked payments atomically. Accounting reset refuses to delete posted
voucher history.

## APIs

- `GET /api/accounting/vouchers`: `from`, `to`, `voucherType`, `account`,
  `financialYear`, `status`, `search`, `sort`, `direction`, `page`, `limit`.
  Sort fields: date, voucherNo, voucherType, debitTotal, status. Limit: 1–500.
- `GET /api/accounting/vouchers/bill-references`: `ledger`, `financialYear`
  or `date`, and optional `excludeId` for a draft/alteration.
- `POST /api/accounting/vouchers/:id/cancel`: `{ reason }`.
- `POST /api/accounting/vouchers/:id/reverse`: `{ reason, date }`.
- `PUT /api/accounting/vouchers/:id`: entry fields, `revision`, and
  `alterationReason` for an already posted manual voucher.

Day Book, Ledger Statement, Trial Balance, P&L, Balance Sheet and Bill-wise
reports reuse the posted voucher lines. Draft and Cancelled statuses cannot be
included by overriding a financial report's status query.

## Existing database upgrade

The old sparse compound source index incorrectly includes manual vouchers
because every document has `userId`. Replace it with the partial source index
and create the reversal/request-key indexes before accepting voucher writes:

```powershell
cd backend
node scripts/migrateVoucherIndexes.js
node scripts/migrateVoucherIndexes.js --apply
```

Pause voucher writes while applying this migration. It changes indexes only;
it does not rewrite or remove voucher documents. Run it separately for each
deployed database. The local `gobook` database was upgraded during development.

## Journal workspace and recurring adjustments

Journal entry uses the existing full-page journal design and voucher APIs.
Searchable accounts include posted ledger balances and groups. Cost centres and
bill allocations are available from the line narration options. Supporting files
reuse voucher storage and validation. Narration templates are saved on this
device, scoped by company and user; they are not shared server-side templates.

Posted manual journals are immutable, including metadata. Correct them with
an authorized, reasoned reversal and a new journal. Other voucher types retain
their existing controlled alteration workflow; source-linked journals remain
controlled by their originating modules. Historical `JournalEntry` summaries
remain readable but cannot be edited or deleted through legacy endpoints.

Legacy journal creation now requires ledger lines and delegates to the voucher
engine. Journal import groups rows by Entry No with Date, Entry No, Ledger,
Side (`debit`/`credit`), Amount, optional Status (Draft by default), Narration,
Reference and Cost Centre. Each group posts atomically; incomplete, unbalanced
posted groups, duplicate numbers and historical overwrites are rejected and
reported. The previous aggregate-only import cannot identify counterpart
ledgers and is no longer accepted as an accounting posting.

Recurring configuration uses `/accounting/recurring-journals`: GET to list,
POST to configure from an existing journal, PUT `/:id` with `active` and
`revision` to pause/resume, and POST `/:id/generate` with the expected due
`date`. Weekly, monthly, quarterly and yearly periods preserve month-end day
anchors. Each due occurrence is generated explicitly as a reviewable Draft;
there is no unattended scheduler or automatic posting. Generated drafts retain
a recurring-configuration link. References, bill allocations and attachments
are deliberately not copied to later occurrences and must be reviewed anew.
Generation, sequence reservation and schedule advancement share one transaction;
concurrent attempts/retries cannot create duplicate occurrences. Inactive
ledgers or write failures leave the next occurrence unchanged. Each occurrence
derives its own financial year from company settings. Existing permission,
owner, company and branch restrictions apply.

Restart the backend to initialize the new `RecurringJournal` collection/indexes.
Real journal tests use `JOURNAL_TEST_MONGODB_URI` and create/drop only their own
unique `gobook_journal_test_*` database:

```powershell
$env:JOURNAL_TEST_MONGODB_URI = 'mongodb://localhost:27017'
node scripts/runTests.js tests/recurringJournals.test.js tests/journalManagement.integration.test.js
```

## Trial Balance reporting

The existing Trial Balance page now calls `GET /accounting/trial-balance`
instead of downloading all ledger masters and full voucher documents and
depending on a separate Settings request. The controller extends the existing
`ledgerBalancesFromVouchers` reporting helper with database aggregation; it does
not maintain another accounting store or posting engine.

Query parameters: `initialize=true` for the company's current financial period,
or `financialYear=YYYY-YY`, `from`, `to` (or `asOn`), optional `branch`,
`costCenter`, and `comparison=previous`. Explicit dates are validated against
company financial-year settings. Comparison uses the immediately preceding
period of equal duration, including a prior-year carry where appropriate.

The response includes `rows`, `totals`, `period`, `fyStart`, group definitions
and permitted filter options. The legacy `accounts` response remains available
with closing `debit`/`credit` fields. Detailed rows provide signed opening and
closing plus separate opening, period and closing Dr/Cr columns. Only Posted
canonical voucher lines contribute movements; Draft, Cancelled and mirrored
`JournalEntry` summaries cannot double-count balances. Cached ledger movement
counters are not financial evidence. Owner/ledger identities distinguish
same-name accounts. Master openings are attributable only to their recorded
branch, and are excluded from cost-centre slices because they have no cost
allocation. Such filtered slices can legitimately show a difference.

The existing group cards, theme and page layout are retained. Group children
aggregate once; search, zero-balance and group filters affect the visible
selection and its totals. Pagination limits displayed ledgers, not grand totals.
Printing expands groups across all pages; PDF/Excel/CSV export uses all matching
ledger rows. Ledger links retain exact ledger IDs, date and branch context.
Company-owner branch reads select postings by recorded branch rather than
accidentally dropping company-owner postings when a member works in that branch;
write permissions and scopes remain unchanged.

Local diagnostics found a ready backend (`/health` HTTP 200), a responsive
existing Trial Balance controller against the application database, successful
CORS preflight, and HTTP 401 (expected without authentication) on the report
route. The originally reported network/service outage was not reproduced.
The old page's generic message is emitted by its API clients when fetch fails;
it is not proof of HTTP 503 from Trial Balance. Runtime failures
remain visible, with unavailable totals and explicit Retry; invalid API payloads
are errors rather than silently rendered zero reports.

Restart the backend to expose the enhanced response and initialize the report
index. Calculation checks compare real posted journal records against the
existing Ledger Book service in isolated `gobook_trial_test_*` databases:

```powershell
$env:TRIAL_BALANCE_TEST_MONGODB_URI = 'mongodb://localhost:27017'
node scripts/runTests.js tests/trialBalance.integration.test.js
```

Frontend checks use `playwright.trial-balance.config.js`; set
`TRIAL_BALANCE_TEST_BASE_URL` to an existing Vite server when desired.

## Voucher tests

```powershell
cd backend
node scripts/runTests.js tests/voucherEntry.test.js tests/accountingIntegration.test.js tests/salesLifecycleWorkflow.test.js tests/accountingPermissions.test.js
$env:VOUCHER_TEST_MONGODB_URI = 'mongodb://localhost:27017'
node scripts/runTests.js tests/voucherTransactions.integration.test.js
cd ../frontend
npx.cmd playwright test --config playwright.vouchers.config.js
```

Replica-set tests create and drop a unique `gobook_voucher_test_*` database.
They never write to the application's database. Browser tests use Chrome and
the existing Vite test pages. `VOUCHER_TEST_BASE_URL` can point at an already
running Vite server to skip starting a test server.
