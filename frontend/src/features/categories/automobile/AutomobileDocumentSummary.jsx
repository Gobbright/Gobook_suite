import { DocumentSummaryCard } from '../../../components/forms/DocumentSummaryCard.jsx';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { NOTE_FORM_CONFIGS } from './automobileNoteForms.js';
import './automobileSales.css';
import './automobileDocumentSummary.css';

export function AutomobileDocumentSummary({ documentType = 'invoice', title, totalLabel, items, totals, discount, onDiscountChange, supplyType, locked = false, includeCharges = false, children }) {
  const isQuotation = documentType === 'quotation';
  const isChallan = documentType === 'delivery-challan';
  const isEInvoice = documentType === 'e-invoice';
  const noteConfig = NOTE_FORM_CONFIGS[documentType];
  const isNote = Boolean(noteConfig);
  const filteredItems = items.filter((item) => item.description);
  return <DocumentSummaryCard className="auto-sale-card auto-sale-summary auto-document-summary" title={title || (isEInvoice ? 'E-Invoice Summary' : isNote ? `${noteConfig.title} Summary` : isChallan ? 'Challan Summary' : isQuotation ? 'Quotation Summary' : 'Billing Summary')}><dl><div><dt>Total Items</dt><dd>{filteredItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}</dd></div><div><dt>Sub Total</dt><dd>{money(totals.subtotal)}</dd></div>{totals.discount > 0 && <div><dt>Line Discount</dt><dd className="red">− {money(totals.discount)}</dd></div>}<div className="auto-sale-discount"><dt>Overall Discount</dt><dd><select aria-label="Overall discount type" disabled={locked} value={discount.type} onChange={(event) => onDiscountChange({ ...discount, type: event.target.value })}><option value="percent">%</option><option value="amount">₹</option></select><input aria-label="Overall discount" type="number" disabled={locked} min="0" max={discount.type === 'percent' ? 100 : undefined} value={discount.value} placeholder="0" onChange={(event) => onDiscountChange({ ...discount, value: event.target.value })} /></dd></div><div><dt>{isChallan ? 'Item Value' : 'Taxable Amount'}</dt><dd>{money(totals.taxable + (includeCharges ? totals.chargesSubtotal : 0))}</dd></div>{!isChallan && (supplyType === 'interstate' ? <div><dt>IGST</dt><dd>{money(totals.totalGst + (includeCharges ? totals.chargesGst : 0))}</dd></div> : <><div><dt>CGST</dt><dd>{money((totals.totalGst + (includeCharges ? totals.chargesGst : 0)) / 2)}</dd></div><div><dt>SGST</dt><dd>{money((totals.totalGst + (includeCharges ? totals.chargesGst : 0)) / 2)}</dd></div></>)}{(isChallan || includeCharges) && totals.chargesSubtotal > 0 && <div><dt>Additional Charges</dt><dd>{money(totals.chargesSubtotal)}</dd></div>}{(isChallan || includeCharges) && totals.addDiscAmt > 0 && <div><dt>Overall Discount</dt><dd className="red">− {money(totals.addDiscAmt)}</dd></div>}{(isChallan || includeCharges) && totals.tdsAmt > 0 && <div><dt>TDS</dt><dd>− {money(totals.tdsAmt)}</dd></div>}{(isChallan || includeCharges) && totals.tcsAmt > 0 && <div><dt>TCS</dt><dd>{money(totals.tcsAmt)}</dd></div>}{totals.roundOff !== 0 && <div><dt>Round Off</dt><dd>{money(totals.roundOff)}</dd></div>}</dl><div className="auto-sale-grand-total"><strong>{totalLabel || (isEInvoice ? 'E-Invoice Total' : isNote ? `${noteConfig.kind} Total` : isChallan ? 'Challan Total' : isQuotation ? 'Quotation Total' : 'Grand Total')} (₹)</strong><b>{money(totals.finalTotal)}</b></div>
    {children}
  </DocumentSummaryCard>;
}
