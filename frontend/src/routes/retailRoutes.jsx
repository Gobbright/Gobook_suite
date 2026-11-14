import { lazyPage } from './lazyPage.jsx';

const LedgerWorkspace = lazyPage(() => import('../features/categories/common/modules/accounting/LedgerWorkspace.jsx'), 'LedgerWorkspace');
const InventoryListLayout = lazyPage(() => import('../features/categories/automobile/InventoryListLayout.jsx'), 'InventoryListLayout');
const BalanceSheetPage = lazyPage(() => import('../features/categories/common/modules/accounting/BalanceSheetPage.jsx'), 'BalanceSheetPage');
const AccountingReportsPage = lazyPage(() => import('../features/categories/common/modules/accounting/AccountingReportsPage.jsx'), 'AccountingReportsPage');
const BankBookPage = lazyPage(() => import('../features/categories/common/modules/accounting/BankBookPage.jsx'), 'BankBookPage');
const BankReconciliationPage = lazyPage(() => import('../features/categories/common/modules/accounting/BankReconciliationPage.jsx'), 'BankReconciliationPage');
const CashBookPage = lazyPage(() => import('../features/categories/common/modules/accounting/CashBookPage.jsx'), 'CashBookPage');
const AccountingVoucherPage = lazyPage(() => import('../features/categories/common/modules/accounting/AccountingVoucherPage.jsx'), 'AccountingVoucherPage');
const JournalEntryPage = lazyPage(() => import('../features/categories/common/modules/accounting/JournalEntryPage.jsx'), 'JournalEntryPage');
const LedgerPage = lazyPage(() => import('../features/categories/common/modules/accounting/LedgerPage.jsx'), 'LedgerPage');
const PnlPage = lazyPage(() => import('../features/categories/common/modules/accounting/PnlPage.jsx'), 'PnlPage');
const TrialBalancePage = lazyPage(() => import('../features/categories/common/modules/accounting/TrialBalancePage.jsx'), 'TrialBalancePage');
const DeletePeriodPage = lazyPage(() => import('../features/categories/common/modules/data-management/DataManagementPage.jsx'), 'DeletePeriodPage');
const ExportDataPage = lazyPage(() => import('../features/categories/common/modules/data-management/DataManagementPage.jsx'), 'ExportDataPage');
const ImportDataPage = lazyPage(() => import('../features/categories/common/modules/data-management/DataManagementPage.jsx'), 'ImportDataPage');
const CustomersPage = lazyPage(() => import('../features/categories/common/modules/crm/CustomersPage.jsx'), 'CustomersPage');
const FollowUpsPage = lazyPage(() => import('../features/categories/common/modules/crm/FollowUpsPage.jsx'), 'FollowUpsPage');
const LeadsPage = lazyPage(() => import('../features/categories/common/modules/crm/LeadsPage.jsx'), 'LeadsPage');
const GstDashboard = lazyPage(() => import('../features/categories/common/modules/gst/GstDashboard.jsx'), 'GstDashboard');
const GstReconciliation = lazyPage(() => import('../features/categories/common/modules/gst/GstReconciliation.jsx'), 'GstReconciliation');
const GstReports = lazyPage(() => import('../features/categories/common/modules/gst/GstReports.jsx'), 'GstReports');
const Gstr1Page = lazyPage(() => import('../features/categories/common/modules/gst/Gstr1Page.jsx'), 'Gstr1Page');
const Gstr3bPage = lazyPage(() => import('../features/categories/common/modules/gst/Gstr3bPage.jsx'), 'Gstr3bPage');
const Gstr9Page = lazyPage(() => import('../features/categories/common/modules/gst/Gstr9Page.jsx'), 'Gstr9Page');
const AttendancePage = lazyPage(() => import('../features/categories/common/modules/hr-payroll/AttendancePage.jsx'), 'AttendancePage');
const DocumentsPage = lazyPage(() => import('../features/categories/common/modules/hr-payroll/DocumentsPage.jsx'), 'DocumentsPage');
const EmployeesPage = lazyPage(() => import('../features/categories/common/modules/hr-payroll/EmployeesPage.jsx'), 'EmployeesPage');
const LeaveManagementPage = lazyPage(() => import('../features/categories/common/modules/hr-payroll/LeaveManagementPage.jsx'), 'LeaveManagementPage');
const PayrollPage = lazyPage(() => import('../features/categories/common/modules/hr-payroll/PayrollPage.jsx'), 'PayrollPage');
const BarcodePage = lazyPage(() => import('../features/categories/common/modules/inventory/BarcodePage.jsx'), 'BarcodePage');
const BrandsPage = lazyPage(() => import('../features/categories/common/modules/inventory/BrandsPage.jsx'), 'BrandsPage');
const CategoriesPage = lazyPage(() => import('../features/categories/common/modules/inventory/CategoriesPage.jsx'), 'CategoriesPage');
const ProductMastersPage = lazyPage(() => import('../features/categories/common/modules/inventory/ProductMastersPage.jsx'), 'ProductMastersPage');
const SubcategoriesPage = lazyPage(() => import('../features/categories/common/modules/inventory/SubcategoriesPage.jsx'), 'SubcategoriesPage');
const ProductsPage = lazyPage(() => import('../features/categories/common/modules/inventory/ProductsPage.jsx'), 'ProductsPage');
const ServiceFormPage = lazyPage(() => import('../features/categories/common/modules/inventory/ProductsPage.jsx'), 'ServiceFormPage');
const StockAlertsPage = lazyPage(() => import('../features/categories/common/modules/inventory/StockAlertsPage.jsx'), 'StockAlertsPage');
const StockInPage = lazyPage(() => import('../features/categories/common/modules/inventory/StockInPage.jsx'), 'StockInPage');
const StockLedgerPage = lazyPage(() => import('../features/categories/common/modules/inventory/StockLedgerPage.jsx'), 'StockLedgerPage');
const StockOutPage = lazyPage(() => import('../features/categories/common/modules/inventory/StockOutPage.jsx'), 'StockOutPage');
const StockSummaryPage = lazyPage(() => import('../features/categories/common/modules/inventory/StockSummaryPage.jsx'), 'StockSummaryPage');
const WarehousePage = lazyPage(() => import('../features/categories/common/modules/inventory/WarehousePage.jsx'), 'WarehousePage');
const EmailMarketingPage = lazyPage(() => import('../features/categories/common/modules/more-modules/EmailMarketingPage.jsx'), 'EmailMarketingPage');
const OnlineStoreLitePage = lazyPage(() => import('../features/categories/common/modules/online-store/OnlineStoreLitePage.jsx'), 'OnlineStoreLitePage');
const ReportsPage = lazyPage(() => import('../features/categories/common/modules/more-modules/ReportsPage.jsx'), 'ReportsPage');
const SalesManagementPage = lazyPage(() => import('../features/categories/common/modules/more-modules/SalesManagementPage.jsx'), 'SalesManagementPage');
const VendorManagementPage = lazyPage(() => import('../features/categories/common/modules/more-modules/VendorManagementPage.jsx'), 'VendorManagementPage');
const WhatsAppProviderPage = lazyPage(() => import('../features/categories/common/modules/more-modules/WhatsAppProviderPage.jsx'), 'WhatsAppProviderPage');
const WhatsAppBusinessPage = lazyPage(() => import('../features/categories/common/modules/more-modules/WhatsAppBusinessPage.jsx'), 'WhatsAppBusinessPage');
const ModuleReportsPage = lazyPage(() => import('../features/categories/common/modules/reports/ModuleReportsPage.jsx'), 'ModuleReportsPage');
const AuditReportPage = lazyPage(() => import('../features/categories/common/modules/settings/AuditReportPage.jsx'), 'AuditReportPage');
const BusinessSettingsPage = lazyPage(() => import('../features/categories/common/modules/settings/BusinessSettingsPage.jsx'), 'BusinessSettingsPage');
const MultiBranchPage = lazyPage(() => import('../features/categories/common/modules/settings/MultiBranchPage.jsx'), 'MultiBranchPage');
const TemplatesPage = lazyPage(() => import('../features/categories/common/modules/settings/TemplatesPage.jsx'), 'TemplatesPage');
const UsersRolesPage = lazyPage(() => import('../features/categories/common/modules/settings/UsersRolesPage.jsx'), 'UsersRolesPage');

// Common to every category (GST, Accounting, CRM, Inventory, HR & Payroll, More Modules, Settings).
export const commonRoutes = [
  { path: '/gst-dashboard', element: <GstDashboard /> },
  { path: '/gstr-1', element: <Gstr1Page /> },
  { path: '/gstr-3b', element: <Gstr3bPage /> },
  { path: '/gstr-9', element: <Gstr9Page /> },
  { path: '/gst-reconciliation', element: <GstReconciliation /> },
  { path: '/gst-reports', element: <GstReports /> },

  { path: '/vouchers', element: <AccountingVoucherPage /> },
  { path: '/vouchers/new', element: <AccountingVoucherPage /> },
  { path: '/accounting-reports', element: <AccountingReportsPage /> },
  { path: '/ledger', element: <LedgerPage /> },
  { path: '/ledger/new', element: <LedgerWorkspace /> },
  { path: '/journal-entry', element: <JournalEntryPage /> },
  { path: '/journal-entry/new', element: <AccountingVoucherPage journal /> },
  { path: '/journal-entry/:id/edit', element: <AccountingVoucherPage journal /> },
  { path: '/trial-balance', element: <TrialBalancePage /> },
  { path: '/pnl', element: <PnlPage /> },
  { path: '/balance-sheet', element: <BalanceSheetPage /> },
  { path: '/cash-book', element: <CashBookPage /> },
  { path: '/bank-book', element: <BankBookPage /> },
  { path: '/bank-reconciliation', element: <BankReconciliationPage /> },

  { path: '/customers', element: <CustomersPage /> },
  { path: '/leads', element: <LeadsPage /> },
  { path: '/follow-ups', element: <FollowUpsPage /> },
  { path: '/crm-reports', element: <ModuleReportsPage type="crm" /> },
  { path: '/collections-reports', element: <ModuleReportsPage type="collections" /> },
  { path: '/accounting-module-reports', element: <ModuleReportsPage type="accounting" /> },
  { path: '/tax-review-reports', element: <ModuleReportsPage type="tax" /> },
  { path: '/expenses-reports', element: <ModuleReportsPage type="expenses" /> },
  { path: '/ecommerce-reports', element: <ModuleReportsPage type="ecommerce" /> },
  { path: '/audit-exception-reports', element: <ModuleReportsPage type="audit" /> },

  { path: '/products', element: <InventoryListLayout><ProductsPage initialItemType="Product" lockedItemType="Product" /></InventoryListLayout> },
  { path: '/services', element: <InventoryListLayout><ProductsPage initialItemType="Service" lockedItemType="Service" /></InventoryListLayout> },
  { path: '/services/new', element: <ServiceFormPage /> },
  { path: '/services/:id/edit', element: <ServiceFormPage /> },
  { path: '/product-masters', element: <InventoryListLayout><ProductMastersPage /></InventoryListLayout> },
  { path: '/product-categories', element: <InventoryListLayout><CategoriesPage /></InventoryListLayout> },
  { path: '/product-subcategories', element: <InventoryListLayout><SubcategoriesPage /></InventoryListLayout> },
  { path: '/brands', element: <InventoryListLayout><BrandsPage /></InventoryListLayout> },
  { path: '/stock-summary', element: <InventoryListLayout><StockSummaryPage /></InventoryListLayout> },
  { path: '/stock-ledger', element: <InventoryListLayout><StockLedgerPage /></InventoryListLayout> },
  { path: '/inventory-reports', element: <ModuleReportsPage type="inventory" /> },
  { path: '/service-reports', element: <ModuleReportsPage type="service" /> },
  { path: '/stock-in', element: <InventoryListLayout><StockInPage /></InventoryListLayout> },
  { path: '/stock-out', element: <InventoryListLayout><StockOutPage /></InventoryListLayout> },
  { path: '/warehouse', element: <InventoryListLayout><WarehousePage /></InventoryListLayout> },
  { path: '/barcode', element: <InventoryListLayout><BarcodePage /></InventoryListLayout> },
  { path: '/stock-alerts', element: <InventoryListLayout><StockAlertsPage /></InventoryListLayout> },

  { path: '/employees', element: <EmployeesPage /> },
  { path: '/attendance', element: <AttendancePage /> },
  { path: '/payroll', element: <PayrollPage /> },
  { path: '/leave-management', element: <LeaveManagementPage /> },
  { path: '/documents', element: <DocumentsPage /> },
  { path: '/hr-reports', element: <ModuleReportsPage type="hr" /> },

  { path: '/sales-management', element: <SalesManagementPage /> },
  { path: '/vendor-management', element: <VendorManagementPage /> },
  { path: '/whatsapp-business', element: <WhatsAppProviderPage /> },
  { path: '/whatsapp/settings', element: <WhatsAppProviderPage /> },
  { path: '/online-store', element: <OnlineStoreLitePage /> },
  { path: '/online-store/:section', element: <OnlineStoreLitePage /> },
  { path: '/email-marketing', element: <EmailMarketingPage /> },
  { path: '/whatsapp-marketing', element: <WhatsAppBusinessPage /> },
  { path: '/reports', element: <ReportsPage /> },

  { path: '/multi-branch', element: <MultiBranchPage /> },
  { path: '/users-roles', element: <UsersRolesPage /> },
  { path: '/audit-report', element: <AuditReportPage /> },
  { path: '/business-settings', element: <BusinessSettingsPage /> },
  { path: '/templates', element: <TemplatesPage /> },
  { path: '/data-management', element: <ExportDataPage /> },
  { path: '/data-management/export', element: <ExportDataPage /> },
  { path: '/data-management/import', element: <ImportDataPage /> },
  { path: '/data-management/delete-period', element: <DeletePeriodPage /> },
];

// Retail-only (Sales / Billing reports Ã¢â‚¬â€ tied to the Sales nav section, which stays Retail-exclusive).
export const retailRoutes = [
  { path: '/sales-reports', element: <ModuleReportsPage type="sales" /> },
  { path: '/purchase-reports', element: <ModuleReportsPage type="purchase" /> },
];
