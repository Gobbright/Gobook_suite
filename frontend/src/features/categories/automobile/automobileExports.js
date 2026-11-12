export const EXPORT_CATEGORIES = [
  { key: 'sales', label: 'Sales', description: 'Sales invoices and sales records', collections: ['invoices', 'salesRecords'] },
  { key: 'purchase', label: 'Purchase', description: 'Purchase documents and suppliers', collections: ['invoices', 'vendors'] },
  { key: 'inventory', label: 'Inventory', description: 'Products, stock and categories', collections: ['products', 'productCategories', 'productSubcategories', 'productBrands', 'warehouses', 'stockIn', 'stockOut'] },
  { key: 'accounting', label: 'Accounting', description: 'Vouchers, ledger, journal and payments', collections: ['ledgerAccounts', 'journalEntries', 'accountingVouchers', 'accountingPostings', 'cashBookEntries', 'bankBookEntries', 'payments'] },
  { key: 'gst', label: 'GST', description: 'GST returns and reconciliation', collections: ['gstr1', 'gstr3b', 'gstReconciliation'] },
  { key: 'customers', label: 'Customers', description: 'Customer, lead and follow-up records', collections: ['customers', 'leads', 'followUps'] },
  { key: 'suppliers', label: 'Suppliers', description: 'Supplier master data', collections: ['vendors'] },
  { key: 'employee', label: 'Employee', description: 'Employees, attendance, leave and payroll', collections: ['employees', 'attendance', 'attendanceCorrections', 'leaves', 'payroll', 'documents', 'notices'] },
  { key: 'online', label: 'Online Store', description: 'Available online store module records', collections: ['moduleRecords'] },
  { key: 'other', label: 'Other', description: 'Settings, branches and additional data', collections: ['businessSettings', 'branches', 'moduleRecords', 'emailCampaigns', 'whatsAppCampaigns'] },
];
export function availableExportKeys(category, collections) { const available = new Set(collections.map((row) => row.key)); return (EXPORT_CATEGORIES.find((row) => row.key === category)?.collections || []).filter((key) => available.has(key)); }
