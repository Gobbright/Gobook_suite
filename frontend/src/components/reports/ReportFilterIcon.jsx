import { Building2, CalendarDays, CircleDollarSign, CreditCard, Grid2X2, Hash, Package, Percent, ReceiptText, Tag, ToggleLeft, UserRound, UsersRound } from 'lucide-react';

const icons = { supplierCode: Hash, supplierInvoiceNo: Hash, purchaseOrderNo: Hash, purchaseType: ReceiptText, staff: UserRound, gstType: Percent, itcStatus: Percent, stockLocation: Building2, quantity: Package, purchaseRate: CircleDollarSign, discountPercent: Percent, discountAmount: CircleDollarSign, date: CalendarDays, customer: UsersRound, supplier: UsersRound, product: Package, category: Grid2X2, brand: Tag, branch: Building2, salesperson: UserRound, paymentMode: CreditCard, invoiceNumber: Hash, amount: CircleDollarSign, gstRate: Percent, status: ReceiptText, paymentStatus: CreditCard, documentType: ReceiptText, reverseCharge: ToggleLeft };
export function ReportFilterIcon({ field, size = 18, ...props }) {
  const Icon = icons[field] || Tag;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
}
