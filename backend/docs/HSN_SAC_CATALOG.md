# HSN / SAC lookup

The supplied workbook is bundled as a read-only reference catalog at
`src/data/hsn-sac.json`. It contains 22,614 unique codes: 21,933 HSN and 681 SAC.
Two duplicate codes containing spaces were merged with their alternate
descriptions retained for search. Leading zeros are preserved. Five unusual
source code lengths are retained and marked `needsReview`; the application does
not guess missing digits. The source workbook checksum is recorded in the data.

This catalog is shared classification data, not company transactions. No product,
invoice, ledger or company database records are overwritten. The authenticated
`GET /api/reference/hsn-sac?q=0101&type=HSN&limit=20` endpoint searches the backend
catalog and returns at most 50 results. The UI debounces searches and requests 20
results only while an HSN field is focused. Search by code prefix or description
words. Keyboard selection uses Arrow Up/Down and Enter; Escape dismisses the list.
Existing/manual codes remain editable if no match is found or lookup is offline.

The workbook contains descriptions, not GST rates. Selecting a code never changes
the product description, tax rate, price, or other existing product values. Source
codes flagged for review should be checked before use; this workbook is not an
automatic assurance of current classification or rates.

To replace the reference data with an updated workbook, run from `backend`:

```powershell
node scripts/importHsnSacCatalog.js 'C:\path\HSN_SAC.xlsx'
```

The importer requires `HSN_MSTR` and `SAC_MSTR` sheets with the original column
headers. It validates all rows before atomically replacing the catalog. Deploy
the regenerated JSON with the backend and restart the backend to refresh its
in-memory cache. The data lives under `src`, so Docker and AWS ZIP releases
include it automatically. The user's Downloads path is never required at runtime.
