import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

test('both alert layouts render real API snapshots and explicit loading, empty and retry states', { timeout: 30000 }, async () => {
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom',
    plugins: [{ name: 'stock-alert-fixtures', enforce: 'pre', transform(source, id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/src/hooks/useStockAlerts.js')) return 'export function useStockAlerts() { return globalThis.__gobookAlertFixture; }';
      if (path.endsWith('/src/hooks/useCurrentUser.js')) return 'export function useCurrentUser() { return { id: "test-owner", accountType: "owner" }; }';
      return null;
    } }],
  });
  try {
    const { StockAlertsView } = await server.ssrLoadModule('/src/features/categories/common/modules/inventory/StockAlertsView.jsx');
    const row = { _id: 'alert-1', productId: 'product-1', description: 'API product', code: 'REAL-1', brand: 'Brand', warehouse: 'Main', branch: 'North', physicalQty: 2, reservedQty: 1, availableQty: 1, minStockLevel: 3, maxStockLevel: 10, reorderQty: 9, alertType: 'Low Stock', state: 'Open', thresholdSource: 'Warehouse override' };
    const response = { data: [row], total: 1, stats: { lowStock: 1, outOfStock: 0, overstock: 0, reorderRequired: 1, reviewed: 0 }, filterOptions: { warehouse: ['Main'], branch: ['North'] }, refreshedAt: '2026-04-01T10:00:00Z' };
    const render = (automobile, overrides = {}) => {
      globalThis.__gobookAlertFixture = { response, loading: false, error: '', refresh() {}, ...overrides };
      return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(StockAlertsView, { automobile })));
    };
    for (const automobile of [false, true]) {
      const html = render(automobile);
      assert.ok(html.includes('API product'));
      assert.ok(html.includes('North'));
      assert.ok(html.includes('Warehouse override'));
      assert.ok(html.includes('stockAlert=alert-1'));
      assert.ok(html.includes('Reorder Required'));
      assert.ok(html.includes('Thresholds'));
      assert.ok(render(automobile, { loading: true }).includes('Loading real stock alerts'));
      assert.ok(render(automobile, { error: 'Offline' }).includes('Retry'));
      assert.ok(render(automobile, { response: { ...response, total: 0, data: [] } }).includes('No unresolved stock alerts match'));
    }
  } finally {
    delete globalThis.__gobookAlertFixture;
    await server.close();
  }
});

test('refresh subscriptions and purchase-order prefill use existing APIs without automatic posting', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const hook = read('../src/hooks/useStockAlerts.js');
  const editor = read('../src/features/categories/retail/modules/sales/shared/CreateDocumentPage.jsx');
  const view = read('../src/features/categories/common/modules/inventory/StockAlertsView.jsx');
  assert.ok(hook.includes('30000'));
  assert.ok(hook.includes('gobook:stock-changed'));
  assert.ok(hook.includes("addEventListener('focus'"));
  assert.ok(hook.includes('api.invListAlerts'));
  assert.ok(editor.includes('api.invAlertPurchaseOrderSeed(sourceId)'));
  assert.ok(editor.includes('setItems(seed.items.map(normalizeInvoiceLineItem))'));
  assert.equal(view.includes('localStorage'), false);
  assert.equal(view.includes('minimum(row) * 2'), false);
});
