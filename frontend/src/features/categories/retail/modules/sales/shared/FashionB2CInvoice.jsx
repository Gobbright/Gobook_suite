import { useRef, useState } from 'react';
import { Barcode, Calendar, ChevronDown, ChevronUp, Minus, Pencil, Plus, Search, Settings2, Package, Trash2, UserRound } from 'lucide-react';
import { AutocompleteInput } from '../../../../../../components/forms/AutocompleteInput.jsx';
import { SelectDropdown } from '../../../../../../components/forms/SelectDropdown.jsx';
import { formatCurrency } from '../../../../../../utils/formatCurrency.js';
import './fashionB2CInvoice.css';

export function FashionB2CInvoice({ customer, customerSearch, customerLookupLoading, customerOptions, onCustomerChange, onCustomerSelect, onCustomerSubmit, onAddCustomer,
  search, onSearchChange, onSearchSelect, searchOptions, quantity, onQuantityChange, onAddItem, onCancelItem, variants, variantOptions, model, onModelChange, onModelFocus, onModelBlur,
  items, onItemChange, onVariantChange, onRemoveItem, lineAmount, productForItem, meta, onMetaChange,
  gstEnabled, onGstChange, canToggleGst, summary, headerActions, errors, notes, onNotesChange, onPreview, onViewList, onPrint }) {
  const [more, setMore] = useState(false);
  const [numberEditing, setNumberEditing] = useState(false);
  const checkoutRef = useRef(null);
  function focusField(selector) {
    requestAnimationFrame(() => {
      const field = checkoutRef.current?.querySelector(selector) || checkoutRef.current?.closest('.billing-v2')?.querySelector(selector);
      field?.focus();
      field?.select?.();
    });
  }
  function changeEntryQuantity(delta) {
    const current = Number(quantity) || 0;
    if (delta < 0 && current <= 1) return;
    onQuantityChange(String(Math.max(1, Number((current + delta).toFixed(8)))));
  }
  function focusProduct() { focusField('[data-fkey="product"]'); }
  function nextEntryField() {
    requestAnimationFrame(() => {
      const next = checkoutRef.current?.querySelector('[data-fkey="quick-qty"]');
      next?.focus();
      next?.select?.();
    });
  }
  function handleFieldKey(event) {
    const spaceToPrint = event.key === ' ' && event.target.dataset?.fkey === 'product' && !event.target.value;
    if ((event.key === 'F4' || spaceToPrint) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.repeat) { event.preventDefault(); event.stopPropagation(); return; }
      event.preventDefault(); event.stopPropagation(); onPrint?.(); return;
    }
    if (!event.defaultPrevented && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && ['F7', 'F8'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'F7' && !event.target.closest('tr')) { focusField('[data-fkey="quick-qty"]'); return; }
      const row = event.target.closest('tr') || checkoutRef.current?.querySelector('.fbc-table tbody tr:last-child');
      const input = row?.querySelector(event.key === 'F7' ? '.fbc-quantity input' : '.fbc-discount input');
      input?.focus();
      input?.select();
      return;
    }
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey && event.key !== 'Tab') return;
    const field = event.target;
    if (field.tagName !== 'INPUT' || !['Enter', 'Tab'].includes(event.key)) return;
    const row = field.closest('tr');
    if (row) {
      const fields = [...row.querySelectorAll('input:not(:disabled)')];
      const next = fields[fields.indexOf(field) + (event.shiftKey ? -1 : 1)];
      if (event.shiftKey && !next) return;
      event.preventDefault();
      event.stopPropagation();
      if (next) { next.focus(); next.select?.(); }
      else focusProduct();
    } else if (event.key === 'Enter') {
      if (field.id === 'billing-received-amount') {
        event.preventDefault();
        event.stopPropagation();
        focusField('.billing-payment-grid button');
      } else if (field.id === 'fbc-customer') {
        event.preventDefault();
        event.stopPropagation();
        focusProduct();
      } else if (field.closest('.fbc-options')) {
        event.preventDefault();
        event.stopPropagation();
        const fields = [...checkoutRef.current.querySelectorAll('.fbc-options input, .fbc-options textarea')];
        (fields[fields.indexOf(field) + 1])?.focus();
      }
    }
  }
  return <div ref={checkoutRef} onKeyDown={handleFieldKey} className="fashion-checkout" data-testid="fashion-b2c-checkout">
    <header className="fbc-document-header">
      <h1>Invoice</h1>
      {numberEditing ? <input autoFocus aria-label="Invoice Number" className="billing-doc-number-field" value={meta.number} onChange={event => onMetaChange('number', event.target.value)} onBlur={() => setNumberEditing(false)} onKeyDown={event => { if (['Enter', 'Escape'].includes(event.key)) { event.preventDefault(); setNumberEditing(false); } }} />
        : <button type="button" className="billing-doc-number-field" aria-label="Edit Invoice Number" title="Click to edit document number" onClick={() => setNumberEditing(true)}>{meta.number || '—'}<Pencil size={11} /></button>}
      <label className="billing-doc-date-field"><Calendar size={13} /><input aria-label="Invoice Date" type="date" value={meta.date} onChange={event => onMetaChange('date', event.target.value)} /></label>
      <div className="fbc-top-save-actions">{headerActions}</div>
    </header>
    <div className="fbc-main">
      <section className="fbc-customer fbc-card">
        <label htmlFor="fbc-customer">Customer <span className="fbc-required">*</span><small>{customer.phone || 'Mobile required'}</small></label>
        <div className="fbc-customer-search"><UserRound size={20} /><AutocompleteInput id="fbc-customer" data-fkey="party" value={customerSearch} onChange={onCustomerChange} onSelect={(value) => { onCustomerSelect(value); focusProduct(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onCustomerSubmit(event.currentTarget.value); } }} selectFirstOnEnter={!/^[+\d\s()-]+$/.test(customerSearch || '')} options={customerOptions} placeholder="Enter mobile number or search customer..." statusText={customerLookupLoading ? 'Checking mobile number…' : ''} inputClassName="fbc-customer-input" dropDirection="down" /><button type="button" aria-label="Add customer" onClick={onAddCustomer}><Plus size={23} /></button></div>
        <button type="button" className="fbc-more" aria-expanded={more} aria-controls="fbc-options" onClick={() => setMore((value) => !value)}><Settings2 size={19} />More options<ChevronDown size={16} /></button>
        {errors.customerPhone && <p className="fbc-customer-error fbc-error" role="alert">{errors.customerPhone}</p>}
      </section>
      {more && <section id="fbc-options" className="fbc-options fbc-card">
        <label className="fbc-gst-option">GST<button type="button" role="switch" aria-label="GST" aria-checked={gstEnabled} disabled={!canToggleGst} className={`fbc-toggle${gstEnabled ? ' is-on' : ''}`} onClick={() => onGstChange(!gstEnabled)}><span /></button></label>
        <label className="fbc-notes">Notes<textarea aria-label="Invoice Notes" value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={2} placeholder="Add a note to this invoice" /></label>
        <div className="fbc-option-actions"><button type="button" onClick={onPreview}>Preview Invoice</button><button type="button" onClick={onViewList}>View Bills</button></div>
      </section>}
      <section className="fbc-cart fbc-card">
        <div className="fbc-entry-row">
        <div className={`fbc-product-search${errors.quickItem ? ' has-error' : ''}`}><Barcode size={32} /><AutocompleteInput data-fkey="product" aria-label="Search billing products and services" value={search} onChange={onSearchChange} onSelect={(value) => { onSearchSelect(value); nextEntryField(); }} selectFirstOnEnter options={searchOptions} placeholder="Scan barcode or search products and services..." dropDirection="down" inputClassName="fbc-product-input" onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault(); event.stopPropagation();
            if (event.currentTarget.value.trim()) nextEntryField();
            else focusField('#billing-received-amount:not(:disabled), .billing-generate-btn');
          } else if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            if (event.currentTarget.value.trim()) nextEntryField();
            else focusField('#billing-received-amount:not(:disabled), .billing-generate-btn');
          }
        }} /><button type="button" data-fkey="quick-add" aria-label="Add selected product" onClick={() => onAddItem()}><Search size={26} /></button></div>
        <div className="fbc-entry-quantity" role="group" aria-label="Item quantity"><span>Qty</span><input data-fkey="quick-qty" aria-label="Quantity to add" type="number" min="0.00000001" step="any" value={quantity} onChange={event => onQuantityChange(event.target.value)} onFocus={event => event.target.select()} onKeyDown={event => { if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return; if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); changeEntryQuantity(event.key === 'ArrowUp' ? 1 : -1); return; } if (event.key === 'Enter' || event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); focusField(variants.length ? '[data-fkey="quick-model"]:not(:disabled)' : '.fbc-model-entry > button'); } }} /><div className="fbc-quantity-arrows"><button type="button" aria-label="Increase quantity to add" title="Increase quantity" onClick={() => changeEntryQuantity(1)}><ChevronUp size={12} /></button><button type="button" aria-label="Decrease quantity to add" title="Decrease quantity" disabled={Number(quantity) <= 1} onClick={() => changeEntryQuantity(-1)}><ChevronDown size={12} /></button></div></div>
        <div className="fbc-model-entry"><label><span className="sr-only">Model / Size</span><SelectDropdown data-fkey="quick-model" aria-label="Product Model" onFieldFocus={onModelFocus} onFieldBlur={onModelBlur} aria-invalid={errors.quickItemField === 'model' || undefined} aria-required={variants.length > 0} disabled={variants.length === 0} value={model} onChange={(value) => { onModelChange(value); focusField('.fbc-model-entry > button'); }} placeholder="Select model / size" options={variantOptions} searchable portal /></label><button type="button" onClick={() => onAddItem()}><Plus size={17} />Add Item <kbd aria-hidden="true">↵</kbd></button><button type="button" className="fbc-cancel-item" onClick={onCancelItem}>Cancel</button></div>
        </div>
        <p className="fbc-keyboard-hint"><kbd>F7</kbd> Quantity <span>·</span> <kbd>F8</kbd> Discount <span>·</span> <kbd>Enter</kbd> Next field <span>·</span> <kbd>F6</kbd> Product search</p>
        {errors.quickItem && <p className="fbc-error" role="alert">{errors.quickItem}</p>}
        {errors.items && <p className="fbc-error" role="alert">{errors.items}</p>}
        <div className="fbc-table-scroll"><table className="fbc-table"><thead><tr><th>#</th><th>Product / Service</th><th>Price (₹)</th><th>Qty</th><th>Discount</th><th>Total (₹)</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {items.map((item, index) => {
            const product = productForItem(item);
            const options = product?.variants || [];
            const selectedVariant = options.find((variant) => item.variantId ? String(variant._id) === String(item.variantId) : (variant.size || variant.modelName) === item.size);
            const selectedModel = selectedVariant?._id ? String(selectedVariant._id) : item.size || '';
            return <tr key={item.id}><td>{index + 1}</td><td><div className="fbc-product"><span className="fbc-image">{item.imageUrl || product?.imageUrl ? <img src={item.imageUrl || product.imageUrl} alt="" /> : <Package size={28} />}</span><div><strong>{item.description}</strong><small>{item.productCode || product?.code || item.barcode || '—'}</small>{options.length > 0 && <SelectDropdown aria-label={`Model for ${item.description}`} value={selectedModel} onChange={(value) => onVariantChange(item.id, product, value)} options={options.map((variant) => ({ value: variant._id ? String(variant._id) : variant.size || variant.modelName, label: [variant.size || variant.modelName, variant.colour, variant.material].filter(Boolean).join(' · ') }))} placeholder={item.size || 'Select model / size'} selectedLabelClassName="truncate" buttonClassName={`fbc-row-model${errors[`item_size_${index}`] ? ' has-error' : ''}`} searchable portal />}</div></div></td>
              <td><div className="fbc-price"><span>₹</span><input aria-label={`Price for ${item.description}`} type="number" min="0" step="any" value={item.rate} onChange={(event) => onItemChange(item.id, 'rate', event.target.value)} /></div></td>
              <td><div className="fbc-quantity"><button type="button" aria-label={`Decrease ${item.description} quantity`} disabled={Number(item.qty) <= 1} onClick={() => onItemChange(item.id, 'qty', Math.max(1, Number(item.qty) - 1))}><Minus size={17} /></button><input aria-label={`Quantity for ${item.description}`} type="number" min="0.00000001" step="any" value={item.qty} onChange={(event) => onItemChange(item.id, 'qty', event.target.value)} /><button type="button" aria-label={`Increase ${item.description} quantity`} onClick={() => onItemChange(item.id, 'qty', Number(item.qty) + 1)}><Plus size={19} /></button></div></td>
              <td><div className="fbc-discount"><input aria-label={`Discount for ${item.description}`} type="number" min="0" max={item.discountType === 'amount' ? undefined : '100'} step="any" value={item.discount || 0} onChange={(event) => onItemChange(item.id, 'discount', event.target.value)} /><span>{item.discountType === 'amount' ? '₹' : '%'}</span></div></td><td className="fbc-line-total">{formatCurrency(lineAmount(item))}</td><td><button type="button" className="fbc-remove" aria-label={`Remove ${item.description}`} onClick={() => onRemoveItem(item.id)}><Trash2 size={20} /></button></td></tr>;
          })}
        </tbody></table></div>
        {items.length === 0 && <div className="fbc-empty"><span><Package size={34} /></span><h2>Your sale starts here</h2><p>Scan a barcode or search for a product or service to add your first item.</p></div>}
      </section>
    </div>
    {summary}
  </div>;
}
