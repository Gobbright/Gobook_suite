import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { STOCK_TABLE_COLUMNS } from '../src/utils/stockDashboard.js';

test('stock table renders populated, selected, hidden-column, loading, empty and error states', { timeout: 30000 }, async () => {
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { StockSummaryTable } = await server.ssrLoadModule('/src/features/categories/common/modules/inventory/StockSummaryTable.jsx');
    const noop = () => {};
    const model = { rows: [{ _id: 'product-1', productId: 'product-1', description: 'Real stock row', code: 'SKU-1', barcode: 'BAR-1', physicalQty: 10, reservedQty: 2, availableQty: 8, minStockLevel: 1, maxStockLevel: 5, stockValue: 1000, stockStatus: 'Overstock' }], checked: ['product-1'], visible: STOCK_TABLE_COLUMNS.map((column) => column.key), loading: false, error: '', total: 1, page: 1, pages: 1, size: 20, sortBy: 'stockValue', sortDirection: 'desc', setChecked: noop, setVisible: noop, setSize: noop, setPage: noop, sort: noop, toggle: noop, retry: noop, exportRows: async () => [], detail: null };
    const render = (state) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(StockSummaryTable, { model: state, filters: { warehouse: 'Main', dateTo: '2026-04-30' } })));
    const html = render(model);
    assert.ok(html.includes('ass-overstock'));
    assert.ok(html.includes('Physical Stock'));
    assert.ok(html.includes('productId=product-1'));
    assert.ok(html.includes('1 selected'));
    assert.ok(html.includes('Excel'));
    assert.ok(html.includes('PDF'));
    assert.ok(render({ ...model, loading: true }).includes('Loading calculated stock'));
    assert.ok(render({ ...model, error: 'Offline' }).includes('Offline'));
    assert.ok(render({ ...model, rows: [] }).includes('No stock records match'));
    const hidden = render({ ...model, visible: ['description', 'actions'] });
    assert.equal(hidden.includes('>Physical Stock</button>'), false);
    assert.ok(hidden.includes('View stock details for Real stock row'));
  } finally {
    await server.close();
  }
});
