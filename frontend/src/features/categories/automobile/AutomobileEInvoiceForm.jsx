import { Info } from 'lucide-react';
import { AutomobileNoteForm } from './AutomobileCreditNoteForm.jsx';
import './automobileEInvoiceForm.css';

const FORM_CONFIG = {
  title: 'E-Invoice', kind: 'E-Invoice', route: 'e-invoice',
  info: 'Posting uses the existing invoice workflow. IRN and acknowledgement details are saved separately; official registration requires a provider integration.',
  paymentInfo: 'These payment details are saved with the document. This form does not create a separate customer receipt.',
};
function Field({ label, children }) { return <label className="auto-sale-field"><span>{label}</span>{children}</label>; }
export function AutomobileEInvoiceForm(props) {
  const { customer, extra, onExtraChange, onCustomerFieldChange, meta, onMetaChange, invoiceTypeOptions } = props;
  const registration = <>
    <Field label="Customer GSTIN *"><input aria-label="E-invoice customer GSTIN" value={customer.gstin || ''} onChange={(event) => onCustomerFieldChange('gstin', event.target.value)} placeholder="Customer GSTIN" /></Field>
    <Field label="Recorded IRN (optional)"><input aria-label="E-invoice IRN" data-fkey="irn" value={extra.irnNumber || ''} onChange={(event) => onExtraChange('irnNumber', event.target.value)} placeholder="Paste the IRN from your provider" /></Field>
    <Field label="ACK Number"><input aria-label="E-invoice ACK number" value={extra.ackNumber || ''} onChange={(event) => onExtraChange('ackNumber', event.target.value)} placeholder="Recorded acknowledgement number" /></Field>
    <Field label="ACK Date"><input aria-label="E-invoice ACK date" type="date" value={extra.ackDate || ''} onChange={(event) => onExtraChange('ackDate', event.target.value)} /></Field>
    <Field label="Cost Center"><input aria-label="E-invoice cost center" value={extra.costCenter || ''} onChange={(event) => onExtraChange('costCenter', event.target.value)} /></Field>
    <Field label="Invoice Type"><select aria-label="E-invoice type" value={meta.invoiceType || 'regular'} onChange={(event) => onMetaChange('invoiceType', event.target.value)}>{invoiceTypeOptions.map((option) => <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value}>{typeof option === 'string' ? option : option.label}</option>)}</select></Field>
    <label className="auto-einvoice-rcm"><input type="checkbox" aria-label="E-invoice reverse charge" checked={Boolean(meta.rcm)} onChange={(event) => onMetaChange('rcm', event.target.checked)} />Reverse Charge (RCM)</label>
  </>;
  return <div className="auto-einvoice-form"><AutomobileNoteForm {...props} formConfig={FORM_CONFIG} registrationContent={registration} /><p className="auto-einvoice-registration-note"><Info size={15} />Saving or posting a document does not generate or verify an official IRN.</p></div>;
}
