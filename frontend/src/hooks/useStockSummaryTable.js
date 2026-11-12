import { useEffect, useState } from 'react';
import { useStockDashboard } from './useStockDashboard.js';
import { STOCK_TABLE_COLUMNS, allStockDashboardRows, selectedStockRows } from '../utils/stockDashboard.js';
import { api } from '../services/api.js';

export function useStockSummaryTable(filters, initialSize = 20) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const [sortBy, setSortBy] = useState('stockValue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [checked, setChecked] = useState([]);
  const [visible, setVisible] = useState(() => STOCK_TABLE_COLUMNS.map((column) => column.key));
  const [detail, setDetail] = useState(null);
  const key = JSON.stringify(filters);
  const state = useStockDashboard({ ...filters, page, limit: size, sortBy, sortDirection });
  const total = state.response?.total || 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { setPage(1); setChecked([]); setDetail(null); }, [key]);
  useEffect(() => { if (!state.loading && !state.error && page > pages) setPage(pages); }, [state.loading, state.error, page, pages]);
  const toggle = (id) => setChecked((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const sort = (column) => { setSortBy(column); setSortDirection(column === sortBy && sortDirection === 'asc' ? 'desc' : 'asc'); setPage(1); };
  async function exportRows() {
    const all = await allStockDashboardRows(api, { ...JSON.parse(key), sortBy, sortDirection });
    return selectedStockRows(all, checked);
  }
  return { ...state, rows: state.response?.data || [], total, page, pages, setPage, size, setSize, sortBy, sortDirection, sort,
    checked, setChecked, toggle, visible, setVisible, detail, setDetail, exportRows };
}
