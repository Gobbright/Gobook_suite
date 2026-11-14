import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { AiAssistantWidget } from '../components/ai/AiAssistantWidget.jsx';
import { CommandPalette } from '../components/layout/CommandPalette.jsx';
import { MobileBottomNav } from '../components/layout/MobileBottomNav.jsx';
import { Sidebar } from '../components/layout/Sidebar.jsx';
import { Topbar } from '../components/layout/Topbar.jsx';
import { KeyboardModeProvider } from './KeyboardModeContext.jsx';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useEdgeSidebar } from '../hooks/useEdgeSidebar.js';
import { BusinessEmailProvider } from './BusinessEmailContext.jsx';
import { NavigationCountsProvider } from './NavigationCountsContext.jsx';
import { BusinessEmailGate, BusinessEmailNotice } from '../components/layout/BusinessEmailNotice.jsx';
import './businessEmail.css';

const SHORTCUT_HINTS = [
  ['Alt+Q', 'Search'],
  ['Alt+D', 'Dashboard'],
  ['Alt+S', 'Sales'],
  ['Alt+P', 'Purchase'],
  ['Alt+I', 'Inventory'],
  ['Alt+C', 'Customers'],
  ['Shift+G', 'GST'],
  ['Alt+R', 'Reports'],
  ['Alt+T', 'Business Settings'],
];

function ShortcutBar() {
  return (
    <div className="app-shortcut-bar" aria-label="Keyboard shortcuts">
      {SHORTCUT_HINTS.map(([shortcut, label]) => (
        <span key={shortcut}>
          <kbd>{shortcut}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

function AppShellInner({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { close: closeSidebar, toggle: toggleSidebar } = useEdgeSidebar(setSidebarOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const currentUser = useCurrentUser();
  const category = currentUser?.category || 'other';
  const { pathname } = useLocation();
  const ledgerWorkspace = pathname === '/ledger/new' || pathname === '/trial-balance' || pathname === '/pnl' || pathname === '/balance-sheet' || pathname === '/cash-book' || pathname === '/bank-book' || /^\/journal-entry\/(new|[^/]+\/edit)$/.test(pathname);
  useEffect(() => { closeSidebar(); }, [pathname, closeSidebar]);

  useGlobalShortcuts({ onOpenPalette: () => setPaletteOpen(true) });

  return (
    <div className="app-shell flex h-dvh min-h-screen overflow-hidden" data-app-category={category}>
      {(!ledgerWorkspace || sidebarOpen) && <Sidebar mobileOpen={sidebarOpen} onClose={closeSidebar} />}
      <main className="app-main flex-1 min-w-0 flex flex-col overflow-hidden">
        <Topbar sidebarOpen={sidebarOpen} onMenuClick={toggleSidebar} onOpenSearch={() => setPaletteOpen(true)} />
        <div className="app-content flex-1 overflow-y-auto overflow-x-hidden">
          <BusinessEmailGate>{children}</BusinessEmailGate>
        </div>
      </main>
      {!ledgerWorkspace && <AiAssistantWidget />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {!ledgerWorkspace && <MobileBottomNav />}
      {!ledgerWorkspace && <ShortcutBar />}
      <BusinessEmailNotice />
    </div>
  );
}

export function AppShell({ children }) {
  const user = useCurrentUser();
  return (
    <KeyboardModeProvider>
      <BusinessEmailProvider key={user?.id || user?._id || ''}>
        <NavigationCountsProvider><AppShellInner>{children}</AppShellInner></NavigationCountsProvider>
      </BusinessEmailProvider>
    </KeyboardModeProvider>
  );
}
