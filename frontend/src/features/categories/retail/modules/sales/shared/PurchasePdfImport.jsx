import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, LoaderCircle, X } from 'lucide-react';
import { useFocusTrap } from '../../../../../../hooks/useFocusTrap.js';
import { PURCHASE_VARIANT_FIELDS, matchPurchaseImport, readPurchasePdf } from '../../../../../../utils/purchasePdfImport.js';
import { purchaseImportIssues } from '../../../../../../utils/purchasePdfValidation.js';
import './purchasePdfImport.css';

function Review({ initial, fileName, products, vendors, hasItems, onApply, onClose }) {
  const [data, setData] = useState(initial);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useFocusTrap({ onClose });
  const matched = matchPurchaseImport(data, products, vendors);
  const issues = purchaseImportIssues(data);
  const baseFields = ['description', 'productCode', 'barcode', 'brand', 'category', 'subCategory', 'size', 'length', 'colour', 'type', 'material'];
  const extraFields = PURCHASE_VARIANT_FIELDS.filter((field) => !baseFields.includes(field) && data.items.some((item) => item[field] || item.uncertainFields?.includes(field)));
  const reviewFields = [...baseFields, ...extraFields, 'itemDescription', 'hsn', 'qty', 'unit', 'rate', 'discount', 'gstRate', 'sourceAmount'];
  const fieldLabels = { description: 'Product', productCode: 'SKU / Code', barcode: 'Barcode', brand: 'Brand', category: 'Category', subCategory: 'Subcategory', size: 'Model / Size', length: 'Length', colour: 'Colour', type: 'Fit', material: 'Material', itemDescription: 'Specifications', hsn: 'HSN', qty: 'Qty', unit: 'Unit', rate: 'Rate', discount: 'Discount', gstRate: 'GST %', sourceAmount: 'Printed amount', ram: 'RAM', storage: 'Storage', processor: 'Processor', display: 'Display', graphics: 'Graphics', operatingSystem: 'Operating system', pattern: 'Pattern', quality: 'Quality', ageGroup: 'Age group', other: 'Other attributes' };
  const change = (field, value) => setData((previous) => ({ ...previous, [field]: value }));
  const updateRow = (index, field, value) => setData((previous) => ({ ...previous, items: previous.items.map((item, row) => row === index ? { ...item, [field]: value, uncertainFields: (item.uncertainFields || []).filter((entry) => entry !== field) } : item) }));
  const uncertain = (item, field) => item[field] === '' || item[field] == null || ['qty', 'rate'].includes(field) && Number(item[field]) <= 0;
  function apply() {
    if (!data.vendor.name.trim()) return setError('Enter the vendor name before applying.');
    if (matched.items.some((item) => item.matchLabel.startsWith('Ambiguous'))) return setError('Multiple inventory products or variants match. Confirm the unique SKU or barcode for those rows before applying.');
    if (!data.items.length || data.items.some((item) => !item.description.trim() || !(Number(item.qty) > 0) || !(Number(item.rate) > 0) || item.gstRate === '' || Number(item.gstRate) < 0 || Number(item.gstRate) > 100 || item.discount === '' || Number(item.discount) < 0 || Number(item.discount) > (item.discountType === 'amount' ? Number(item.qty) * Number(item.rate) : 100))) return setError('Complete product, quantity, rate, discount and GST for every item. Enter 0 for tax-free items.');
    if (data.charges.some((charge) => charge.amount === '' || !(Number(charge.amount) >= 0) || charge.gstRate === '' || !(Number(charge.gstRate) >= 0) || Number(charge.gstRate) > 100)) return setError('Confirm the amount and GST rate for each additional charge. Enter 0 if no GST applies.');
    if (issues.length) return setError(issues[0].message);
    if (hasItems && !replace) return setError('Confirm replacement of the current items and charges, or cancel to keep them.');
    onApply(matchPurchaseImport(data, products, vendors));
    onClose();
  }
  return createPortal(<div className="purchase-pdf-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={modalRef} className="purchase-pdf-dialog" role="dialog" aria-modal="true" aria-label="Review purchase PDF">
      <header><div><h2>Review purchase PDF</h2><p>{fileName} · Check the extracted details before applying.</p></div><button type="button" aria-label="Close PDF review" onClick={onClose}><X size={19} /></button></header>
      <div className="purchase-pdf-body">
        <p className="purchase-pdf-info">Nothing is saved or added to stock until you save the Purchase Entry. Unmatched products will use the existing new-product workflow.</p>
        {data.warnings.length > 0 && <ul className="purchase-pdf-warnings">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {issues.length > 0 && <ul className="purchase-pdf-error" aria-label="PDF validation issues">{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        <div className="purchase-pdf-fields">
          <label>Vendor name<input aria-label="Vendor name" value={data.vendor.name} onChange={(event) => change('vendor', { ...data.vendor, name: event.target.value })} /><small>{matched.vendorMatch ? 'Existing vendor matched' : 'Vendor needs review'}</small></label>
          <label>Vendor GSTIN<input value={data.vendor.gstin} maxLength={15} onChange={(event) => change('vendor', { ...data.vendor, gstin: event.target.value.toUpperCase() })} /></label>
          <label>Supplier invoice number<input value={data.invoiceNo} onChange={(event) => change('invoiceNo', event.target.value)} /></label>
          <label>Invoice date<input type="date" value={data.date} onChange={(event) => change('date', event.target.value)} /></label>
          <label>Invoice amount<input type="number" min="0" step="0.01" value={data.invoiceAmount} onChange={(event) => change('invoiceAmount', event.target.value)} /></label>
          <label>Invoice discount<input aria-label="Invoice discount" type="number" min="0" step="any" value={data.additionalDiscount?.value ?? 0} onChange={(event) => change('additionalDiscount', { type: data.additionalDiscount?.type || 'amount', value: event.target.value })} /><select aria-label="Invoice discount type" value={data.additionalDiscount?.type || 'amount'} onChange={(event) => change('additionalDiscount', { type: event.target.value, value: data.additionalDiscount?.value ?? 0 })}><option value="amount">Amount</option><option value="percent">%</option></select></label>
          {['tds', 'tcs'].map((field) => <div key={field}><label><span><input type="checkbox" checked={data[field]?.enabled || false} onChange={(event) => change(field, { ...data[field], enabled: event.target.checked, rate: data[field]?.rate ?? '' })} /> {field.toUpperCase()}</span></label>{data[field]?.enabled && <><label>{field.toUpperCase()} %<input aria-label={`${field.toUpperCase()} rate`} type="number" min="0" max="100" step="any" value={data[field].rate} onChange={(event) => change(field, { ...data[field], rate: event.target.value })} /></label>{field === 'tds' && <label>TDS section<input value={data.tds.section || ''} onChange={(event) => change('tds', { ...data.tds, section: event.target.value })} /></label>}</>}</div>)}
          <label>Purchase order reference<input aria-label="Purchase order reference" value={data.poReference} onChange={(event) => change('poReference', event.target.value)} /><small>Reference only; does not match a PO automatically.</small></label>
        </div>
        <div className="purchase-pdf-table"><table><thead><tr>{reviewFields.map((field) => <th key={field}>{fieldLabels[field]}</th>)}<th>Remove</th></tr></thead><tbody>{data.items.map((item, index) => <tr key={index}>
          {reviewFields.map((field) => <td key={field}><input aria-label={`${field} item ${index + 1}`} type={['qty', 'rate', 'discount', 'gstRate', 'sourceAmount'].includes(field) ? 'number' : 'text'} step="any" aria-invalid={['qty', 'rate', 'gstRate', 'discount'].includes(field) && uncertain(item, field) || issues.some((issue) => issue.row === index && issue.fields.includes(field)) || undefined} value={item[field] ?? ''} onChange={(event) => updateRow(index, field, event.target.value)} />{field === 'description' && <><small>{matched.items[index].matchLabel}</small><select aria-label={`Product type item ${index + 1}`} value={item.productType || 'Standard'} onChange={(event) => updateRow(index, 'productType', event.target.value)}><option value="Standard">Standard</option><option value="Matrix">With variants</option></select></>}{field === 'discount' && <select aria-label={`Discount type item ${index + 1}`} value={item.discountType} onChange={(event) => updateRow(index, 'discountType', event.target.value)}><option value="percent">%</option><option value="amount">Amount</option></select>}</td>)}
          <td><button type="button" aria-label={`Remove imported item ${index + 1}`} onClick={() => change('items', data.items.filter((_, row) => row !== index))}><X size={15} /></button></td>
        </tr>)}</tbody></table></div>
        {data.charges.length > 0 && <div className="purchase-pdf-fields">{data.charges.map((charge, index) => <div key={index}><label>{charge.label}: Amount<input aria-label={`Amount for ${charge.label}`} type="number" min="0" step="any" aria-invalid={charge.amount === '' || undefined} value={charge.amount} onChange={(event) => change('charges', data.charges.map((row, number) => number === index ? { ...row, amount: event.target.value } : row))} /></label><label>GST %<input aria-label={`GST for ${charge.label}`} type="number" min="0" max="100" aria-invalid={charge.gstRate === '' || undefined} value={charge.gstRate} onChange={(event) => change('charges', data.charges.map((row, number) => number === index ? { ...row, gstRate: event.target.value } : row))} /></label></div>)}</div>}
        {hasItems && <label className="purchase-pdf-replace"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />Replace existing items, charges and invoice discount with the reviewed PDF details.</label>}
        {error && <p className="purchase-pdf-error" role="alert">{error}</p>}
      </div>
      <footer><span>{data.items.length} item(s) · Review taxes and invoice total in Purchase Entry.</span><button type="button" onClick={onClose}>Cancel</button><button type="button" className="purchase-pdf-primary" onClick={apply}>Apply to Purchase Entry</button></footer>
    </section>
  </div>, document.body);
}

export function PurchasePdfImport({ products, vendors, hasItems, disabled, onApply }) {
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('Reading PDF...');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setProgress('Reading PDF...'); setError('');
    try { setReview({ data: await readPurchasePdf(file, { onProgress: setProgress }), fileName: file.name }); }
    catch (failure) { setError(failure.message || 'Unable to read this PDF. Your entry has not changed.'); }
    finally { setBusy(false); }
  }
  return <section className="purchase-pdf-upload" aria-label="Import purchase PDF" aria-busy={busy}>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" aria-label="Purchase bill PDF" hidden onChange={upload} disabled={disabled || busy} />
      <button className="purchase-pdf-action-button" type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
        {busy ? <LoaderCircle size={14} className="purchase-pdf-spinner" aria-hidden="true" /> : <FileUp size={14} aria-hidden="true" />}
        <span aria-live="polite">{busy ? progress : 'Upload PDF'}</span>
      </button>
    {error && <p className="purchase-pdf-error purchase-pdf-upload-error" role="alert">{error}</p>}
    {review && <Review initial={review.data} fileName={review.fileName} products={products} vendors={vendors} hasItems={hasItems} onApply={onApply} onClose={() => setReview(null)} />}
  </section>;
}
