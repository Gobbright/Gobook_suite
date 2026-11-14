# Frontend performance cleanup

Pages are loaded when their route is opened instead of loading all industry,
administration and reporting screens with the main router. Route guards remain
eager, and each page has its own loading boundary so the app shell stays mounted.

Billing also defers invoice preview, PDF label generation, camera barcode
libraries and the product editor until used. The permanently disabled duplicate
sales screen was removed. Product search options are cached by catalog, and
autocomplete caches searchable text, stops after its existing 20-result limit,
and attaches its outside-click listener only while open.

## Build comparison

Measured with the same production build settings, before and after the cleanup.
JavaScript sizes below exclude source maps, CSS and optional dynamic imports.
The after measurement follows static manifest dependencies of the entry and main
router; the before build bundled those dependencies into its entry/router files.

| Main app startup JavaScript | Before | After |
| --- | ---: | ---: |
| Uncompressed bytes | 7,345,560 | 587,417 |

This is a 92% reduction in startup JavaScript, not a measured 92% reduction in
render time. Requested pages are fetched separately and cached by the browser.
Backend response time and real customer datasets were not benchmarked.

## Validation

- Production build and import casing check pass.
- All 502 frontend tests pass.
- Browser checks with isolated data cover billing, B2C switching, sales/purchase
  reports, product navigation, quantity entry, payment layouts and print preview.
- Browser resource checks confirm unrelated industry pages and optional PDF,
  scanner and product-editor modules are absent from initial billing loading.
