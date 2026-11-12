import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../../../../../services/api.js';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { stockLedgerLink, stockStatusClass } from '../../../../../utils/stockDashboard.js';

const quantity = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 4 });
export function StockProductDrawer({ product, filters, onClose }) {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const ref = useFocusTrap({ onClose });
  const key = JSON.stringify({ productId: product.productId || product._id, dateFrom: filters.dateFrom, dateTo: filters.dateTo, warehouse: filters.warehouse, branch: filters.branch, warehouseMissing: filters.warehouseMissing, branchMissing: filters.branchMissing, categoryMissing: filters.categoryMissing });
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const { productId, ...query } = JSON.parse(key);
    api.invProductStockDetails(productId, query).then((result) => { if (active) setResponse(result); }).catch((failure) => { if (active) setError(failure.message || 'Unable to load product stock.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key, reload]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  const summary = response?.product;
  return createPortal(<div className="ass-drawer-backdrop" onClick={onClose}><aside ref={ref} className="ass-stock-drawer" role="dialog" aria-modal="true" aria-labelledby="stock-product-title" aria-busy={loading} onClick={(event) => event.stopPropagation()}>
    <header><div><h2 id="stock-product-title">{product.description}</h2><p>{product.code || '—'} · Product stock details</p></div><button type="button" aria-label="Close stock details" onClick={onClose}><X size={20} /></button></header>
    {loading ? <p role="status">Loading calculated product stock…</p> : error ? <div role="alert">{error} <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button></div> : <>
      <p>{response.from || 'All recorded history'} to {response.to} · {response.costingMethod}</p>
      <div className="ass-drawer-totals">{[['Opening Stock', summary.openingQty], ['Stock In', summary.inwardQty], ['Stock Out', summary.outwardQty], ['Physical Stock', summary.physicalQty], ['Reserved Stock', summary.reservedQty], ['Available Stock', summary.availableQty]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{quantity(value)} {summary.unit}</strong></div>)}</div>
      <p><strong>Stock Value:</strong> {summary.stockValue == null ? 'Unavailable' : formatCurrency(summary.stockValue)} · <span className={`ass-badge ${stockStatusClass(summary.stockStatus)}`}>{summary.stockStatus}</span></p>
      <p>Minimum: {quantity(summary.minStockLevel)} · Maximum: {Number(summary.maxStockLevel) > 0 ? quantity(summary.maxStockLevel) : 'Not set'}</p>
      {response.warnings.length > 0 && <p className="ass-data-note" role="status">Historical data needs reconciliation: {response.warnings.join(', ')}. Unassigned variant history is not distributed into guessed balances.</p>}
      <h3>Variant-wise Stock by Location and Batch</h3>
      <div className="ass-drawer-scroll"><table><thead><tr>{['Variant', 'Barcode', 'Warehouse', 'Branch', 'Batch', 'Physical', 'Reserved', 'Available', 'Value', 'Ledger'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{!response.data.length ? <tr><td colSpan={10}>No posted variant stock records for this scope.</td></tr> : response.data.map((row) => <tr key={row._id}><td>{row.variantName}</td><td>{row.barcode || '—'}</td><td>{row.warehouse || 'Unassigned'}</td><td>{row.branch || 'Unassigned'}</td><td>{row.batch || '—'}</td><td>{quantity(row.physicalQty)}</td><td>{quantity(row.reservedQty)}</td><td>{quantity(row.availableQty)}</td><td>{row.stockValue == null ? 'Unavailable' : formatCurrency(row.stockValue)}</td><td><Link to={stockLedgerLink(product.productId || product._id, filters, row)} onClick={onClose}>Stock Ledger</Link></td></tr>)}</tbody></table></div>
      <p>Variant balances are calculated from posted stock history, not product-master counters.</p>
    </>}
    <footer><Link to={stockLedgerLink(product.productId || product._id, filters)} onClick={onClose}>View Product Stock Ledger</Link><button type="button" onClick={onClose}>Close</button></footer>
  </aside></div>, document.body);
}
