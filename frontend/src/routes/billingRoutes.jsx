import { lazyPage } from './lazyPage.jsx';
import { useParams } from 'react-router-dom';

import { documentConfigs } from '../features/categories/retail/modules/sales/documentConfigs.js';

const CreditNotePage = lazyPage(() => import('../features/categories/retail/modules/sales/CreditNotePage.jsx'), 'CreditNotePage');
const BillOfSupplyPage = lazyPage(() => import('../features/categories/retail/modules/sales/BillOfSupplyPage.jsx'), 'BillOfSupplyPage');
const DebitNotePage = lazyPage(() => import('../features/categories/retail/modules/sales/DebitNotePage.jsx'), 'DebitNotePage');
const DeliveryChallanPage = lazyPage(() => import('../features/categories/retail/modules/sales/DeliveryChallanPage.jsx'), 'DeliveryChallanPage');
const EInvoicePage = lazyPage(() => import('../features/categories/retail/modules/sales/EInvoicePage.jsx'), 'EInvoicePage');
const EWayBillFormPage = lazyPage(() => import('../features/categories/retail/modules/sales/EWayBillPage.jsx'), 'EWayBillFormPage');
const EWayBillPage = lazyPage(() => import('../features/categories/retail/modules/sales/EWayBillPage.jsx'), 'EWayBillPage');
const InvoicePage = lazyPage(() => import('../features/categories/retail/modules/sales/InvoicePage.jsx'), 'InvoicePage');
const PurchaseEntryPage = lazyPage(() => import('../features/categories/retail/modules/sales/PurchaseEntryPage.jsx'), 'PurchaseEntryPage');
const PurchaseOrderPage = lazyPage(() => import('../features/categories/retail/modules/sales/PurchaseOrderPage.jsx'), 'PurchaseOrderPage');
const QuotationPage = lazyPage(() => import('../features/categories/retail/modules/sales/QuotationPage.jsx'), 'QuotationPage');
const ReceivablesPage = lazyPage(() => import('../features/categories/retail/modules/sales/ReceivablesPage.jsx'), 'ReceivablesPage');
const SalesReturnPage = lazyPage(() => import('../features/categories/retail/modules/sales/SalesReturnPage.jsx'), 'SalesReturnPage');
const SupplierReturnPage = lazyPage(() => import('../features/categories/retail/modules/sales/SupplierReturnPage.jsx'), 'SupplierReturnPage');
const PharmacyBillListPage = lazyPage(() => import('../features/categories/hospital/modules/pharmacy/PharmacyBillListPage.jsx'), 'PharmacyBillListPage');
const CreateDocumentPage = lazyPage(() => import('../features/categories/retail/modules/sales/shared/CreateDocumentPage.jsx'), 'CreateDocumentPage');
const InvoiceViewPage = lazyPage(() => import('../features/categories/retail/modules/sales/shared/InvoiceViewPage.jsx'), 'InvoiceViewPage');
const DashboardPage = lazyPage(() => import('../pages/DashboardPage.jsx'), 'DashboardPage');

export function InvoiceEditRoute({ documentType }) {
  const { id } = useParams();
  return <CreateDocumentPage documentType={documentType} invoiceId={id} />;
}

export function InvoiceViewRoute({ documentType }) {
  const { id } = useParams();
  return <InvoiceViewPage invoiceId={id} documentType={documentType} />;
}

export function EWayBillEditRoute() {
  const { id } = useParams();
  return <EWayBillFormPage ewbId={id} />;
}

export function GenericBillingRoute() {
  const { documentType } = useParams();
  if (documentConfigs[documentType]) {
    return <CreateDocumentPage documentType={documentType} />;
  }
  return <DashboardPage />;
}

export const b2cBillingRoute = <CreateDocumentPage key="b2c-invoice" documentType="invoice" defaultBillingMode="b2c" />;

export const billingRoutes = [
  { slug: 'invoice', documentType: 'invoice', list: <InvoicePage />, form: <CreateDocumentPage documentType="invoice" /> },
  { slug: 'bill-of-supply', documentType: 'bill-of-supply', list: <BillOfSupplyPage />, form: <CreateDocumentPage documentType="bill-of-supply" /> },
  { slug: 'quotation', documentType: 'quotation', list: <QuotationPage />, form: <CreateDocumentPage documentType="quotation" /> },
  { slug: 'purchase-order', documentType: 'purchase-order', list: <PurchaseOrderPage />, form: <CreateDocumentPage documentType="purchase-order" /> },
  { slug: 'purchase-entry', documentType: 'purchase-entry', list: <PurchaseEntryPage />, form: <CreateDocumentPage documentType="purchase-entry" /> },
  { slug: 'credit-note', documentType: 'credit-note', list: <CreditNotePage />, form: <CreateDocumentPage documentType="credit-note" /> },
  { slug: 'debit-note', documentType: 'debit-note', list: <DebitNotePage />, form: <CreateDocumentPage documentType="debit-note" /> },
  { slug: 'sales-return', documentType: 'sales-return', list: <SalesReturnPage />, form: <CreateDocumentPage documentType="sales-return" /> },
  { slug: 'supplier-return', documentType: 'supplier-return', list: <SupplierReturnPage />, form: <CreateDocumentPage documentType="supplier-return" /> },
  { slug: 'delivery-challan', documentType: 'delivery-challan', list: <DeliveryChallanPage />, form: <CreateDocumentPage documentType="delivery-challan" /> },
  { slug: 'e-invoice', documentType: 'e-invoice', list: <EInvoicePage />, form: <CreateDocumentPage documentType="e-invoice" /> },
];

export const eWayBillRoutes = {
  list: <EWayBillPage />,
  form: <EWayBillFormPage />,
  edit: <EWayBillEditRoute />,
  view: <InvoiceViewRoute documentType="e-way-bill" />,
};

export const receivablesRoute = <ReceivablesPage />;

export const pharmacyBillRoutes = {
  list: <PharmacyBillListPage />,
  form: <CreateDocumentPage documentType="pharmacy-bill" />,
  edit: <InvoiceEditRoute documentType="pharmacy-bill" />,
  view: <InvoiceViewRoute documentType="pharmacy-bill" />,
};
