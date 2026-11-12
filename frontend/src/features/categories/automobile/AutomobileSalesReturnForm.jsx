import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calculator, Download, Eye, FileText, Info, Mail, MapPin, MessageCircle, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, User } from 'lucide-react';
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { returnAmounts, returnLineAvailability, returnStatus } from './automobileSalesReturns.js';
import './automobileSales.css';
import './automobileSalesReturnForm.css';

function Field({ label, required, children }) { return <label className="auto-sale-field"><span>{label}{required && <b> *</b>}</span>{children}</label>; }

function OriginalInvoicePicker({ invoiceId, returnId, source, onSelect, onLoaded, onLoading, disabled }) {
  const [open, setOpen] = useState(!invoiceId);
  const [search, setSearch] = useState(''); const [date, setDate] = useState('');
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false); const [detailLoading, setDetailLoading] = useState(false); const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(''); const [listError, setListError] = useState(''); const [refresh, setRefresh] = useState(0); const [highlighted, setHighlighted] = useState(-1);
  const searchRef = useRef(null); const toggleRef = useRef(null); const optionRefs = useRef([]); const handlers = useRef({ onSelect, onLoaded, onLoading });
  const menuId = useId(); const activeIndex = Math.min(highlighted, rows.length - 1);
  useEffect(() => { handlers.current = { onSelect, onLoaded, onLoading }; }, [onSelect, onLoaded, onLoading]);
  useEffect(() => { handlers.current.onLoading(detailLoading || choosing); }, [detailLoading, choosing]);
  useEffect(() => {
    let active = true;
    if (!invoiceId) { handlers.current.onLoaded(null); return undefined; }
    setDetailLoading(true); setError('');
    api.getSalesReturnInvoice(invoiceId, returnId).then((invoice) => { if (active) { handlers.current.onLoaded(invoice); setOpen(false); } })
      .catch((failure) => { if (active) { handlers.current.onLoaded(null); setError(failure.message || 'Unable to load original invoice.'); } })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [invoiceId, returnId, refresh]);
  useEffect(() => {
    if (!open) return undefined;
    let active = true; setLoading(true); setListError('');
    const timer = setTimeout(() => {
      api.listSalesReturnInvoices({ search, date, page: 1 }).then((response) => { if (active) setRows(Array.isArray(response.data) ? response.data : []); })
        .catch((failure) => { if (active) { setRows([]); setListError(failure.message || 'Unable to search invoices.'); } })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [open, search, date, refresh]);
  useEffect(() => { if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' }); }, [open, activeIndex]);
  async function choose(id) {
    if (choosing || disabled) return;
    setChoosing(true); setError('');
    try {
      const invoice = await api.getSalesReturnInvoice(id, returnId);
      if (!(invoice.items || []).some((item) => Number(item.remainingQty) > 0)) throw new Error('This invoice has already been fully returned.');
      handlers.current.onSelect(invoice); handlers.current.onLoaded(invoice); setOpen(false); setHighlighted(-1); toggleRef.current?.focus();
    } catch (failure) { setError(failure.message || 'Unable to select invoice.'); }
    finally { setChoosing(false); }
  }
  function keyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      setHighlighted((index) => event.key === 'ArrowDown' ? Math.min(rows.length - 1, index < 0 ? 0 : index + 1) : Math.max(0, index < 0 ? rows.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); if (rows[activeIndex]) choose(rows[activeIndex]._id || rows[activeIndex].id);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setOpen(false); toggleRef.current?.focus();
    }
  }
  return <section className="auto-sale-card auto-return-invoice-picker">
    <header><h2><FileText size={19} />Original Sales Invoice <b>*</b></h2><button ref={toggleRef} type="button" disabled={disabled || choosing} onClick={() => { setOpen((value) => !value); setHighlighted(-1); setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={15} />{open ? 'Hide Search' : source ? 'Change Invoice' : 'Find Invoice'}</button></header>
    <p>Select the original invoice to copy the customer, original prices, discounts and tax. Only the remaining quantities can be returned.</p>
    {source && <div className="auto-return-selected-invoice"><strong>{source.number}</strong><span>{source.customer?.name}</span><span>{source.meta?.date || '—'}</span><b>{money(source.totals?.finalTotal ?? source.totals?.grandTotal ?? 0)}</b></div>}
    {detailLoading && <p role="status">Loading invoice details…</p>}
    {error && <div className="auto-sale-error" role="alert">{error}<button type="button" disabled={disabled || detailLoading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} />Retry</button></div>}
    {open && <fieldset disabled={disabled || choosing}><div className="auto-return-invoice-search"><Field label="Invoice Date"><input aria-label="Filter original invoice date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setHighlighted(-1); }} /></Field><Field label="Search Invoice"><input ref={searchRef} aria-label="Search original invoices" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={menuId} aria-activedescendant={activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined} placeholder="Invoice number, customer or phone…" value={search} onChange={(event) => { setSearch(event.target.value); setHighlighted(-1); }} onKeyDown={keyDown} /></Field><button type="button" onClick={() => { setSearch(''); setDate(''); setHighlighted(-1); }}>Clear</button></div>
      {listError ? <div role="alert" className="auto-sale-error">{listError}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry Search</button></div> : <div className="auto-return-invoice-results" id={menuId} role="listbox" aria-label="Original sales invoices">{loading ? <p>Searching invoices…</p> : rows.length ? rows.map((invoice, index) => <button type="button" role="option" id={`${menuId}-${index}`} key={invoice._id || invoice.id} ref={(node) => { optionRefs.current[index] = node; }} aria-selected={index === activeIndex} tabIndex={-1} className={index === activeIndex ? 'selected' : ''} onMouseEnter={() => setHighlighted(index)} onKeyDown={keyDown} onClick={() => choose(invoice._id || invoice.id)}><span><strong>{invoice.number}</strong><small>{invoice.customer?.name || 'Walk-in customer'} · {invoice.meta?.date || '—'}</small></span><b>{money(invoice.totals?.finalTotal ?? invoice.totals?.grandTotal ?? 0)}</b></button>) : <p>No invoices found. Try another date or search.</p>}</div>}
    </fieldset>}
  </section>;
}

export function AutomobileSalesReturnForm({ invoiceId, editable, customer, meta, extra, items, source, status, totals, lineAmounts, notes, internalNotes, terms, saving, saveError, errors, onSelectSource, onSourceLoaded, onMetaChange, onExtraChange, onQuantityChange, onRemoveItem, onClearItems, onNotesChange, onInternalNotesChange, onTermsChange, onSave, onPreview, onPrint, onDownload, onEmail, onWhatsApp }) {
  const [sourceLoading, setSourceLoading] = useState(false); const [history, setHistory] = useState([]); const [historyError, setHistoryError] = useState(''); const [historyRefresh, setHistoryRefresh] = useState(0);
  const locked = saving || !editable; const documentErrors = Object.values(errors || {}).filter((value) => typeof value === 'string');
  useEffect(() => { let active = true; setHistoryError(''); api.listSalesReturns({ page: 1, limit: 5 }).then((response) => { if (active) setHistory(response.data || []); }).catch((failure) => { if (active) setHistoryError(failure.message || 'Unable to load recent returns.'); }); return () => { active = false; }; }, [historyRefresh]);
  const hasSource = source && String(source._id || source.id) === String(extra.originalSalesId);
  const validItems = items.filter((item) => item.description);
  return <div className="auto-sales-page auto-return-form">
    <header className="auto-sale-header"><h1>Sales Return</h1><div className="auto-sale-header-actions"><Link className="auto-sale-list-link" to="/billing/sales-return"><ArrowLeft size={15} />All Returns</Link><button type="button" onClick={onPreview}><Eye size={16} />Preview</button><button type="button" onClick={onPrint}><Printer size={16} />Print</button><button type="button" className="app-save-button auto-sale-primary" disabled={locked || sourceLoading} onClick={() => onSave()}>{saving ? 'Saving…' : 'Save'}</button></div></header>
    {!editable && <div className="auto-sale-notice"><Info size={17} />This return has been received or completed. Review it here, or open its workflow from the return list.</div>}
    {(saveError || documentErrors.length > 0) && <div className="auto-sale-error" role="alert" data-validation-error>{saveError || documentErrors.join(' · ')}</div>}
    <div className="auto-sale-layout"><div className="auto-sale-main">
      <section className="auto-sale-card auto-return-document-details"><fieldset disabled={locked}><div className="auto-sale-details-grid"><div className="auto-return-customer"><span className="auto-sale-square"><User size={22} /></span><Field label="Customer"><input aria-label="Return customer" readOnly value={customer.name || ''} placeholder="Copied from original invoice" /></Field></div><Field label="Return No." required><input aria-label="Return number" data-fkey="doc-number" value={meta.number} onChange={(event) => onMetaChange('number', event.target.value)} /></Field><Field label="Return Date" required><input aria-label="Return date" data-fkey="doc-date" type="date" min={extra.originalInvoiceDate || undefined} value={meta.date} onChange={(event) => onMetaChange('date', event.target.value)} /></Field><Field label="Original Invoice Date"><input aria-label="Original invoice date" type="date" value={extra.originalInvoiceDate || ''} readOnly /></Field></div><div className="auto-return-customer-info"><strong>{customer.name || 'Select an original invoice'}</strong><span><MapPin size={13} />{[customer.address, customer.city, customer.state].filter(Boolean).join(', ') || 'Customer details will appear here'}</span><span>{customer.phone || 'No phone added'}{customer.gstin ? ` · GSTIN: ${customer.gstin}` : ''}</span></div></fieldset></section>
      <OriginalInvoicePicker invoiceId={extra.originalSalesId} returnId={invoiceId} source={hasSource ? source : null} onSelect={onSelectSource} onLoaded={onSourceLoaded} onLoading={setSourceLoading} disabled={locked} />
      <section className="auto-sale-card auto-sale-items auto-return-items"><header><h2><RotateCcw size={18} />Items to Return</h2><div><button type="button" disabled={locked || sourceLoading || !hasSource} onClick={() => onSelectSource(source)}><Plus size={15} />Restore Invoice Items</button><button type="button" disabled={locked || !items.length} onClick={onClearItems}><Trash2 size={14} />Clear All</button></div></header><p>Change return quantities or remove items the customer is keeping. Product names, variants, rates, discounts and GST stay as invoiced.</p><fieldset disabled={locked || sourceLoading}><div className="auto-sale-table-scroll"><table className="auto-sale-line-table auto-return-line-table"><thead><tr><th>#</th><th>Product / Service</th><th>SKU / Part No.</th><th>HSN / SAC</th><th>Sold</th><th>Previously Returned</th><th>Available to Return</th><th>Return Qty</th><th>Invoice Rate</th><th>Discount %</th><th>GST %</th><th>Amount</th><th /></tr></thead><tbody>{items.map((item, index) => { const availability = hasSource ? returnLineAvailability(item, source.items, items) : null; return <tr key={item.id}><td>{index + 1}</td><td><strong>{item.description}</strong>{item.size && <small>Variant: {item.size}</small>}{item.itemType === 'Service' && <small>Service</small>}</td><td>{item.productCode || '—'}</td><td>{item.hsn || '—'}</td><td>{availability?.sold ?? '—'}</td><td>{availability?.returned ?? '—'}</td><td>{availability?.available ?? '—'}</td><td><input aria-label={`Return quantity for ${item.description}`} aria-invalid={Boolean(errors?.[`item_qty_${index}`])} type="number" min="0.001" max={availability?.maximum} step="any" value={item.qty} onChange={(event) => onQuantityChange(item.id, event.target.value, index)} /></td><td>{money(item.rate)}</td><td>{Number(item.discount || 0).toFixed(2)}</td><td>{item.gstRate || 0}%</td><td><strong>{money(lineAmounts(item).total)}</strong></td><td><button type="button" aria-label={`Remove ${item.description}`} onClick={() => onRemoveItem(item.id)}><Trash2 size={15} /></button></td></tr>; })}</tbody></table>{!items.length && <div className="auto-sale-empty"><RotateCcw size={26} /><strong>{hasSource ? 'No items selected for return' : 'Select the original sales invoice'}</strong><span>{hasSource ? 'Restore invoice items above, then keep only the items being returned.' : 'Returnable products and services will appear here.'}</span></div>}</div></fieldset></section>
      <section className="auto-sale-card auto-quotation-notes auto-return-notes"><fieldset disabled={locked}><h2><FileText size={18} />Return Details</h2><Field label="Reason for Return" required><textarea aria-label="Reason for return" data-fkey="reason" rows={2} value={extra.reason || ''} placeholder="Why is the customer returning these items?" onChange={(event) => onExtraChange('reason', event.target.value)} /></Field><div><Field label="Notes to Customer"><textarea aria-label="Return notes" rows={3} value={notes} onChange={(event) => onNotesChange(event.target.value)} /></Field><Field label="Terms & Conditions"><textarea aria-label="Return terms" rows={3} value={terms} onChange={(event) => onTermsChange(event.target.value)} /></Field></div><Field label="Internal Notes"><textarea aria-label="Internal return notes" rows={2} placeholder="Not shown on the return document" value={internalNotes} onChange={(event) => onInternalNotesChange(event.target.value)} /></Field></fieldset></section>
      <section className="auto-sale-card auto-sale-history"><header><h2><FileText size={18} />Recent Sales Returns</h2><Link to="/billing/sales-return">View all<ArrowRight size={13} /></Link></header>{historyError ? <div className="auto-sale-history-error">{historyError}<button type="button" onClick={() => setHistoryRefresh((value) => value + 1)}>Retry</button></div> : <div className="auto-sale-table-scroll"><table><thead><tr><th>Return No.</th><th>Date</th><th>Customer</th><th>Original Invoice</th><th>Amount</th><th>Status</th></tr></thead><tbody>{history.map((note) => <tr key={note._id || note.id}><td><Link to={`/billing/sales-return/${note._id || note.id}/view`}>{note.number}</Link></td><td>{note.meta?.date || '—'}</td><td>{note.customer?.name || '—'}</td><td>{note.extra?.originalInvoiceNo || '—'}</td><td>{money(returnAmounts(note).total)}</td><td>{returnStatus(note)}</td></tr>)}</tbody></table>{!history.length && <p className="auto-sale-history-empty">Saved return requests will appear here.</p>}</div>}</section>
    </div><aside className="auto-sale-aside"><section className="auto-sale-card auto-sale-summary"><h2><Calculator size={19} />Return Summary</h2><dl><div><dt>Total Lines</dt><dd>{validItems.length}</dd></div><div><dt>Return Quantity</dt><dd>{validItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}</dd></div><div><dt>Sub Total</dt><dd>{money(totals.subtotal)}</dd></div>{totals.discount > 0 && <div><dt>Original Discount</dt><dd className="red">− {money(totals.discount)}</dd></div>}<div><dt>Taxable Amount</dt><dd>{money(totals.taxable)}</dd></div>{source?.supplyType === 'interstate' ? <div><dt>IGST</dt><dd>{money(totals.totalGst)}</dd></div> : <><div><dt>CGST</dt><dd>{money(totals.totalGst / 2)}</dd></div><div><dt>SGST</dt><dd>{money(totals.totalGst / 2)}</dd></div></>}{totals.roundOff !== 0 && <div><dt>Round Off</dt><dd>{money(totals.roundOff)}</dd></div>}</dl><div className="auto-sale-grand-total"><strong>Return Total</strong><b>{money(totals.finalTotal)}</b></div><div className="auto-return-workflow-summary"><span>Workflow</span><strong>{status === 'requested' ? 'Return Request' : status === 'received' ? 'Received · Inspection Pending' : 'Completed'}</strong></div><button type="button" className="app-save-button auto-sale-primary auto-sale-confirm" disabled={locked || sourceLoading} onClick={() => onSave()}>{saving ? 'Saving…' : 'Save'}</button><div className="auto-sale-print-options"><button type="button" onClick={onPreview}><Eye size={15} />Preview</button><button type="button" onClick={onPrint}><Printer size={15} />Print (A4)</button></div><div className="auto-sale-share-options"><button type="button" onClick={onDownload}><Download size={14} />Download PDF</button><button type="button" onClick={onWhatsApp}><MessageCircle size={14} />WhatsApp</button><button type="button" onClick={onEmail}><Mail size={14} />Email</button></div><p className="auto-sale-info"><Info size={18} />Saving requests a return. Stock and customer credit change only after goods receipt and inspection approval in the Sales Return list.</p></section>
    <section className="auto-sale-card auto-sale-preview"><h2><FileText size={17} />Sales Return Preview</h2><button type="button" className="auto-sale-paper" aria-label="Open full sales return preview" onClick={onPreview}><div><b>SALES RETURN</b><small>{meta.number}</small></div><strong>{customer.name || 'Customer name'}</strong><span>{meta.date}</span><div className="auto-sale-paper-items">{validItems.slice(0, 4).map((item) => <p key={item.id}><span>{item.description}</span><b>× {item.qty}</b></p>)}</div><p className="auto-sale-paper-total"><span>Return Total</span><b>{money(totals.finalTotal)}</b></p></button><button type="button" className="auto-sale-preview-link" onClick={onPreview}>View Full Return<ArrowRight size={13} /></button></section>
    </aside></div>
  </div>;
}
