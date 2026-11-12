import { Children, cloneElement, Fragment, isValidElement, useRef, useState } from 'react';
import './bulkDeleteTable.css';

const recordId = record => String(record?._id || record?.recordId || record?.sourceId || record?.id || '');
const elements = children => { const result = []; Children.forEach(children, child => { if (isValidElement(child)) result.push(child); }); return result; };

function checkboxIn(element) {
  if (!isValidElement(element)) return null;
  if (element.type === 'input' && element.props.type === 'checkbox') return element;
  for (const child of elements(element.props.children)) { const found = checkboxIn(child); if (found) return found; }
  return null;
}

function replaceCheckbox(element, replacement) {
  if (!isValidElement(element)) return element;
  if (element.type === 'input' && element.props.type === 'checkbox') return replacement(element);
  return element.props.children ? cloneElement(element, {}, Children.map(element.props.children, child => replaceCheckbox(child, replacement))) : element;
}

function SelectionCheckbox({ mixed = false, ...props }) {
  return <input {...props} type="checkbox" ref={element => { if (element) element.indeterminate = mixed; }} onClick={event => event.stopPropagation()} />;
}

/** A record row with explicit data; never infer record IDs from display text or indexes. */
export function BulkDeleteRow({ record: _record, children, ...props }) {
  return <tr {...props}>{children}</tr>;
}

export function BulkDeleteItem({ record: _record, children, ...props }) {
  return <div {...props} className={`bulk-delete-item ${props.className || ''}`}>{children}</div>;
}

export function BulkDeleteList(props) {
  return <BulkDeleteTable {...props} list />;
}

/** Adds deletion selection to a record table, preserving existing row checkboxes. */
export function BulkDeleteTable({ children, onDeleteRecord, onDeleted, getRecordId = recordId, canDelete = () => true, allowReadOnlySelection = false, list = false, ...props }) {
  const [selected, setSelected] = useState(() => new Set());
  const [deleted, setDeleted] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const rows = [];
  function collect(node) {
    if (!isValidElement(node)) return;
    if (node.type === BulkDeleteRow || node.type === BulkDeleteItem) {
      const record = node.props.record;
      const id = getRecordId(record);
      const firstCell = elements(node.props.children)[0];
      const checkbox = node.type === BulkDeleteRow && firstCell?.type === 'td' ? checkboxIn(firstCell) : null;
      rows.push({ node, record, id, checkbox, eligible: Boolean(id) && !deleted.has(id) && canDelete(record) && !checkbox?.props.disabled });
      return;
    }
    Children.forEach(node.props.children, collect);
  }
  Children.forEach(children, collect);
  const visible = rows.filter(row => row.eligible || allowReadOnlySelection && row.id && !deleted.has(row.id) && !row.checkbox?.props.disabled);
  const checked = row => row.checkbox ? Boolean(row.checkbox.props.checked) : selected.has(row.id);
  const selectedRows = visible.filter(checked);
  const deletableRows = selectedRows.filter(row => row.eligible);
  const all = visible.length > 0 && selectedRows.length === visible.length;
  const usesExistingColumn = rows.some(row => row.checkbox);
  function toggle(row, next) {
    if (lock.current || !row.eligible && !allowReadOnlySelection || checked(row) === next) return;
    if (row.checkbox) row.checkbox.props.onChange?.({ target: { checked: next, value: row.id }, currentTarget: { checked: next, value: row.id }, stopPropagation() {}, preventDefault() {} });
    else setSelected(previous => { const result = new Set(previous); if (next) result.add(row.id); else result.delete(row.id); return result; });
  }
  async function removeSelected() {
    if (lock.current || !deletableRows.length) return;
    const targets = [...new Map(deletableRows.map(row => [row.id, row])).values()];
    if (!window.confirm(`Delete ${targets.length} selected record${targets.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    lock.current = true; setBusy(true); setError('');
    const succeeded = [], failed = [];
    try {
      // Keep requests bounded, and retain failed selections for a retry.
      for (let start = 0; start < targets.length; start += 4) {
        const batch = targets.slice(start, start + 4);
        const results = await Promise.allSettled(batch.map(row => Promise.resolve().then(() => onDeleteRecord(row.record))));
        results.forEach((result, index) => { if (result.status === 'fulfilled') succeeded.push(batch[index]); else failed.push({ row: batch[index], reason: result.reason }); });
      }
      for (const row of succeeded) {
        if (row.checkbox) row.checkbox.props.onChange?.({ target: { checked: false, value: row.id }, currentTarget: { checked: false, value: row.id }, stopPropagation() {}, preventDefault() {} });
      }
      setSelected(previous => new Set([...previous].filter(id => !succeeded.some(row => row.id === id))));
      setDeleted(previous => new Set([...previous, ...succeeded.map(row => row.id)]));
      if (succeeded.length) await onDeleted?.(succeeded.map(row => row.id));
      if (failed.length) setError(`${succeeded.length} deleted. ${failed.length} could not be deleted. ${failed[0].reason?.message || 'Please retry.'}`);
    } catch (failure) {
      setError(`${succeeded.length} deleted. Unable to refresh the list: ${failure.message || 'Please reload the page.'}`);
    } finally { lock.current = false; setBusy(false); }
  }
  let headerAdded = false;
  function decorate(node, section = '') {
    if (!isValidElement(node)) return node;
    if (node.type === 'thead' || node.type === 'tbody' || node.type === 'tfoot') section = node.type;
    if (node.type === BulkDeleteRow || node.type === BulkDeleteItem) {
      const row = rows.find(row => row.node === node);
      if (deleted.has(row.id)) return null;
      const checkboxProps = { checked: checked(row), disabled: busy || !visible.includes(row), 'aria-label': `Select record ${row.id}`, onChange: event => toggle(row, event.target.checked) };
      if (node.type === BulkDeleteItem) return cloneElement(node, { 'data-bulk-selected': checked(row) || undefined }, <span className="bulk-delete-item-select"><SelectionCheckbox {...checkboxProps} /></span>, node.props.children);
      const cells = Children.map(node.props.children, child => child);
      if (row.checkbox) cells[0] = replaceCheckbox(cells[0], old => <SelectionCheckbox {...old.props} {...checkboxProps} />);
      else cells.unshift(<td key="bulk-select" className="bulk-delete-checkbox-cell"><SelectionCheckbox {...checkboxProps} /></td>);
      return cloneElement(node, { children: cells, 'data-bulk-selected': checked(row) || undefined });
    }
    if (node.type === 'tr' && section === 'thead' && !headerAdded) {
      headerAdded = true;
      const cells = Children.map(node.props.children, child => child);
      const header = <SelectionCheckbox aria-label="Select all records on this page" checked={all} mixed={selectedRows.length > 0 && !all} disabled={busy || !visible.length} onChange={event => visible.forEach(row => toggle(row, event.target.checked))} />;
      if (usesExistingColumn && checkboxIn(elements(node.props.children)[0])) cells[0] = replaceCheckbox(cells[0], () => header);
      else cells.unshift(<th key="bulk-select" className="bulk-delete-checkbox-cell">{header}</th>);
      return cloneElement(node, {}, cells);
    }
    if (node.type === 'colgroup' && !usesExistingColumn) return cloneElement(node, {}, <col key="bulk-select" style={{ width: 38 }} />, node.props.children);
    if (node.type === 'td' && node.props.colSpan && !usesExistingColumn) return cloneElement(node, { colSpan: Number(node.props.colSpan) + 1 });
    return node.props.children ? cloneElement(node, {}, Children.map(node.props.children, child => decorate(child, section))) : node;
  }
  return <Fragment>
    {(selectedRows.length > 0 || busy || list && visible.length > 0) && <div className="bulk-delete-toolbar" role="region" aria-label="Selected records">{list && <label className="bulk-delete-list-select"><SelectionCheckbox aria-label="Select all records on this page" checked={all} mixed={selectedRows.length > 0 && !all} disabled={busy || !visible.length} onChange={event => visible.forEach(row => toggle(row, event.target.checked))} />Select all</label>}<span aria-live="polite">{selectedRows.length} selected on this page</span>{(selectedRows.length > 0 || busy) && <><button type="button" disabled={busy || !deletableRows.length} onClick={removeSelected}>{busy ? 'Deleting...' : 'Delete'}</button><button type="button" disabled={busy} onClick={() => visible.filter(checked).forEach(row => toggle(row, false))}>Clear</button></>}</div>}
    {error && <p className="bulk-delete-error" role="alert">{error}</p>}
    {list ? Children.map(children, child => { const result = decorate(child); return isValidElement(result) ? cloneElement(result, { inert: busy || undefined }) : result; }) : <table {...props} inert={busy || undefined} aria-busy={busy || undefined}>{Children.map(children, child => decorate(child))}</table>}
  </Fragment>;
}
