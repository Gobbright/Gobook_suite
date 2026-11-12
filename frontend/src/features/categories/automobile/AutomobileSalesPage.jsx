import { DocumentQuickActions } from '../../../components/forms/DocumentQuickActions.jsx';
import { AutomobileDocumentSummary } from './AutomobileDocumentSummary.jsx';
import { NOTE_FORM_CONFIGS } from './automobileNoteForms.js';
import { debitStatus } from './automobileDebitNotes.js';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, Building2, CheckCircle2, CreditCard, Download, Eye, FileText, GripVertical, Info, Mail, MapPin, MessageCircle, PauseCircle, Phone, Plus, Printer, ScanLine, Search, Trash2, User, Wallet, Wrench, X } from 'lucide-react';
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { automobileHistoryRow, matchingAutomobileProducts } from './automobileSales.js';
import { quotationAmounts, quotationStatus } from './automobileQuotations.js';
import { creditStatus } from './automobileCreditNotes.js';
import { challanState, DELIVERY_LABELS } from './automobileChallans.js';
import './automobileSales.css';

const PAYMENT_METHODS = [['cash', 'Cash', Banknote], ['card', 'Card', CreditCard], ['upi', 'UPI', Wallet], ['bank', 'Bank Transfer', Building2], ['credit', 'Credit', Wallet]];

function Field({ label, required, children }) {
  return <label className="auto-sale-field"><span>{label}{required && <b> *</b>}</span>{children}</label>;
}



function DocumentHistory({ isQuotation, isChallan, isNote, noteConfig, isEInvoice, history, loading, error, onRetry }) {
  const route = isEInvoice ? 'e-invoice' : isNote ? noteConfig.route : isChallan ? 'delivery-challan' : isQuotation ? 'quotation' : 'invoice';
  return <section className="auto-sale-card auto-sale-history">
    <header><h2><FileText size={19} />{isEInvoice ? 'Recent E-Invoices' : isNote ? `Recent ${noteConfig.title}s` : isChallan ? 'Recent Delivery Challans' : isQuotation ? 'Recent Quotations' : 'Recent Bills / Invoice History'}</h2><Link to={`/billing/${route}`}>View all <ArrowRight size={13} /></Link></header>
    {error ? <div className="auto-sale-history-error" role="status">{error}<button type="button" onClick={onRetry}>Retry</button></div> : <div className="auto-sale-table-scroll"><table><thead><tr><th>#</th><th>{isEInvoice ? 'E-Invoice No.' : isNote ? `${noteConfig.title} No.` : isChallan ? 'Challan No.' : isQuotation ? 'Quotation No.' : 'Bill No.'}</th><th>Date</th><th>Customer</th>{isQuotation && <th>Valid Till</th>}<th>Items</th><th>Total Amount</th>{!isQuotation && !isChallan && !isNote && !isEInvoice && <><th>Received</th><th>Balance</th></>}<th>Status</th><th>Actions</th></tr></thead><tbody>{history.map((document, index) => <tr key={document.id}><td>{index + 1}</td><td><Link to={`/billing/${route}/${document.id}/${document.editable || document.status === 'Draft' ? 'edit' : 'view'}`}>{document.number}</Link></td><td>{document.date ? new Date(document.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td><td>{document.customer}</td>{isQuotation && <td>{document.validTill ? new Date(document.validTill).toLocaleDateString('en-IN') : '—'}</td>}<td>{document.items}</td><td>{money(document.total)}</td>{!isQuotation && !isChallan && !isNote && !isEInvoice && <><td>{money(document.received)}</td><td>{money(document.balance)}</td></>}<td><span className={`auto-sale-status ${document.status.toLowerCase().replaceAll(' ', '-')}`}>{document.status}</span></td><td><Link to={`/billing/${route}/${document.id}/view`} aria-label={`View ${document.number}`}><Eye size={14} /></Link></td></tr>)}</tbody></table>{!history.length && <p className="auto-sale-history-empty">{loading ? `Loading recent ${isNote ? `${noteConfig.title.toLowerCase()}s` : isChallan ? 'challans' : isQuotation ? 'quotations' : 'bills'}…` : `Your saved ${isNote ? `${noteConfig.title.toLowerCase()}s` : isChallan ? 'challans' : isQuotation ? 'quotations' : 'invoices'} will appear here.`}</p>}</div>}
  </section>;
}

export function AutomobileSalesPage({
  documentType = 'invoice', notes = '', onNotesChange, terms = '', onTermsChange, manualTotal = '', onManualTotalChange,
  user, editable = true, customers, customer, onSelectCustomer, onNewCustomer,
  products, items, onAddProduct, onAddRow, onCreateProduct, onUpdateItem, onSelectProduct, onSelectVariant, onRemoveItem, onClearItems,
  meta, onMetaChange, extra, onExtraChange, totals, lineAmounts, discount, onDiscountChange, supplyType,
  paymentMethod, receivedAmount, onPaymentMethod, onReceivedAmount, oldBalance,
  saving, saveError, errors, onSave, onPreview, onPrint, onDownload, onEmail, onWhatsApp, onScan,
  detailsContent, afterItemsContent, summaryContent, itemsContent, commonDetailsContent, commonNotesContent, paymentDetailsContent, billCustomerContent, billAddressesContent, billMoreDetailsContent, detailsExpanded,
}) {
  const referenceBillFields = documentType === 'invoice';
  const isQuotation = documentType === 'quotation';
  const isChallan = documentType === 'delivery-challan';
  const isEInvoice = documentType === 'e-invoice';
  const noteConfig = NOTE_FORM_CONFIGS[documentType];
  const isNote = Boolean(noteConfig);
  const isInvoice = !isQuotation && !isChallan && !isNote && !isEInvoice;
  const searchRef = useRef(null);
  const catalogId = useId();
  const optionRefs = useRef([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [query, setQuery] = useState('');
  const [itemType, setItemType] = useState('Product');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setHistoryLoading(true); setHistoryError('');
    (isEInvoice ? api.listEInvoices({ limit: 5, page: 1 }) : isNote ? (documentType === 'debit-note' ? api.listDebitNotes({ limit: 5, page: 1 }) : api.listCreditNotes({ limit: 5, page: 1 })) : isChallan ? api.listChallans({ limit: 5, page: 1 }) : api.listInvoices({ documentType, limit: 5, page: 1 }))
      .then((response) => { if (active) setHistory((response.data || []).map((document) => {
        const row = automobileHistoryRow(document);
        return isNote ? { ...row, status: documentType === 'debit-note' ? debitStatus(document) : creditStatus(document), editable: true } : isChallan ? { ...row, status: DELIVERY_LABELS[challanState(document)], editable: !document.extra?.convertedInvoiceId && ['draft', 'ready'].includes(challanState(document)) } : isQuotation ? { ...row, validTill: document.extra?.validTill, status: quotationStatus(document), total: quotationAmounts(document).total } : row;
      })); })
      .catch((failure) => { if (active) setHistoryError(failure.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyRefresh, documentType, isQuotation, isChallan, isNote, isEInvoice]);
  const matches = useMemo(() => matchingAutomobileProducts(products, { query, type: itemType }).slice(0, 12), [products, query, itemType]);
  const activeIndex = Math.min(highlighted, matches.length - 1);
  useEffect(() => {
    if (pickerOpen && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [pickerOpen, activeIndex]);
  const customerValue = customers.find((entry) => String(entry._id || entry.id) === String(customer._id || customer.id));
  const received = Math.max(0, Number(receivedAmount) || 0);
  const due = Math.max(0, totals.finalTotal - received);
  const locked = saving || !editable;
  const errorMessages = Object.values(errors || {}).filter((message) => typeof message === 'string');

  function openPicker(type) {
    setItemType(type); setHighlighted(-1); setPickerOpen(true); searchRef.current?.focus();
  }
  function chooseProduct(product) {
    onAddProduct(product); setQuery(''); setHighlighted(-1); searchRef.current?.focus(); setPickerOpen(false);
  }
  function submitSearch(event) {
    event.preventDefault(); event.stopPropagation();
    if (pickerOpen && matches[activeIndex]) { chooseProduct(matches[activeIndex]); return; }
    const exact = matches.find((product) => [product.description, product.code, product.partNumber, product.barcode].some((value) => String(value || '').toLowerCase() === query.trim().toLowerCase()));
    if (exact || matches.length === 1) chooseProduct(exact || matches[0]);
    else setPickerOpen(true);
  }

  function handleSearchKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      setPickerOpen(true);
      setHighlighted((index) => event.key === 'ArrowDown'
        ? Math.min(matches.length - 1, !pickerOpen || index < 0 ? 0 : index + 1)
        : Math.max(0, !pickerOpen || index < 0 ? matches.length - 1 : Math.min(index - 1, matches.length - 1)));
    } else if (event.key === 'Enter') {
      submitSearch(event);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setPickerOpen(false); setHighlighted(-1);
    } else if (event.key === 'Tab') {
      setPickerOpen(false); setHighlighted(-1);
    }
  }

  function handleMenuKeyDown(event) {
    const menu = event.target.closest('.auto-sale-menu');
    if (!menu) return;
    const summary = menu.querySelector('summary');
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation(); menu.open = true;
      const index = buttons.indexOf(document.activeElement);
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); menu.open = false; summary?.focus();
    }
  }

  const partyDetails = (<div className="auto-sale-party-details"><div className="auto-sale-party-info"><div><span className="auto-sale-square purple"><User size={19} /></span><strong>{customer.name || 'Select a customer'}</strong>{customer.name && <small>Customer</small>}</div><div className={`auto-sale-party-bottom${!isInvoice ? ' auto-quotation-party-bottom' : ''}`}><div><span><Phone size={13} />{customer.phone || 'No phone added'}</span><span><MapPin size={13} />{[customer.city, customer.state].filter(Boolean).join(', ') || 'No address added'}</span></div>{isInvoice && <><div><small>Current Balance</small><b className="green">{money(oldBalance)}</b></div><div><small>Credit Limit</small><b>{customer.creditLimit != null ? money(customer.creditLimit) : 'Not set'}</b></div></>}</div></div>
      </div>);

  return <div className={`auto-sales-page${referenceBillFields ? ' auto-bill-reference-fields' : ''}${isChallan ? ' auto-challan-form' : ''}`} onKeyDown={handleMenuKeyDown}>
    <header className="auto-sale-header"><div><h1>{isEInvoice ? 'E-Invoice' : isNote ? noteConfig.title : isChallan ? 'Delivery Challan' : isQuotation ? 'Quotation' : 'Bills'}</h1>{referenceBillFields && <fieldset disabled={locked} className="auto-bill-header-meta"><input aria-label="Bill number" data-fkey="doc-number" value={meta.number} onChange={(event) => onMetaChange('number', event.target.value)} /><input aria-label="Invoice date" data-fkey="doc-date" type="date" value={meta.date} onChange={(event) => onMetaChange('date', event.target.value)} /></fieldset>}</div><div className="auto-sale-header-actions">
      {isEInvoice && <Link className="auto-sale-list-link" to="/billing/e-invoice"><ArrowRight size={15} />All E-Invoices</Link>}
      {isNote && <Link className="auto-sale-list-link" to={`/billing/${noteConfig.route}`}><ArrowRight size={15} />All {noteConfig.title}s</Link>}
      {isChallan && <Link className="auto-sale-list-link" to="/billing/delivery-challan"><ArrowRight size={15} />All Challans</Link>}
      {isQuotation && <Link className="auto-sale-list-link" to="/billing/quotation"><ArrowRight size={15} />All Quotations</Link>}
      {!isNote && <button className="app-save-button" type="button" disabled={locked} onClick={() => onSave({ saveAsDraft: true })}>Save</button>}
      <DocumentQuickActions disabled={saving} actions={[
        { id: 'print-a4', label: 'Print A4', onSelect: () => onPrint('normal') },
        ...(isInvoice ? [{ id: 'print-thermal', label: 'Print Thermal', onSelect: () => onPrint('thermal80') }] : []),
        { id: 'pdf', label: 'Download PDF', onSelect: onDownload },
        { id: 'whatsapp', label: 'WhatsApp', onSelect: onWhatsApp },
        { id: 'email', label: 'Email PDF', onSelect: onEmail },
      ]} />
      {isInvoice && <button type="button" disabled={locked} onClick={() => onSave({ saveAsDraft: true })} title="Hold this bill as a draft without changing stock"><PauseCircle size={16} />Hold Bill</button>}


      <button type="button" className="app-save-button auto-sale-primary" disabled={locked} onClick={() => onSave()}>{saving ? 'Saving…' : isEInvoice ? 'Save' : isNote ? 'Save' : isChallan ? 'Save' : isQuotation ? 'Save' : 'Confirm Bill'}</button>
    </div></header>
    {!editable && <div className="auto-sale-notice"><Info size={17} />{isChallan ? 'This challan is dispatched or linked to a bill. View or print it here; manage delivery from the challan list.' : 'This invoice is posted. View or print it here; use the invoice workflow to make further changes.'}</div>}
    {(saveError || errorMessages.length > 0) && <div className="auto-sale-error" role="alert" data-validation-error>{saveError || errorMessages.join(' · ')}</div>}
    <div className="auto-sale-layout"><div className="auto-sale-main">
      <section className="auto-sale-card auto-sale-customer-card"><fieldset disabled={locked}><div className="auto-sale-details-grid">
        {referenceBillFields ? billCustomerContent : <div className="auto-sale-customer-select"><span className="auto-sale-square"><User size={23} /></span><Field label="Customer" required><select data-fkey="party" aria-label="Customer" value={customerValue ? String(customerValue._id || customerValue.id) : ''} onChange={(event) => { const entry = customers.find((row) => String(row._id || row.id) === event.target.value); if (entry) onSelectCustomer(entry); }}><option value="">{customer.name || 'Select customer'}</option>{customers.map((entry) => <option key={entry._id || entry.id} value={entry._id || entry.id}>{entry.name}{entry.phone ? ` · ${entry.phone}` : ''}</option>)}</select></Field><button type="button" onClick={onNewCustomer}><Plus size={17} />New Customer</button></div>}
        {referenceBillFields ? billAddressesContent : <>
        <Field label={isEInvoice ? 'E-Invoice No.' : isNote ? `${noteConfig.title} No.` : isChallan ? 'Challan No.' : isQuotation ? 'Quotation No.' : 'Bill No.'} required><input aria-label={isEInvoice ? 'E-invoice number' : isNote ? `${noteConfig.kind} note number` : isChallan ? 'Challan number' : isQuotation ? 'Quotation number' : 'Bill number'} data-fkey="doc-number" value={meta.number} onChange={(event) => onMetaChange('number', event.target.value)} /></Field>
        <Field label={isNote ? `${noteConfig.title} Date` : isChallan ? 'Challan Date' : isQuotation ? 'Quotation Date' : 'Invoice Date'} required><input aria-label={isNote ? `${noteConfig.kind} note date` : isChallan ? 'Challan date' : isQuotation ? 'Quotation date' : 'Invoice date'} data-fkey="doc-date" type="date" value={meta.date} onChange={(event) => onMetaChange('date', event.target.value)} /></Field>
        {isQuotation ? <Field label="Valid Till" required><input aria-label="Valid till" type="date" min={meta.date || undefined} value={extra.validTill || ''} onChange={(event) => onExtraChange('validTill', event.target.value)} /></Field> : <Field label="Sales Person"><input aria-label="Sales person" placeholder={user.name || 'Name'} value={extra.salesPerson ?? user.name ?? ''} onChange={(event) => onExtraChange('salesPerson', event.target.value)} /></Field>}
        </>}
      </div>{!referenceBillFields && partyDetails}{referenceBillFields && <>{billMoreDetailsContent}{detailsExpanded && <><Field label="Sales Person"><input aria-label="Sales person" value={extra.salesPerson ?? user.name ?? ''} onChange={(event) => onExtraChange('salesPerson', event.target.value)} /></Field>{partyDetails}</>}</>}</fieldset></section>
      {detailsContent}
      {!referenceBillFields && commonDetailsContent && <fieldset disabled={locked}>{commonDetailsContent}</fieldset>}
      <section className="auto-sale-card auto-sale-items"><fieldset disabled={locked}>
        {itemsContent || <>
        <div className="auto-sale-product-tools"><button type="button" className={itemType === 'Product' ? 'selected' : ''} onClick={() => openPicker('Product')}><Plus size={17} />Add Product</button><button type="button" className={itemType === 'Service' ? 'selected' : ''} onClick={() => openPicker('Service')}><Plus size={17} />Add Service</button><div className="auto-sale-search"><form onSubmit={submitSearch}><Search size={17} /><input ref={searchRef} aria-label="Search product or service" role="combobox" aria-autocomplete="list" aria-expanded={pickerOpen} aria-controls={pickerOpen ? `${catalogId}-results` : undefined} aria-activedescendant={pickerOpen && activeIndex >= 0 ? `${catalogId}-option-${activeIndex}` : undefined} autoComplete="off" placeholder="Scan barcode or search product name, SKU or part number…" value={query} onFocus={() => setPickerOpen(true)} onChange={(event) => { setQuery(event.target.value); setHighlighted(-1); setPickerOpen(true); }} onKeyDown={handleSearchKeyDown} /><button type="button" aria-label="Scan barcode" onClick={onScan}><ScanLine size={18} /></button></form>{pickerOpen && <div className="auto-sale-catalog" id={`${catalogId}-results`} role="listbox" aria-label={itemType === 'Service' ? 'Services' : 'Products'}><header><strong>{itemType === 'Service' ? 'Services' : 'Products'}</strong><button type="button" aria-label="Close product search" onClick={() => setPickerOpen(false)}><X size={15} /></button></header>{matches.map((product, index) => <button type="button" role="option" aria-selected={index === activeIndex} id={`${catalogId}-option-${index}`} ref={(node) => { optionRefs.current[index] = node; }} tabIndex={-1} onMouseEnter={() => setHighlighted(index)} className={`auto-sale-catalog-option${index === activeIndex ? ' selected' : ''}`} key={product._id || product.id} onClick={() => chooseProduct(product)}><span><strong>{product.description || product.name}</strong><small>{product.partNumber || product.code || product.sku || 'No SKU'}{product.itemType !== 'Service' ? ` · Stock: ${Number(product.stock) || 0}` : ' · Service'}</small></span><b>{money(product.rate)}</b></button>)}{!matches.length && <p>No matching {itemType.toLowerCase()} found.</p>}<button type="button" className="auto-sale-create-product" onClick={() => { setPickerOpen(false); onCreateProduct(itemType); }}><Plus size={15} />Create new {itemType.toLowerCase()}</button></div>}</div></div>
        <datalist id={catalogId}>{products.map((product) => <option key={product._id || product.id} value={product.description}>{product.partNumber || product.code}</option>)}</datalist>
        <div className="auto-sale-table-scroll"><table className="auto-sale-line-table"><thead><tr><th aria-label="Row" /><th>#</th><th>Product / Service</th><th>SKU / Part No.</th><th>HSN / SAC</th><th>Qty</th><th>Available<br />Stock</th><th>Unit Price (₹)</th><th>{isNote ? 'Discount' : 'Discount (%)'}</th><th hidden={isChallan}>Tax</th><th>Amount (₹)</th><th aria-label="Delete" /></tr></thead><tbody>{items.map((item, index) => {
          const product = products.find((entry) => String(entry._id || entry.id) === String(item.productId));
          const variants = product?.variants || [];
          const variant = variants.find((entry) => [entry.size, entry.modelName, entry._id].some((value) => value && String(value) === String(item.size)));
          const stock = variant?.stock ?? product?.stock;
          const line = lineAmounts(item);
          return <tr key={item.id}><td><GripVertical size={15} /></td><td>{index + 1}</td><td><input aria-label={`Product name row ${index + 1}`} list={catalogId} placeholder="Product or service name" value={item.description || ''} onChange={(event) => { const value = event.target.value; onUpdateItem(item.id, 'description', value); const found = products.find((entry) => entry.description === value); if (found) onSelectProduct(item.id, found); }} />{variants.length > 0 && <select aria-label={`Variant row ${index + 1}`} value={item.size || ''} onChange={(event) => onSelectVariant(item.id, product, event.target.value)}><option value="">Select variant</option>{variants.map((entry) => <option key={entry._id || entry.size || entry.modelName} value={entry.size || entry.modelName}>{entry.size || entry.modelName}</option>)}</select>}</td><td>{product?.partNumber || item.productCode || '—'}</td><td><input aria-label={`HSN row ${index + 1}`} value={item.hsn || ''} onChange={(event) => onUpdateItem(item.id, 'hsn', event.target.value)} /></td><td><input aria-label={`Quantity row ${index + 1}`} type="number" min="0.001" step="any" value={item.qty} onChange={(event) => onUpdateItem(item.id, 'qty', event.target.value)} />{(isChallan || isNote || isEInvoice) && <input aria-label={`Unit row ${index + 1}`} value={item.unit || ''} placeholder="Unit" onChange={(event) => onUpdateItem(item.id, 'unit', event.target.value)} />}</td><td className={Number(stock) > 0 ? 'green' : 'red'}>{item.itemType === 'Service' || stock == null ? '—' : stock}</td><td><input aria-label={`Unit price row ${index + 1}`} type="number" min="0" step="any" value={item.rate} onChange={(event) => onUpdateItem(item.id, 'rate', event.target.value)} /></td><td><input aria-label={`Discount row ${index + 1}`} type="number" min="0" max={isNote && item.discountType === 'amount' ? undefined : 100} step="any" value={item.discount} onChange={(event) => onUpdateItem(item.id, 'discount', event.target.value)} />{isNote && <select aria-label={`Discount type row ${index + 1}`} value={item.discountType || 'percent'} onChange={(event) => onUpdateItem(item.id, 'discountType', event.target.value)}><option value="percent">%</option><option value="amount">&#8377;</option></select>}</td><td hidden={isChallan}><select aria-label={`Tax row ${index + 1}`} value={item.gstRate ?? ''} onChange={(event) => onUpdateItem(item.id, 'gstRate', event.target.value)}><option value="">Select GST</option>{[0, 5, 12, 18, 28].map((rate) => <option key={rate} value={rate}>{rate}% GST</option>)}</select></td><td><strong>{money(line.total)}</strong></td><td><button type="button" aria-label={`Remove row ${index + 1}`} onClick={() => onRemoveItem(item.id)}><Trash2 size={15} /></button></td></tr>;
        })}</tbody></table>{!items.length && <div className="auto-sale-empty"><Wrench size={25} /><strong>{isNote ? `Your ${noteConfig.title.toLowerCase()} starts here` : isChallan ? 'Your challan starts here' : isQuotation ? 'Your quotation starts here' : 'Your bill starts here'}</strong><span>Search for a part, scan a barcode, or add a service.</span></div>}</div>
        <footer className="auto-sale-items-footer"><div><button type="button" onClick={() => onAddRow('Product')}><Plus size={16} />Add Row</button><button type="button" onClick={() => openPicker('Product')}><Plus size={16} />Add Product</button><button type="button" onClick={() => openPicker('Service')}><Plus size={16} />Add Service</button></div><button type="button" disabled={!items.length} onClick={onClearItems}><Trash2 size={15} />Clear All</button></footer>
        </>}
      </fieldset></section>
      {isQuotation && !commonNotesContent && <section className="auto-sale-card auto-quotation-notes"><fieldset disabled={locked}><h2><FileText size={18} />Quotation Details</h2><div><Field label="Notes"><textarea aria-label="Quotation notes" rows={3} placeholder="Additional details for the customer" value={notes} onChange={(event) => onNotesChange(event.target.value)} /></Field><Field label="Terms & Conditions"><textarea aria-label="Quotation terms" rows={3} placeholder="Pricing, delivery and payment terms" value={terms} onChange={(event) => onTermsChange(event.target.value)} /></Field></div><Field label="Sales Person"><input aria-label="Sales person" value={extra.salesPerson ?? user.name ?? ''} onChange={(event) => onExtraChange('salesPerson', event.target.value)} /></Field></fieldset></section>}
      {commonNotesContent && <fieldset disabled={locked}>{commonNotesContent}</fieldset>}
      {afterItemsContent}
      <DocumentHistory isEInvoice={isEInvoice} isNote={isNote} noteConfig={noteConfig} isQuotation={isQuotation} isChallan={isChallan} history={history} loading={historyLoading} error={historyError} onRetry={() => setHistoryRefresh((value) => value + 1)} />
    </div><aside className="auto-sale-aside"><AutomobileDocumentSummary includeCharges={isInvoice || isQuotation} documentType={documentType} items={items} totals={totals} discount={discount} onDiscountChange={onDiscountChange} supplyType={supplyType} locked={locked}>
      {isQuotation && <fieldset disabled={locked} className="auto-quotation-actions"><Field label="Quotation Status"><select aria-label="Quotation status" value={extra.quotationStatus || extra.status || 'Draft'} disabled={Boolean(extra.convertedInvoiceId)} onChange={(event) => onExtraChange('quotationStatus', event.target.value)}>{['Draft', 'Sent', 'Accepted', 'Rejected', ...(extra.convertedInvoiceId ? ['Converted'] : [])].map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>{manualTotal !== '' && <Field label="Adjusted quotation total"><input aria-label="Adjusted quotation total" type="number" min="0" step="any" value={manualTotal} onChange={(event) => onManualTotalChange(event.target.value)} /><button type="button" onClick={() => onManualTotalChange('')}>Use calculated total</button></Field>}<button type="button" className="app-save-button auto-sale-primary auto-sale-confirm" onClick={() => onSave()}>{saving ? 'Saving?' : 'Save'}</button></fieldset>}
      {(isChallan || isNote || isEInvoice) && <>{summaryContent}<button type="button" className="app-save-button auto-sale-primary auto-sale-confirm" disabled={locked} onClick={() => onSave()}>{saving ? 'Saving...' : 'Save'}</button></>}
      {isInvoice && (<fieldset disabled={locked} className="auto-invoice-payment"><div className="auto-sale-received"><label htmlFor={`${catalogId}-received`}>Received Amount</label><div className="auto-invoice-received-input"><span>₹</span><input id={`${catalogId}-received`} type="number" min="0" step="any" disabled={paymentMethod === 'credit'} value={receivedAmount} placeholder="0.00" onChange={(event) => onReceivedAmount(event.target.value)} /></div></div><div className="auto-sale-balance"><span>Balance Due</span><b className="green">{money(due)}</b></div>{received > totals.finalTotal && <div className="auto-sale-balance"><span>Change</span><b>{money(received - totals.finalTotal)}</b></div>}<h3>Payment Method</h3><div className="auto-sale-payment-methods">{PAYMENT_METHODS.map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={paymentMethod === id} className={paymentMethod === id ? 'selected' : ''} onClick={() => onPaymentMethod(id)}><Icon size={17} />{label}</button>)}</div></fieldset>)}
      {isInvoice && <button type="button" className="auto-sale-primary auto-sale-confirm auto-invoice-confirm" disabled={locked} onClick={() => onSave()}><CheckCircle2 size={18} />{saving ? 'Saving…' : 'Confirm Sale'}</button>}
      {paymentDetailsContent && <fieldset disabled={locked}>{paymentDetailsContent}</fieldset>}
      {documentType !== 'invoice' && <div className="auto-sale-print-options">{!isInvoice ? <button type="button" onClick={onPreview}><Eye size={15} />Preview</button> : <button type="button" onClick={() => onPrint('thermal80')}><Printer size={15} />Print (Thermal)</button>}<button type="button" onClick={() => onPrint('normal')}><Printer size={15} />Print (A4)</button></div>}{documentType !== 'invoice' && <><div className="auto-sale-share-options"><button type="button" onClick={onDownload}><Download size={14} />Download PDF</button><button type="button" onClick={onWhatsApp}><MessageCircle size={14} />WhatsApp</button><button type="button" onClick={onEmail}><Mail size={14} />Email</button></div><p className="auto-sale-info"><Info size={18} />{isEInvoice ? 'Posting follows the invoice workflow. Official IRN registration is managed separately.' : isNote ? noteConfig.info : isChallan ? 'Saving a challan does not change stock, accounts or payments. Track delivery and convert it to a linked draft bill from the challan list.' : isQuotation ? 'Saving a quotation does not change stock or record a payment. Convert accepted quotations to bills from the quotation list.' : 'On confirmation, stock and customer balances update through your saved invoice.'}</p></>}</AutomobileDocumentSummary>

    </aside></div>
  </div>;
}
