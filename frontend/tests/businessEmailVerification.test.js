import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresVerifiedBusinessEmail, businessEmailVerificationInput } from '../src/services/businessEmail.js';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

test('email verification accepts grouped app passwords and rejects missing or incorrect lengths', () => {
  assert.deepEqual(businessEmailVerificationInput(' OWNER@GMAIL.COM ', 'abcd efgh ijkl mnop'), { email: 'owner@gmail.com', appPassword: 'abcdefghijklmnop' });
  for (const password of ['', 'abcdefghijkl', 'abcdefghijklmnopq']) assert.throws(() => businessEmailVerificationInput('owner@gmail.com', password), /16-character/);
  assert.throws(() => businessEmailVerificationInput('invalid-email', 'abcdefghijklmnop'), /valid business Gmail/);
});

test('email dependent routes require verification while setup and normal work remain available', () => {
  for (const path of ['/email-marketing', '/email-marketing/settings', '/employee-management/employees/add', '/employee-management/employees/add/', '/Email-Marketing']) assert.equal(requiresVerifiedBusinessEmail(path), true);
  for (const path of ['/dashboard', '/email-setup', '/business-settings', '/employee-management/settings', '/employee-management/employees', '/billing/invoice/new']) assert.equal(requiresVerifiedBusinessEmail(path), false);
});

test('protected screens never render employee or marketing content before email status loads', async () => {
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { BusinessEmailGate } = await server.ssrLoadModule('/src/components/layout/BusinessEmailNotice.jsx');
    for (const path of ['/email-marketing', '/employee-management/employees/add', '/email-setup', '/dashboard']) {
      const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(BusinessEmailGate, null, React.createElement('p', null, 'Protected feature content'))));
      assert.equal(html.includes('Protected feature content'), !requiresVerifiedBusinessEmail(path));
    }
    const { BusinessEmailSetupPage } = await server.ssrLoadModule('/src/features/auth/BusinessEmailSetupPage.jsx');
    const setup = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(BusinessEmailSetupPage)));
    const passwordInput = setup.match(/<input[^>]*id="business-sender-password"[^>]*>/)?.[0];
    assert.ok(passwordInput, 'Setup must show the password input while status is loading');
    assert.equal(/disabled|readonly/i.test(passwordInput), false, 'Status loading or a missing permission flag must not prevent typing');
  } finally { await server.close(); }
});
