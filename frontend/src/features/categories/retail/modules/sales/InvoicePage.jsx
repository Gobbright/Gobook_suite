import { useRequireBusinessEmail } from '../../../../../hooks/useRequireBusinessEmail.js';
import { AutomobileInvoiceList } from '../../../automobile/AutomobileInvoiceList.jsx';
import { useAutomobileListingLayout } from '../../../../../hooks/useAutomobileListingLayout.js';
import { SalesWorkflowDialog } from './shared/SalesWorkflowDialog.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoiceActionIds, invoicePaymentSummary } from '../../../../../utils/invoicePayment.js';
import {
  Calendar, Download, Eye, FileText, IndianRupee,
  MoreVertical, Pencil, Plus, Search, Share2, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { api } from '../../../../../services/api.js';
import { DateRangeFilter } from '../../../../../components/forms/DateRangeFilter.jsx';
import { ExportButtons } from '../../../../../components/forms/ExportButtons.jsx';
import { SalesFilterBar } from '../../../../../components/forms/SalesFilterBar.jsx';
import { EMPTY_SALES_FILTERS } from '../../../../../components/forms/salesFilterDefaults.js';
import { RecordPaymentModal } from './shared/RecordPaymentModal.jsx';
import { DocumentPreviewModal } from './shared/DocumentPreviewModal.jsx';
import { documentConfigs } from './documentConfigs.js';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue.js';
import { useListKeyboardNav } from '../../../../../hooks/useListKeyboardNav.js';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser.js';
import { automobileInvoiceRow } from '../../../automobile/automobileInvoices.js';
import { creditPrintDocument } from '../../../automobile/automobileCreditNotes.js';

// ── Config ─────────────────────────────────────────────────────

const PAGE_SIZE = 5;
const INVOICE_NUMBER_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
// Bills Register keeps its own client-side paging (PAGE_SIZE) over a
// generously-limited, server-filtered fetch, since the stat cards above the
// table need to summarize the whole filtered set, not just one page of it.
const FETCH_LIMIT = 500;
const FILTER_QUERY_KEYS = Object.keys(EMPTY_SALES_FILTERS);

function getInitialInvoiceListState() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const filters = { ...EMPTY_SALES_FILTERS };
  FILTER_QUERY_KEYS.forEach((key) => {
    filters[key] = params.get(key) || '';
  });
  return {
    filters,
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    search: params.get('search') || '',
  };
}

function invoiceListQuery({ filters, dateFrom, dateTo, search }) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  FILTER_QUERY_KEYS.forEach((key) => {
    const value = filters?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  if (search.trim()) params.set('search', search.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeProductForDescription(product = {}) {
  const description = product.description || product.name || product.productName || '';
  return {
    ...product,
    _id: product._id ?? product.id ?? description,
    id: product.id ?? product._id ?? description,
    description,
    code: product.code || product.sku || '',
    productDescription: product.productDescription
      || product.itemDescription
      || product.lineDescription
      || product.details
      || product.note
      || product.remark
      || '',
  };
}

function enrichItemsWithProductDescriptions(items = [], products = []) {
  const text = (value) => String(value || '').trim().toLowerCase();
  return items.map((item) => {
    if (String(item.itemDescription || '').trim()) return item;
    const productId = item.productId ? String(item.productId) : '';
    const code = text(item.productCode || item.code);
    const description = text(item.description);
    const product = products.find((entry) => productId && String(entry._id || entry.id) === productId)
      || products.find((entry) => code && text(entry.code) === code)
      || products.find((entry) => description && text(entry.description) === description);
    return product?.productDescription ? { ...item, itemDescription: product.productDescription } : item;
  });
}

// ── Sub-components ─────────────────────────────────────────────

function findCatalogProductForItem(products = [], item = {}) {
  const text = (value) => String(value || '').trim().toLowerCase();
  const productId = item.productId ? String(item.productId) : '';
  const code = text(item.productCode || item.code);
  const description = text(item.description);
  return products.find((entry) => productId && String(entry._id || entry.id) === productId)
    || products.find((entry) => code && text(entry.code) === code)
    || products.find((entry) => description && text(entry.description) === description)
    || null;
}

function catalogVariantForItem(product = {}, item = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) return null;
  const text = (value) => String(value || '').trim().toLowerCase();
  const size = text(item.size || item.modelName || item.modelNumber);
  const barcode = text(item.barcode);
  const rate = Number(item.rate) || 0;
  return variants.find((variant) => barcode && text(variant.barcode) === barcode && (!size || text(variant.size || variant.modelName) === size))
    || variants.find((variant) => size && text(variant.size || variant.modelName) === size && (!rate || Number(variant.rate) === rate))
    || variants.find((variant) => size && text(variant.size || variant.modelName) === size)
    || null;
}

function hydrateItemsWithCatalogVariantAttrs(items = [], products = []) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(products) || !products.length) return items;
  return items.map((item) => {
    if (item.itemType === 'Service') return item;
    const product = findCatalogProductForItem(products, item);
    if (!product) return item;
    const variant = catalogVariantForItem(product, item) || {};
    return {
      ...item,
      brand: item.brand || item.other || item.variantBrand || variant.other || variant.brand || product.brand || '',
      material: item.material || item.fabric || item.variantMaterial || variant.material || variant.fabric || product.material || product.fabric || '',
      size: item.size || item.modelName || item.modelNumber || variant.size || variant.modelName || '',
      barcode: item.barcode || variant.barcode || '',
    };
  });
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isPastDue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function StatCard({ label, amount, countLabel, accentColor, icon, format = 'currency' }) {
  const display = format === 'number' ? Number(amount).toLocaleString('en-IN') : formatCurrency(amount);
  return (
    <div className="bg-white border border-[#dfe7f1] rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#536173]">{label}</span>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-none"
          style={{ backgroundColor: accentColor + '1a' }}
        >
          {icon}
        </span>
      </div>
      <div>
        <div className="text-[22px] font-bold text-[#111827] leading-none">{display}</div>
        {countLabel && (
          <div className="text-xs text-[#536173] mt-1.5">{countLabel}</div>
        )}
      </div>
    </div>
  );
}

// ── Row action menu ────────────────────────────────────────────

const ROW_ACTIONS = [
  { id: 'workflow', icon: FileText, label: 'Invoice workflow' },
  { id: 'payment', icon: Wallet,  label: 'Record Payment' },
  { id: 'view',    icon: Eye,     label: 'View Invoice' },
  { id: 'pdf',     icon: Download, label: 'Download PDF' },
  { id: 'edit',    icon: Pencil,  label: 'Edit' },
  { id: 'share',   icon: Share2,  label: 'Share' },
  { id: 'delete',  icon: Trash2,  label: 'Delete', danger: true },
];

function PaymentStatusBadge({ status }) {
  const classes = {
    Paid:    'bg-green-50 text-green-700',
    Partial: 'bg-blue-50 text-blue-700',
    Unpaid:  'bg-amber-50 text-amber-700',
    Overdue: 'bg-red-50 text-red-700',
    Draft: 'bg-slate-100 text-slate-600',
    Cancelled: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${classes[status] ?? 'bg-gray-50 text-gray-600'}`}>
      {status === 'Partial' ? 'Partially Paid' : status}
    </span>
  );
}

function ShareModal({ invoice, onClose }) {
  const requireBusinessEmail = useRequireBusinessEmail();
  const [emailTo, setEmailTo]   = useState(invoice.customer?.email || '');
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState(null);

  const modalRef = useFocusTrap({ onClose });

  const phone   = (invoice.customer?.phone || '').replace(/\D/g, '');
  const message = `Hi ${invoice.customer?.name || 'Customer'}, your invoice ${invoice.number} for ${formatCurrency(invoice.total)} is ready. Thank you for your business!`;

  function handleWhatsApp() {
    const url = `https://wa.me/${phone ? `91${phone.slice(-10)}` : ''}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleEmail() {
    if (!requireBusinessEmail()) return;
    if (!emailTo.trim()) return;
    setSending(true);
    setResult(null);
    try {
      await api.sendInvoiceEmail(invoice.id, { toEmail: emailTo.trim() });
      setResult({ ok: true, msg: `Invoice sent to ${emailTo.trim()}` });
    } catch (err) {
      setResult({ ok: false, msg: err.message || 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#edf2f7]">
          <div>
            <div className="font-semibold text-[#111827] text-[15px]">Share Invoice</div>
            <div className="text-xs text-[#536173] mt-0.5">{invoice.number} · {invoice.customer?.name || 'Walk-in customer'}</div>
          </div>
          <button type="button" className="text-[#94a3b8] hover:text-[#374151] p-1" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* WhatsApp */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-[#536173] uppercase tracking-wide">WhatsApp</div>
            <div className="text-[13px] text-[#374151] bg-[#f8fafc] rounded-md px-3 py-2 border border-[#edf2f7] leading-relaxed">{message}</div>
            <button
              type="button"
              disabled={!phone}
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold text-white cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#16a34a' }}
            >
              <svg fill="currentColor" height="15" viewBox="0 0 24 24" width="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Send via WhatsApp
            </button>
            {!phone && <div className="text-xs text-amber-600">No phone number on this invoice</div>}
          </div>

          <div className="border-t border-[#edf2f7]" />

          {/* Email */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-[#536173] uppercase tracking-wide">Email</div>
            <input
              type="email"
              className="border border-[#dbe4ef] rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-500 font-[inherit] w-full"
              placeholder="Customer email address"
              value={emailTo}
              onChange={(e) => { setEmailTo(e.target.value); setResult(null); }}
            />
            <button
              type="button"
              disabled={sending || !emailTo.trim()}
              onClick={handleEmail}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending…' : 'Send Invoice by Email'}
            </button>
            {result && (
              <div className={`text-xs px-3 py-2 rounded-md ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{result.msg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionMenu({ invoice, openMenu, setOpenMenu, onShare, onPayment, onDownload, onDelete, onWorkflow, returnSearch = '' }) {
  const invoiceId = invoice.id;
  const isOpen = openMenu === invoiceId;
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 'auto', bottom: 'auto', right: 0 });
  useEffect(() => {
    if (!isOpen) return undefined;
    const openedAt = btnRef.current?.getBoundingClientRect();
    const close = () => setOpenMenu(null);
    const outside = (event) => { if (!btnRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close(); };
    const escape = (event) => { if (event.key === 'Escape') { close(); btnRef.current?.focus(); } };
    const scroll = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      const current = btnRef.current?.getBoundingClientRect();
      if (!current || !openedAt || Math.abs(current.top - openedAt.top) > 0.5 || Math.abs(current.left - openedAt.left) > 0.5) close();
    };
    menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close); };
  }, [isOpen, setOpenMenu]);

  function handleToggle() {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 280) {
        setMenuPos({ top: 'auto', bottom: window.innerHeight - rect.top + 4, right });
      } else {
        setMenuPos({ top: rect.bottom + 4, bottom: 'auto', right });
      }
    }
    setOpenMenu(isOpen ? null : invoiceId);
  }

  function handleAction(id) {
    setOpenMenu(null);
    if (id === 'workflow') {
      onWorkflow(invoice);
    } else if (id === 'view') {
      window.location.assign(`/billing/invoice/${invoiceId}/view${returnSearch}`);
    } else if (id === 'edit') {
      window.location.assign(`/billing/invoice/${invoiceId}/edit${returnSearch}`);
    } else if (id === 'payment') {
      onPayment(invoice);
    } else if (id === 'pdf') {
      onDownload(invoice);
    } else if (id === 'share') {
      onShare(invoice);
    } else if (id === 'delete') {
      onDelete(invoice);
    }
  }

  return (
    <div className="invoice-action-menu">
      <button
        ref={btnRef}
        type="button"
        aria-label={`Actions for ${invoice.number}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `invoice-actions-${invoiceId}` : undefined}
        className="invoice-action-trigger w-8 h-8 flex items-center justify-center rounded hover:bg-[#edf2f7] text-[#64748b] hover:text-[#374151] transition-colors"
        onClick={handleToggle}
      >
        <MoreVertical size={15} />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          id={`invoice-actions-${invoiceId}`}
          role="menu"
          aria-label={`Actions for ${invoice.number}`}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
            if (event.key === 'Tab') { setOpenMenu(null); btnRef.current?.focus(); return; }
            event.preventDefault();
            const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
            const current = items.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
          className="fixed z-[9999] bg-white border border-[#dde6f2] rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto"
          style={{ top: menuPos.top, bottom: menuPos.bottom, right: Math.max(8, menuPos.right), minWidth: 190 }}
        >
          {ROW_ACTIONS.filter(({ id }) => ['edit', 'delete'].includes(id) || invoiceActionIds(invoice).includes(id)).map(({ id, icon: Icon, label, danger }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              disabled={['edit', 'delete'].includes(id) && invoice.lifecycleStatus === 'cancelled'}
              title={['edit', 'delete'].includes(id) && invoice.lifecycleStatus === 'cancelled' ? 'Cancelled bills retain their reversal history and cannot be edited or deleted.' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left border-0 bg-transparent font-[inherit] cursor-pointer transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-[#374151] hover:bg-gray-50'}`}
              onClick={() => handleAction(id)}
            >
              <Icon size={13} className={danger ? 'text-red-400' : 'text-[#94a3b8]'} />
              {label}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  );
}

function InvoicePdfDownload({ invoice, bizSettings, onDone, preserveSavedTotals = false }) {
  const documentType = invoice.documentType || 'invoice';
  const config = documentConfigs[documentType] ?? documentConfigs.invoice;
  const [products, setProducts] = useState([]);
  const snapshotBizSettings = invoice.businessSettings || invoice.businessSettingsSnapshot || {};
  const effectiveBizSettings = {
    ...snapshotBizSettings,
    ...(bizSettings || {}),
    invoicePrintFormat: invoice.extra?.billingMode === 'b2c' ? 'thermal80' : bizSettings?.invoicePrintFormat || invoice.extra?.invoicePrintFormat || snapshotBizSettings.invoicePrintFormat || 'normal',
    invoiceThermalTemplate: bizSettings?.invoiceThermalTemplate || bizSettings?.invoiceDesignSettings?.thermal80?.template || snapshotBizSettings.invoiceThermalTemplate || snapshotBizSettings.invoiceDesignSettings?.thermal80?.template || 'standard',
  };
  const docMeta = {
    ...invoice.meta,
    number: invoice.number,
    date: invoice.meta?.date || invoice.date || invoice.createdAt,
  };
  const totals = useMemo(() => {
    const calculated = calcInvoiceTotals(
    invoice.items || [],
    invoice.charges || [],
    invoice.additionalDiscount,
    invoice.tds,
    invoice.tcs,
    invoice.advanceReceived,
    config.showGst,
    );
    if (!preserveSavedTotals) return calculated;
    const finalTotal = Number(invoice.totals?.finalTotal);
    return Number.isFinite(finalTotal) ? { ...calculated, finalTotal, roundOff: finalTotal - calculated.netPayable, balanceDue: calculated.balanceDue + finalTotal - calculated.finalTotal } : calculated;
  }, [invoice, config.showGst, preserveSavedTotals]);
  const displayItems = useMemo(
    () => enrichItemsWithProductDescriptions(hydrateItemsWithCatalogVariantAttrs(invoice.items || [], products), products),
    [invoice.items, products],
  );

  useEffect(() => {
    let active = true;
    api.invListProducts()
      .then((res) => {
        const rows = Array.isArray(res) ? res : res?.data;
        if (active) setProducts(Array.isArray(rows) ? rows.map(normalizeProductForDescription) : []);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="pdf-download-stage">
      <DocumentPreviewModal
        embedded
        config={config}
        customer={invoice.customer || {}}
        docMeta={docMeta}
        docExtra={invoice.extra || {}}
        items={displayItems}
        charges={invoice.charges || []}
        totals={totals}
        notes={invoice.notes || ''}
        terms={invoice.terms || ''}
        supplyType={invoice.supplyType || 'intrastate'}
        bizSettings={effectiveBizSettings}
        shipping={invoice.shipping || {}}
        sameShipping={invoice.shipping?.sameAsBilling ?? true}
        tds={invoice.tds}
        tcs={invoice.tcs}
        advanceAmt={invoice.advanceReceived || 0}
        paymentMethod={invoice.paymentMethod || ''}
        paymentSplits={invoice.paymentSplits || []}
        addDiscount={invoice.additionalDiscount}
        downloadAsPdf
        pdfMode
        invoiceNumber={docMeta.number}
        onPdfDownloaded={onDone}
      />
    </div>
  );
}

function calcInvoiceTotals(items = [], charges = [], additionalDiscount, tds, tcs, advanceReceived, showGst = true) {
  const acc = { subtotal: 0, discount: 0, taxable: 0, totalGst: 0, grandTotal: 0, gstByRate: {} };

  items.forEach((item) => {
    const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    const discountAmt = gross * ((Number(item.discount) || 0) / 100);
    const taxable = gross - discountAmt;
    const gstAmt = showGst ? taxable * ((Number(item.gstRate) || 0) / 100) : 0;
    const rate = Number(item.gstRate) || 0;

    acc.subtotal += gross;
    acc.discount += discountAmt;
    acc.taxable += taxable;
    acc.totalGst += gstAmt;
    acc.grandTotal += taxable + gstAmt;
    if (!acc.gstByRate[rate]) acc.gstByRate[rate] = { taxable: 0, gst: 0 };
    acc.gstByRate[rate].taxable += taxable;
    acc.gstByRate[rate].gst += gstAmt;
  });

  const chargesSubtotal = charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
  const chargesGst = showGst
    ? charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0) * ((Number(charge.gstRate) || 0) / 100), 0)
    : 0;

  const preDisc = showGst
    ? acc.grandTotal + chargesSubtotal + chargesGst
    : acc.taxable + chargesSubtotal;
  const addDiscAmt = additionalDiscount?.value
    ? (additionalDiscount.type === 'percent'
      ? preDisc * (Number(additionalDiscount.value) / 100)
      : Math.min(Number(additionalDiscount.value), preDisc))
    : 0;
  const invoiceTotal = preDisc - addDiscAmt;
  const tdsAmt = tds?.enabled ? acc.taxable * ((Number(tds.rate) || 0) / 100) : 0;
  const tcsAmt = tcs?.enabled ? invoiceTotal * ((Number(tcs.rate) || 0) / 100) : 0;
  const netPayable = invoiceTotal - tdsAmt + tcsAmt;
  const roundOff = Math.round(netPayable) - netPayable;
  const finalTotal = Math.round(netPayable);
  const balanceDue = finalTotal - (Number(advanceReceived) || 0);

  return { ...acc, chargesSubtotal, chargesGst, preDisc, addDiscAmt, invoiceTotal, tdsAmt, tcsAmt, netPayable, roundOff, finalTotal, balanceDue };
}

// ── Helper: Normalize invoice data from API ────────────────────

function normalizeInvoice(inv) {
  const customer = {
    name: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    pincode: '',
    ...(inv.customer ?? {}),
  };

  // Calculate totals from items
  let taxable = 0;
  let gst = 0;
  if (Array.isArray(inv.items)) {
    inv.items.forEach((item) => {
      const itemTotal = (item.qty ?? 1) * (item.rate ?? 0) - (item.discount ?? 0);
      taxable += itemTotal;
      const itemGst = itemTotal * ((item.gstRate ?? 0) / 100);
      gst += itemGst;
    });
  }
  // Add charges
  if (Array.isArray(inv.charges)) {
    inv.charges.forEach((c) => {
      const chargeAmt = Number(c.amount) || 0;
      taxable += chargeAmt;
      const chargeGst = chargeAmt * ((c.gstRate ?? 0) / 100);
      gst += chargeGst;
    });
  }
  const calculatedTotal = taxable + gst;
  const savedTotalValue = inv.totals?.finalTotal ?? inv.totals?.grandTotal;
  const savedTotal = Number(savedTotalValue);
  const total = savedTotalValue !== undefined && savedTotalValue !== null && savedTotalValue !== '' && Number.isFinite(savedTotal) ? savedTotal : calculatedTotal;
  const payment = invoicePaymentSummary(inv, total);

  return {
    ...inv,
    id: inv._id ?? inv.id,
    number: inv.number || 'Untitled invoice',
    customer,
    date: inv.meta?.date || '',
    dueDate: inv.meta?.dueDate || '',
    supplyType: inv.supplyType || 'intrastate',
    taxable: Math.round(taxable * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    total: Math.round(total * 100) / 100,
    ...payment,
    totals: inv.totals ?? {},
  };
}

function compareInvoicesByNumber(a, b) {
  const byCreated = new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0);
  if (byCreated !== 0) return byCreated;
  const byNumber = INVOICE_NUMBER_COLLATOR.compare(b.number || '', a.number || '');
  if (byNumber !== 0) return byNumber;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

// ── Main page ──────────────────────────────────────────────────

export function InvoicePage() {
  const user = useCurrentUser();
  const isAutomobile = user?.category === 'automobile';
  const useAutomobileLayout = useAutomobileListingLayout();
  const [automobilePageSize, setAutomobilePageSize] = useState(10);
  const effectivePageSize = useAutomobileLayout ? automobilePageSize : PAGE_SIZE;
  const loadVersion = useRef(0);
  const [workflowDoc, setWorkflowDoc] = useState(null);
  const location = useLocation();
  const initialListState = useMemo(() => getInitialInvoiceListState(), []);
  const [search, setSearch] = useState(initialListState.search);
  const debouncedSearch = useDebouncedValue(search);
  const [openMenu, setOpenMenu] = useState(null);
  const [shareInvoice, setShareInvoice] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [filters, setFilters] = useState(initialListState.filters);
  const [dateFrom, setDateFrom] = useState(initialListState.dateFrom);
  const [dateTo, setDateTo] = useState(initialListState.dateTo);
  const [invoices, setInvoices] = useState([]);
  const [bizSettings, setBizSettings] = useState({});
  const [pdfInvoice, setPdfInvoice] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const deletingIds = useRef(new Set());
  const searchRef = useRef(null);

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const listQuery = useMemo(
    () => invoiceListQuery({ filters, dateFrom, dateTo, search }),
    [filters, dateFrom, dateTo, search],
  );

  useEffect(() => {
    const nextUrl = `${location.pathname}${listQuery}`;
    const currentUrl = `${location.pathname}${location.search || ''}`;
    if (nextUrl !== currentUrl) window.history.replaceState(null, '', nextUrl);
  }, [location.pathname, location.search, listQuery]);

  async function loadData() {
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const rows = []; let page = 1;
      while (version === loadVersion.current) {
        const res = await api.listInvoices({ ...filters, search: debouncedSearch, dateFrom, dateTo, limit: FETCH_LIMIT, ...(isAutomobile ? { page } : {}) });
        const data = Array.isArray(res.data) ? res.data : [];
        rows.push(...data);
        if (!isAutomobile || !data.length || rows.length >= (Number(res.total) || data.length)) break;
        page++;
      }
      if (version === loadVersion.current) setInvoices(rows.map(isAutomobile ? automobileInvoiceRow : normalizeInvoice));
    } catch (err) {
      if (version === loadVersion.current) { setError(err.message || 'Unable to load invoices'); setInvoices([]); }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => { loadData(); return () => { loadVersion.current++; }; }, [filters, debouncedSearch, dateFrom, dateTo, isAutomobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.getSettings().then(setBizSettings).catch(() => {});
  }, []);

  useEffect(() => {
    function handleListShortcut(e) {
      if (e.key !== 'F1') return;
      e.preventDefault();
      window.location.assign('/billing/invoice/new');
    }

    window.addEventListener('keydown', handleListShortcut);
    return () => window.removeEventListener('keydown', handleListShortcut);
  }, []);

  async function handleDownloadPdf(invoice) {
    try {
      setError('');
      const fullInvoice = await api.getInvoice(invoice.id);
      setPdfInvoice(isAutomobile ? creditPrintDocument({ ...fullInvoice, totals: { ...fullInvoice.totals, finalTotal: automobileInvoiceRow(fullInvoice).total } }) : fullInvoice);
    } catch (err) {
      setError(err.message || 'Unable to prepare PDF');
    }
  }

  async function handleDelete(invoice) {
    if (deletingIds.current.has(invoice.id)) return;
    const label = invoice.documentType === 'bill-of-supply' ? 'bill' : 'invoice';
    if (invoice.lifecycleStatus === 'cancelled') { setError('Cancelled bills retain their reversal history and cannot be deleted.'); return; }
    const effect = invoice.lifecycleStatus === 'draft' ? 'This cannot be undone.' : 'This will restore the bill’s stock, reverse its accounting entries, and delete its recorded payments. This cannot be undone.';
    if (!window.confirm(`Delete ${label} ${invoice.number}? ${effect}`)) return;
    deletingIds.current.add(invoice.id);
    try {
      await api.deleteInvoice(invoice.id);
      setSelectedInvoiceIds((ids) => ids.filter((id) => id !== invoice.id));
      await loadData();
    } catch (err) {
      setError(err.message || `Unable to delete ${label}`);
    } finally {
      deletingIds.current.delete(invoice.id);
    }
  }

  const stats = useMemo(() => {
    const total = invoices.length;
    const totalValue = invoices.filter((invoice) => !['draft', 'cancelled'].includes(invoice.lifecycleStatus)).reduce((s, i) => s + i.total, 0);
    const totalBalance = invoices.reduce((s, i) => s + i.balanceDue, 0);
    const pendingCount = invoices.filter((i) => i.balanceDue > 0).length;
    const now = new Date();
    const createdThisMonth = invoices.filter((i) => {
      const d = new Date(i.createdAt || i.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const avgValue = total > 0 ? totalValue / total : 0;
    return { total, totalValue, totalBalance, pendingCount, createdThisMonth, avgValue };
  }, [invoices]);

  const orderedInvoices = useMemo(
    () => [...invoices].sort(compareInvoicesByNumber),
    [invoices],
  );

  const processSummary = useMemo(() => {
    const gstBills = invoices.filter((inv) => inv.documentType === 'invoice').length;
    const accountingPosted = invoices.filter((inv) => inv.accounting?.posted).length;
    const accountingPending = invoices.filter((inv) => !inv.accounting?.posted).length;
    const paid = invoices.filter((inv) => inv.paymentStatus === 'Paid').length;
    return { gstBills, accountingPosted, accountingPending, paid };
  }, [invoices]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, debouncedSearch, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(orderedInvoices.length / effectivePageSize));
  const exportColumns = [
    { label: 'Invoice No.', value: (row) => row.number },
    { label: 'Customer', value: (row) => row.customer?.name || 'Walk-in customer' },
    { label: 'Phone', value: (row) => row.customer?.phone || '' },
    { label: 'Invoice Date', value: (row) => fmtDate(row.date) },
    { label: 'Due Date', value: (row) => fmtDate(row.dueDate) },
    { label: 'Taxable Amt', value: (row) => formatCurrency(row.taxable) },
    { label: 'GST', value: (row) => formatCurrency(row.gst) },
    { label: 'Total', value: (row) => formatCurrency(row.total) },
    { label: 'Paid', value: (row) => formatCurrency(row.paid) },
    { label: 'Balance Due', value: (row) => formatCurrency(row.balanceDue) },
    { label: 'Payment Status', value: (row) => row.paymentStatus },
    { label: 'Accounting Voucher', value: (row) => row.accounting?.voucherNo || 'Pending' },
    { label: 'Supply', value: (row) => row.supplyType === 'intrastate' ? 'Intra' : 'Inter' },
  ];
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * effectivePageSize;
  const paginatedInvoices = orderedInvoices.slice(pageStart, pageStart + effectivePageSize);
  const showingFrom = orderedInvoices.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + effectivePageSize, orderedInvoices.length);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const selectedInvoiceIdSet = useMemo(() => new Set(selectedInvoiceIds), [selectedInvoiceIds]);
  const selectedInvoices = useMemo(
    () => orderedInvoices.filter((invoice) => selectedInvoiceIdSet.has(invoice.id)),
    [orderedInvoices, selectedInvoiceIdSet],
  );
  const allListSelected = orderedInvoices.length > 0 && orderedInvoices.every((invoice) => selectedInvoiceIdSet.has(invoice.id));
  const someListSelected = orderedInvoices.some((invoice) => selectedInvoiceIdSet.has(invoice.id));

  useEffect(() => {
    const availableIds = new Set(invoices.map((invoice) => invoice.id));
    setSelectedInvoiceIds((ids) => ids.filter((id) => availableIds.has(id)));
  }, [invoices]);

  function toggleInvoiceSelection(invoiceId) {
    setSelectedInvoiceIds((ids) => (
      ids.includes(invoiceId)
        ? ids.filter((id) => id !== invoiceId)
        : [...ids, invoiceId]
    ));
  }

  function toggleListSelection() {
    const invoiceIds = orderedInvoices.map((invoice) => invoice.id);
    if (allListSelected) {
      setSelectedInvoiceIds((ids) => ids.filter((id) => !invoiceIds.includes(id)));
      return;
    }
    setSelectedInvoiceIds((ids) => Array.from(new Set([...ids, ...invoiceIds])));
  }

  async function handleBulkDelete() {
    if (selectedInvoices.length === 0) return;
    if (selectedInvoices.some((invoice) => invoice.lifecycleStatus !== 'draft')) { setError('Bulk deletion is only available for drafts.'); return; }
    const count = selectedInvoices.length;
    if (!window.confirm(`Delete ${count} selected invoice${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    setError('');
    try {
      await Promise.all(selectedInvoices.map((invoice) => api.deleteInvoice(invoice.id)));
      setSelectedInvoiceIds([]);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to delete selected invoices');
    } finally {
      setBulkDeleting(false);
    }
  }

  const { highlightedIndex } = useListKeyboardNav({
    rowCount: paginatedInvoices.length,
    onOpen: (index) => window.location.assign(`/billing/invoice/${paginatedInvoices[index].id}/view${listQuery}`),
    searchRef,
  });

  return (
    <div className={useAutomobileLayout ? 'automobile-invoice-host' : 'p-4 md:p-7'}>
      {useAutomobileLayout ? <AutomobileInvoiceList
        invoices={orderedInvoices} pageRows={paginatedInvoices} stats={stats} processSummary={processSummary}
        loading={loading} error={error} onRefresh={loadData} filters={filters} onFilterChange={updateFilter}
        onClearFilters={() => { setFilters(EMPTY_SALES_FILTERS); setDateFrom(''); setDateTo(''); setSearch(''); }}
        search={search} onSearchChange={setSearch} searchRef={searchRef} dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo}
        selectedIds={selectedInvoiceIdSet} selectedInvoices={selectedInvoices} allSelected={allListSelected} someSelected={someListSelected}
        onToggleAll={toggleListSelection} onToggle={toggleInvoiceSelection} onBulkDelete={handleBulkDelete} bulkDeleting={bulkDeleting}
        page={safePage} totalPages={totalPages} pageSize={effectivePageSize} onPageChange={setCurrentPage}
        onPageSizeChange={(value) => { setAutomobilePageSize(value); setCurrentPage(1); }}
        highlightedIndex={highlightedIndex} query={listQuery} exportColumns={exportColumns}
        onWorkflow={setWorkflowDoc} onPayment={(invoice) => setPaymentInvoice({ ...invoice, balance: invoice.balanceDue, invoiceTotal: invoice.total })}
        onPdf={handleDownloadPdf} onShare={setShareInvoice} onDelete={handleDelete}
        renderActions={(invoice) => <ActionMenu invoice={invoice} openMenu={openMenu} setOpenMenu={setOpenMenu} onShare={setShareInvoice} onPayment={(row) => setPaymentInvoice({ ...row, balance: row.balanceDue, invoiceTotal: row.total })} onDownload={handleDownloadPdf} onDelete={handleDelete} onWorkflow={setWorkflowDoc} returnSearch={listQuery} />}
      /> : <>

      {/* ── Page Header ── */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
        <div>
          <nav className="flex items-center gap-1 text-[13px] text-[#536173] mb-1">
            <a className="text-blue-600 no-underline hover:underline" href="/dashboard">Home</a>
            <span>›</span>
            <span>Sales</span>
            <span>›</span>
            <span className="text-[#111827]">Bills</span>
          </nav>
          <h1 className="m-0 text-[22px] font-bold text-[#111827]">Bills</h1>
        </div>
        <a
          href="/billing/invoice/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-[13px] font-semibold rounded-md hover:bg-blue-700 no-underline transition-colors"
        >
          <Plus size={15} />
          Create Bill
        </a>
      </div>

      {/* ── Stats ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">{error}</div>
      )}
      {loading ? (
        <div className="rounded-lg border border-[#dfe7f1] bg-white p-6 text-sm text-[#374151] mb-6">Loading invoices…</div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Documents"
          amount={stats.total}
          format="number"
          accentColor="#2563eb"
          icon={<FileText size={16} color="#2563eb" />}
        />
        <StatCard
          label="Total Value"
          amount={stats.totalValue}
          accentColor="#16a34a"
          icon={<IndianRupee size={16} color="#16a34a" />}
        />
        <StatCard
          label="Balance Pending"
          amount={stats.totalBalance}
          accentColor="#ea580c"
          icon={<Wallet size={16} color="#ea580c" />}
        />
        <StatCard
          label="Pending Bills"
          amount={stats.pendingCount}
          format="number"
          accentColor="#d97706"
          icon={<Calendar size={16} color="#d97706" />}
        />
        <StatCard
          label="Average Value"
          amount={stats.avgValue}
          accentColor="#7c3aed"
          icon={<TrendingUp size={16} color="#7c3aed" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'GST bills', value: processSummary.gstBills, detail: 'Included in GST returns', color: '#2563eb', bg: '#eff6ff' },
          { label: 'Accounting posted', value: processSummary.accountingPosted, detail: `${processSummary.accountingPending} pending`, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Payment completed', value: processSummary.paid, detail: `${Math.max(0, stats.total - processSummary.paid)} still open`, color: '#d97706', bg: '#fffbeb' },
        ].map((item) => (
          <div key={item.label} className="border rounded-lg px-4 py-3" style={{ borderColor: item.bg, background: item.bg }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-[#536173]">{item.label}</div>
                <div className="text-[13px] text-[#536173] mt-0.5">{item.detail}</div>
              </div>
              <div className="text-[22px] font-bold" style={{ color: item.color }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters + Table card ── */}
      <div className="bg-white border border-[#dfe7f1] rounded-lg overflow-hidden">

        {/* Search row */}
        <div className="flex flex-wrap items-stretch gap-2 border-b border-[#edf2f7] px-3 py-3 sm:items-center sm:justify-end sm:px-4 sm:py-2.5">
          <div className="relative w-full sm:w-auto">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
            <input
              ref={searchRef}
              className="h-11 w-full rounded-lg border border-[#dbe4ef] pl-8 pr-3 text-[13px] font-[inherit] outline-none focus:border-blue-500 sm:h-auto sm:w-60 sm:rounded-md sm:py-2"
              placeholder="Search invoice or customer... (/)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
            onClear={() => { setDateFrom(''); setDateTo(''); }}
          />
          <SalesFilterBar
            filters={filters}
            onChange={updateFilter}
            fields={['gstType', 'paymentMethod', 'paymentStatus', 'customer', 'city', 'state', 'supplyType', 'amountRange', 'itemType', 'hsn', 'productName', 'barcode']}
          />
          <ExportButtons title="Bills" filename="bills" rows={orderedInvoices} columns={exportColumns} />
          {selectedInvoices.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={13} />
              Delete ({selectedInvoices.length})
            </button>
          )}
          <div className="relative hidden" aria-hidden="true">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
            <input
              className="pl-8 pr-3 py-2 border border-[#dbe4ef] rounded-md text-[13px] outline-none focus:border-blue-500 w-60 font-[inherit]"
              placeholder="Search invoice or customer… (/)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-[#edf2f7]">
          {orderedInvoices.length === 0 ? (
            <div className="text-center py-16 text-[#536173] text-[13px]">No invoices match your search.</div>
          ) : (
            paginatedInvoices.map((inv) => (
              <div key={inv.id} className="p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIdSet.has(inv.id)}
                      onChange={() => toggleInvoiceSelection(inv.id)}
                      aria-label={`Select ${inv.number}`}
                      className="mt-1 h-4 w-4 rounded border-[#cbd5e1] text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <a
                        href={`/billing/invoice/${inv.id}/view${listQuery}`}
                        className="text-[14px] font-semibold text-blue-600 no-underline hover:underline"
                      >
                        {inv.number}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {inv.documentType === 'bill-of-supply' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">No GST</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-500">GST</span>
                        )}
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            inv.supplyType === 'intrastate' ? 'bg-purple-50 text-purple-700' : 'bg-cyan-50 text-cyan-700'
                          }`}
                        >
                          {inv.supplyType === 'intrastate' ? 'Intra' : 'Inter'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <div className="grid gap-1"><PaymentStatusBadge status={inv.paymentStatus} /><span className="text-[10px] capitalize text-slate-500">{inv.lifecycleStatus || 'posted'} / {inv.fulfillmentStatus || 'dispatch unknown'}</span></div>
                    <ActionMenu
                      invoice={inv}
                      openMenu={openMenu}
                      setOpenMenu={setOpenMenu}
                      onShare={setShareInvoice}
                      onPayment={(inv) => setPaymentInvoice({ ...inv, balance: inv.balanceDue, invoiceTotal: inv.total })}
                      onDownload={handleDownloadPdf}
                      onDelete={handleDelete}
                      onWorkflow={setWorkflowDoc}
                      returnSearch={listQuery}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[13px] font-medium text-[#111827] leading-snug">{inv.customer.name || 'Walk-in customer'}</div>
                  <div className="text-xs text-[#94a3b8] mt-0.5 font-mono tracking-tight">
                    {inv.customer.gstin}
                    <span className="font-sans tracking-normal text-[#b0bec5]"> · </span>
                    {inv.customer.city}
                    {inv.customer.phone && <span className="font-sans tracking-normal text-[#b0bec5]"> · {inv.customer.phone}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Invoice Date</span><span className="text-[#374151]">{fmtDate(inv.date)}</span></div>
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Due Date</span><span className="text-[#374151]">{fmtDate(inv.dueDate)}</span></div>
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Taxable</span><span className="text-[#374151]">{formatCurrency(inv.taxable)}</span></div>
                  <div className="flex justify-between"><span className="text-[#94a3b8]">GST</span><span className="text-[#374151]">{formatCurrency(inv.gst)}</span></div>
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Paid</span><span className="text-[#374151]">{formatCurrency(inv.paid)}</span></div>
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Balance</span><span className={`font-semibold ${inv.balanceDue > 0 ? 'text-[#b45309]' : 'text-green-700'}`}>{formatCurrency(inv.balanceDue)}</span></div>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-[#f3f4f6]">
                  <span className="text-[11px] text-[#94a3b8]">Total</span>
                  <span className="text-[15px] font-bold text-[#111827]">{formatCurrency(inv.total)}</span>
                </div>

                <div>
                  {inv.accounting?.posted ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700">{inv.accounting.voucherNo}</span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">Accounting pending</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse sales-list-table">
            <thead>
              <tr className="bg-[#f8fafc]">
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allListSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someListSelected && !allListSelected;
                    }}
                    onChange={toggleListSelection}
                    aria-label="Select all invoices"
                    className="h-4 w-4 rounded border-[#cbd5e1] text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {[
                  { label: 'Invoice No.',    align: 'left'  },
                  { label: 'Customer',       align: 'left'  },
                  { label: 'Phone',          align: 'left'  },
                  { label: 'Invoice Date',   align: 'left'  },
                  { label: 'Due Date',       align: 'left'  },
                  { label: 'Taxable Amt',    align: 'right' },
                  { label: 'GST',            align: 'right' },
                  { label: 'Total',          align: 'right' },
                  { label: 'Paid',           align: 'right' },
                  { label: 'Balance',        align: 'right' },
                  { label: 'Payment',        align: 'left'  },
                  { label: 'Supply',         align: 'left'  },
                  { label: '',               align: 'right' },
                ].map((col, i) => (
                  <th
                    key={i}
                    className={`text-xs font-semibold uppercase tracking-wide text-[#536173] px-4 py-3 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {orderedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-16 text-[#536173] text-[13px]">
                    No invoices match your search.
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv, rowIndex) => {
                  return (
                    <tr
                      key={inv.id}
                      className={`border-t border-[#edf2f7] hover:bg-[#fafbfe] transition-colors ${highlightedIndex === rowIndex ? 'bg-[#eef4fd]' : ''}`}
                    >
                      <td className="px-4 py-3.5 align-top">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIdSet.has(inv.id)}
                          onChange={() => toggleInvoiceSelection(inv.id)}
                          aria-label={`Select ${inv.number}`}
                          className="h-4 w-4 rounded border-[#cbd5e1] text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* Invoice number */}
                      <td className="px-4 py-3.5">
                        <a
                          href={`/billing/invoice/${inv.id}/view${listQuery}`}
                          className="text-[13px] font-semibold text-blue-600 no-underline hover:underline"
                        >
                          {inv.number}
                        </a>
                        {inv.documentType === 'bill-of-supply' ? (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">No GST</span>
                        ) : (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-500">GST</span>
                        )}
                        <div className="mt-1">
                          {inv.accounting?.posted ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700">{inv.accounting.voucherNo}</span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">Accounting pending</span>
                          )}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] font-medium text-[#111827] leading-snug">
                          {inv.customer.name || 'Walk-in customer'}
                        </div>
                        <div className="text-xs text-[#94a3b8] mt-0.5 font-mono tracking-tight">
                          {inv.customer.gstin}
                          <span className="font-sans tracking-normal text-[#b0bec5]"> · </span>
                          {inv.customer.city}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3.5 text-[13px] text-[#374151] whitespace-nowrap">
                        {inv.customer.phone || <span className="text-[#b0bec5]">—</span>}
                      </td>

                      {/* Invoice date */}
                      <td className="px-4 py-3.5 text-[13px] text-[#374151] whitespace-nowrap">
                        {fmtDate(inv.date)}
                      </td>

                      {/* Due date */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-[13px] text-[#374151]">
                          {fmtDate(inv.dueDate)}
                        </span>
                      </td>

                      {/* Taxable */}
                      <td className="px-4 py-3.5 text-right text-[13px] text-[#374151]">
                        {formatCurrency(inv.taxable)}
                      </td>

                      {/* GST */}
                      <td className="px-4 py-3.5 text-right text-[13px] text-[#536173]">
                        {formatCurrency(inv.gst)}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-[13px] font-bold text-[#111827]">
                          {formatCurrency(inv.total)}
                        </span>
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3.5 text-right text-[13px] text-[#536173]">
                        {formatCurrency(inv.paid)}
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`text-[13px] font-bold ${inv.balanceDue > 0 ? 'text-[#b45309]' : 'text-green-700'}`}>
                          {formatCurrency(inv.balanceDue)}
                        </span>
                      </td>

                      {/* Payment status */}
                      <td className="px-4 py-3.5">
                        <div className="grid gap-1"><PaymentStatusBadge status={inv.paymentStatus} /><span className="text-[10px] capitalize text-slate-500">{inv.lifecycleStatus || 'posted'} / {inv.fulfillmentStatus || 'dispatch unknown'}</span></div>
                      </td>

                      {/* Supply type */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            inv.supplyType === 'intrastate'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-cyan-50 text-cyan-700'
                          }`}
                        >
                          {inv.supplyType === 'intrastate' ? 'Intra' : 'Inter'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <ActionMenu
                          invoice={inv}
                          openMenu={openMenu}
                          setOpenMenu={setOpenMenu}
                          onShare={setShareInvoice}
                          onPayment={(inv) => setPaymentInvoice({ ...inv, balance: inv.balanceDue, invoiceTotal: inv.total })}
                          onDownload={handleDownloadPdf}
                          onDelete={handleDelete}
                      onWorkflow={setWorkflowDoc}
                          returnSearch={listQuery}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="px-4 py-3 border-t border-[#edf2f7] flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-[#536173]">
            Showing <span className="font-medium text-[#374151]">{showingFrom}-{showingTo}</span> of{' '}
            <span className="font-medium text-[#374151]">{orderedInvoices.length}</span> invoices
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="px-3 py-1.5 border border-[#dbe4ef] rounded text-[13px] text-[#374151] bg-white hover:bg-gray-50 cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              ← Prev
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`min-w-8 px-3 py-1.5 border rounded text-[13px] font-semibold cursor-pointer font-[inherit] ${
                  safePage === page
                    ? 'border-blue-600 text-white bg-blue-600'
                    : 'border-[#dbe4ef] text-[#374151] bg-white hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="px-3 py-1.5 border border-[#dbe4ef] rounded text-[13px] text-[#374151] bg-white hover:bg-gray-50 cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Next →
            </button>
          </div>
        </div>

      </div>

      </>}
      {workflowDoc ? <SalesWorkflowDialog document={workflowDoc} onClose={() => setWorkflowDoc(null)} onComplete={loadData} /> : null}
      {shareInvoice && (
        <ShareModal invoice={shareInvoice} onClose={() => setShareInvoice(null)} />
      )}
      {paymentInvoice && (
        <RecordPaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onSaved={() => { setPaymentInvoice(null); loadData(); }}
        />
      )}
      {pdfInvoice && (
        <InvoicePdfDownload
          invoice={pdfInvoice}
          preserveSavedTotals={isAutomobile}
          bizSettings={bizSettings}
          onDone={() => setPdfInvoice(null)}
        />
      )}
    </div>
  );
}

