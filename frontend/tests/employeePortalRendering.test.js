import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

test('scoped employee dashboard routes render the intended screen and keep navigation scoped', { timeout: 30000 }, async () => {
  const base = '/employee/anbu-retail-a1b2c3d4/EMP-001';
  const user = { name: 'Employee One', employeeId: 'EMP-001', ownerUserId: '507f1f77bcf86cd799439011', role: 'employee', portalBasePath: base, loginPath: '/employee-login/anbu-retail/507f1f77bcf86cd799439011/EMP-001?code=test' };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => key === 'employee_portal_user' ? JSON.stringify(user) : null, setItem() {}, removeItem() {} } });
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { EmployeePortalRoutes } = await server.ssrLoadModule('/src/features/employee-management/EmployeePortalRoutes.jsx');
    const render = (path) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null, React.createElement(Route, { path: '/employee/*', element: React.createElement(EmployeePortalRoutes) }))));
    const dashboard = render(base);
    assert.ok(dashboard.includes('Welcome, Employee One'));
    assert.ok(dashboard.includes(`href="${base}/attendance"`));
    assert.ok(dashboard.includes(`href="${base}/documents"`));
    assert.ok(render(base + '/documents').includes('Documents uploaded by your business administrator'));
    assert.ok(render(base + '/permissions').includes('Request permission for part of a working day'));
    assert.ok(render(base + '/profile').includes('Contact your business administrator for changes'));
    const foreign = render(base.replace('EMP-001', 'EMP-002') + '/dashboard');
    assert.equal(foreign.includes('Welcome, Employee One'), false);
  } finally {
    await server.close();
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
  }
});
