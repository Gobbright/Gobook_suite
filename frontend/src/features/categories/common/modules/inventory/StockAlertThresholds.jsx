import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../../../services/api.js';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';

export function StockAlertThresholds({ alert, onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(alert?.productId || '');
  const [config, setConfig] = useState(null);
  const [scope, setScope] = useState('product');
  const [location, setLocation] = useState('');
  const [values, setValues] = useState({ minStockLevel: '', maxStockLevel: '', reorderLevel: '', enabled: true });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const close = () => { if (!busy.current) onClose(); };
  const ref = useFocusTrap({ onClose: close });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => api.invListProducts({ search, itemType: 'Product', page: 1, limit: 50 }).then((result) => { if (active) setProducts(result.data || []); }).catch((failure) => { if (active) setError(failure.message || 'Unable to find products.'); }), 150);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  function choose(nextScope, nextLocation, data = config) {
    setScope(nextScope); setLocation(nextLocation);
    const selected = nextLocation ? JSON.parse(nextLocation) : {};
    const level = nextScope === 'product' ? data.product : data.warehouseStockLevels.find((row) => row.warehouse === selected.name && row.branch === selected.branch);
    setValues({ minStockLevel: String(level?.minStockLevel ?? ''), maxStockLevel: String(level?.maxStockLevel ?? ''), reorderLevel: String(level?.reorderLevel ?? ''), enabled: nextScope === 'product' ? data.product.stockAlertsEnabled : level?.enabled !== false });
  }
  useEffect(() => {
    setConfig(null);
    if (!productId) return undefined;
    let active = true; setLoading(true); setError('');
    api.invGetAlertThresholds(productId).then((data) => {
      if (!active) return;
      setConfig(data);
      const selected = data.warehouses.find((warehouse) => warehouse.name === alert?.warehouse && warehouse.branch === alert?.branch);
      const nextScope = selected || !data.canEditProduct ? 'warehouse' : 'product';
      choose(nextScope, selected ? JSON.stringify(selected) : '', data);
    }).catch((failure) => { if (active) setError(failure.message || 'Unable to load thresholds.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  async function save(event) {
    event.preventDefault(); if (busy.current) return;
    setError(''); setSaving(true); busy.current = true;
    try {
      const selected = scope === 'warehouse' && location ? JSON.parse(location) : {};
      const body = { scope, warehouse: selected.name, branch: selected.branch, enabled: values.enabled };
      for (const field of ['minStockLevel', 'maxStockLevel', 'reorderLevel']) {
        if (values[field] === '' && scope === 'product') throw new Error('Product thresholds must be entered, including zero where no limit is configured.');
        body[field] = values[field] === '' ? null : Number(values[field]);
      }
      await api.invSaveAlertThresholds(productId, body);
      onSaved(); onClose();
    } catch (failure) { setError(failure.message || 'Unable to save thresholds.'); }
    finally { setSaving(false); busy.current = false; }
  }
  const productOptions = products.map((product) => ({ value: product._id, label: `${product.description} · ${product.code}` }));
  if (productId && !productOptions.some((product) => product.value === productId)) productOptions.unshift({ value: productId, label: config?.product.description || alert?.description || 'Selected product' });
  return createPortal(<div className="asa-threshold-overlay" onClick={close}><section ref={ref} className="asa-threshold-dialog" role="dialog" aria-modal="true" aria-labelledby="threshold-title" onClick={(event) => event.stopPropagation()}>
    <header><h2 id="threshold-title">Stock Alert Thresholds</h2><button type="button" disabled={saving} onClick={close}>Close</button></header>
    <label>Find product<input aria-label="Find threshold product" placeholder="Product name, SKU or barcode" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <SelectDropdown aria-label="Threshold product" value={productId} onChange={setProductId} options={productOptions} placeholder="Select an inventory product" />
    {error && <p role="alert" className="asa-config-error">{error}</p>}
    {loading ? <p role="status">Loading saved thresholds…</p> : config && <form onSubmit={save}>
      <label>Threshold scope<SelectDropdown value={scope} onChange={(value) => choose(value, location)} options={[...(config.canEditProduct ? [{ value: 'product', label: 'Product defaults' }] : []), { value: 'warehouse', label: 'Warehouse override' }]} /></label>
      {scope === 'warehouse' && <label>Warehouse / Branch<SelectDropdown value={location} onChange={(value) => choose(scope, value)} options={config.warehouses.map((warehouse) => ({ value: JSON.stringify(warehouse), label: `${warehouse.name} · ${warehouse.branch || 'No branch'}` }))} placeholder="Select a warehouse" /></label>}
      {['minStockLevel', 'maxStockLevel', 'reorderLevel'].map((field) => <label key={field}>{field === 'minStockLevel' ? 'Minimum Stock' : field === 'maxStockLevel' ? 'Maximum Stock' : 'Reorder Point'}<input aria-label={field} type="number" min="0" step="any" value={values[field]} placeholder={scope === 'warehouse' ? `Inherit product default (${config.product[field]})` : ''} onChange={(event) => setValues((previous) => ({ ...previous, [field]: event.target.value }))} /></label>)}
      <label className="asa-enabled"><input type="checkbox" checked={values.enabled} onChange={(event) => setValues((previous) => ({ ...previous, enabled: event.target.checked }))} />Enable alerts for this scope</label>
      <p>Warehouse blanks inherit product defaults. Maximum 0 means no upper limit. Reorder Point 0 in product defaults uses Minimum Stock. Suggested quantity tops up available stock to Maximum, or Minimum if no Maximum is configured. No quantity is invented when no target is set.</p>
      {!config.product.stockAlertsEnabled && scope === 'warehouse' && <p>Product alerts are disabled globally; an owner must enable them before warehouse alerts can appear.</p>}
      <button type="submit" disabled={saving || !productId || (scope === 'warehouse' && !location)}>{saving ? 'Saving…' : 'Save Thresholds'}</button>
    </form>}
  </section></div>, document.body);
}
