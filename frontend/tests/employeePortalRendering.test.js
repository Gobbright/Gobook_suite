import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

test('scoped employee dashboard routes render the intended screen and keep navigation scoped', { timeout: 30000 }, async () => {
  const base = '/employee/anbu-retail-a1b2c3d4/EMP-001';
  const user = { name: 'Employee One', employeeId: 'EMP-001', ownerUserId: '507f1f77bcf86cd799439011', businessName: 'Anbu Retail', businessLogoUrl: '/api/files/logos/business-logo', role: 'employee', portalBasePath: base, loginPath: '/employee-login/anbu-retail/507f1f77bcf86cd799439011/EMP-001?code=test' };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => key === 'employee_portal_user' ? JSON.stringify(user) : null, setItem() {}, removeItem() {} } });
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { EmployeePortalRoutes } = await server.ssrLoadModule('/src/features/employee-management/EmployeePortalRoutes.jsx');
    const render = (path) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null, React.createElement(Route, { path: '/employee/*', element: React.createElement(EmployeePortalRoutes) }))));
    const dashboard = render(base);
    assert.ok(dashboard.includes('Welcome, Employee One'));
    assert.ok(dashboard.includes('/api/files/logos/business-logo'));
    assert.ok(dashboard.includes('alt="Anbu Retail logo"'));
    assert.equal(dashboard.includes('gobook-logo-full.png'), false);
    assert.equal(dashboard.includes('GoBook workforce workspace'), false);
    assert.equal(dashboard.includes('aria-label="Menu"'), false);
    assert.equal(dashboard.match(/<nav[^>]*aria-label="Employee navigation"[\s\S]*?<\/nav>/)?.[0].includes('<svg'), false);
    const navigation = dashboard.match(/<nav[^>]*aria-label="Employee navigation"[\s\S]*?<\/nav>/)?.[0];
    assert.equal((navigation.match(/class="employee-nav-trigger"/g) || []).length, 5);
    assert.equal((navigation.match(/class="employee-nav-direct/g) || []).length, 2);
    assert.equal((navigation.match(/aria-expanded="true"/g) || []).length, 0);
    for (const label of ['Dashboard', 'Notifications', 'My Work', 'Attendance', 'Leave &amp; Permissions', 'Payroll', 'My Account']) assert.ok(navigation.includes(`<span>${label}</span>`));
    for (const screen of ['attendance', 'attendance/monthly', 'attendance/correction', 'leave/apply', 'leave/status', 'leave/history', 'permissions', 'holidays', 'payslips', 'profile', 'documents', 'notifications', 'work']) {
      const screenNavigation = render(`${base}/${screen}`).match(/<nav[^>]*aria-label="Employee navigation"[\s\S]*?<\/nav>/)?.[0];
      assert.equal((screenNavigation.match(/aria-expanded="true"/g) || []).length, screen === 'notifications' ? 0 : 1);
      const expandedPanel = screenNavigation.match(/<div class="employee-subnav" id="[^"]+">([\s\S]*?)<\/div>/)?.[1];
      if (screen === 'notifications') assert.ok([...screenNavigation.matchAll(/<a\b[^>]*>/g)].find(([tag]) => tag.includes(`href="${base}/notifications"`))?.[0].includes('aria-current="page"'));
      else assert.ok(expandedPanel?.includes('aria-current="page"'), `Current section should open for ${screen}`);
    }
    assert.ok(dashboard.includes(`href="${base}/attendance"`));
    assert.ok(dashboard.includes(`href="${base}/documents"`));
    assert.ok(dashboard.includes(`href="${base}/work"`));
    const work = render(base + '/work?status=Completed');
    assert.ok(work.includes('<h1>My Work</h1>'));
    assert.equal((work.match(/aria-current="page"/g) || []).length, 1);
    assert.ok(work.includes('Completed Work'));
    const inProgress = render(base + '/work?q=fixture&status=In+Progress&page=2');
    assert.equal((inProgress.match(/aria-current="page"/g) || []).length, 1);
    const activeWorkLink = inProgress.match(/<a\b[^>]*aria-current="page"[^>]*>In Progress<\/a>/)?.[0];
    assert.ok(activeWorkLink?.includes(`href="${base}/work?status=In%20Progress"`));
    assert.ok(render(base + '/documents').includes('Documents uploaded by your business administrator'));
    assert.ok(render(base + '/permissions').includes('Request permission for part of a working day'));
    assert.ok(render(base + '/profile').includes('Contact your business administrator for changes'));
    assert.ok(render(base + '/profile').includes(`href="${base}/documents"`));
    assert.ok(render(base + '/documents').includes(`href="${base}/profile"`));
    assert.ok(render(base + '/leave/history').includes('<h1>Leave History</h1>'));
    const foreign = render(base.replace('EMP-001', 'EMP-002') + '/dashboard');
    assert.equal(foreign.includes('Welcome, Employee One'), false);

    const { EmployeeDashboardContent } = await server.ssrLoadModule('/src/features/employee-management/pages/employee/Dashboard.jsx');
    const renderContent = (props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(EmployeeDashboardContent, { user, month: '2026-11', setMonth() {}, reload() {}, ...props })));
    const loaded = renderContent({ loading: false, data: { presentDays: 12, pendingLeaves: 2, pendingPermissions: 1, documents: 3, salary: { net: 28000, status: 'Paid' }, recentAttendance: [{ date: '2026-11-11', checkIn: '09:00', checkOut: '18:00', hours: '9h', status: 'Present' }] } });
    assert.ok(loaded.includes('28,000'));
    assert.ok(loaded.includes('Paid'));
    assert.ok(loaded.includes('09:00'));
    assert.ok(loaded.includes('November 2026'));
    for (const screen of ['attendance', 'leave/apply', 'permissions', 'documents', 'payslips', 'profile']) assert.ok(loaded.includes(`href="${base}/${screen}"`));
    assert.equal(loaded.includes('href="/employee/attendance"'), false);
    const loading = renderContent({ loading: true });
    assert.ok(loading.includes('Loading attendance'));
    assert.equal(loading.includes('No attendance recorded'), false);
    const empty = renderContent({ loading: false, data: {} });
    assert.ok(empty.includes('No attendance recorded for this month yet.'));
    assert.ok(empty.includes('once payroll is recorded'));
    const failed = renderContent({ loading: false, error: 'Service unavailable' });
    assert.ok(failed.includes('role="alert"'));
    assert.ok(failed.includes('Try again'));
    assert.equal(failed.includes('No attendance recorded'), false);
    const { BusinessLogo } = await server.ssrLoadModule('/src/features/employee-management/components/common/BusinessLogo.jsx');
    const fallback = renderToStaticMarkup(React.createElement(BusinessLogo, { user: { businessName: 'Anbu Retail', businessLogoUrl: 'javascript:alert(1)' } }));
    assert.ok(fallback.includes('>AR</span>'));
    assert.equal(fallback.includes('<img'), false);
    const { DataTable } = await server.ssrLoadModule('/src/features/employee-management/components/common/DataTable.jsx');
    const zeroValues = renderToStaticMarkup(React.createElement(DataTable, { columns: [{ key: 'deductions', label: 'Deductions' }], rows: [{ id: 'zero-payroll', deductions: 0 }] }));
    assert.ok(zeroValues.includes('data-label="Deductions">0</td>'));
  } finally {
    await server.close();
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
  }
});
