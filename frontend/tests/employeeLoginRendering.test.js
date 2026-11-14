import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

test('the common employee login is usable without a personal URL or QR', { timeout: 30000 }, async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { EmployeeLoginRoute } = await server.ssrLoadModule('/src/features/employee-management/EmployeePortalRoutes.jsx');
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/employee-login'] }, React.createElement(EmployeeLoginRoute)));
    for (const id of ['employee-login-business', 'employee-login-id', 'employee-login-password']) assert.ok(html.includes(`id="${id}"`));
    assert.equal((html.match(/<input\b/g) || []).length, 3);
    assert.ok(html.includes('Employee ID or email'));
    assert.equal(html.includes('Business owner&#x27;s login email'), false);
    assert.ok(html.includes('Continue to email verification'));
    assert.equal(html.includes('id="employee-login-otp"'), false);
    assert.equal(html.includes('Open the employee login URL or scan the QR code'), false);
  } finally {
    await server.close();
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
  }
});
