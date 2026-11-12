Purchase PDF analysis

Set GROQ_API_KEY in backend/.env and restart the backend. The key stays on the
server. Uploading a purchase PDF then sends its extracted text and rendered page
images to Groq for structured analysis. The importer still requires
review before applying details and uses existing save/inventory workflows.

Optional settings:

- GROQ_MODEL: text model (defaults to llama-3.3-70b-versatile).
- GROQ_VISION_MODEL: image model (defaults to qwen/qwen3.8-27b).

The selected models must support JSON object output; the image model must also
support vision. See https://console.groq.com/docs/vision and
https://console.groq.com/docs/structured-outputs for provider capabilities.

Every PDF, including selectable text, is rendered in the browser and sent in
batches of at most three pages, with preceding product context for continuations.
Each batch has an extraction pass and a source verification pass. The second
pass checks parent groups, individual fields, specifications and per-page item
counts. Missing page counts, invalid source-page references and incomplete
responses fail instead of importing partial results. A successful verification
response means the verification pass completed; it is not a guarantee of factual
accuracy. Model-reported uncertain fields stay blank and must be corrected.

The review validates line arithmetic (with both tax-exclusive and tax-inclusive
printed amounts), invoice totals, charges and invoice-level discounts. These
checks are layout independent. Unresolved discrepancies block applying the
import. Specifications, categories and printed amounts are visible and editable.
Nonstandard tax adjustments may require manual entry if they do not fit the
application's supported calculation model.

Without the AI key, supported text tables remain usable with an explicit warning
that automatic visual verification is unavailable. There is no visual fallback
for scans while the AI service is unavailable. Configure the key to activate the
general image-analysis path; heuristics alone do not support arbitrary layouts.

No extractor can guarantee exact results for every PDF. Illegible scans, missing
fields, ambiguous catalog identities and conflicting totals require review.
