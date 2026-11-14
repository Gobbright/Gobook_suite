import mongoose from 'mongoose';
import { AppUser } from '../../src/models/AppUser.js';
import { BusinessSettings } from '../../src/models/BusinessSettings.js';
import { Invoice } from '../../src/models/Invoice.js';
import { Gstr1 } from '../../src/models/Gstr1.js';
import { Gstr3b } from '../../src/models/Gstr3b.js';
import { GstReconciliation } from '../../src/models/GstReconciliation.js';

export async function seedGstDashboardFixture() {
  if (!mongoose.connection.name.startsWith('gobook_gst_')) throw new Error('GST fixtures require an isolated test database');
  const oid = () => new mongoose.Types.ObjectId();
  const owner = oid(), member = oid(), foreign = oid(), businessId = oid(), foreignBusiness = oid();
  const gstin = '33AABCG1234M1ZP', period = 'November 2026';
  await Promise.all([AppUser.init(), BusinessSettings.init(), Invoice.init(), Gstr1.init(), Gstr3b.init(), GstReconciliation.init()]);
  await AppUser.collection.insertMany([
    { _id: owner, businessId, accountType: 'owner', name: 'Owner', email: 'gst-owner@example.test', branch: 'HQ' },
    { _id: member, businessId, accountType: 'member', name: 'Staff', email: 'gst-staff@example.test', branch: 'B1' },
    { _id: foreign, businessId: foreignBusiness, accountType: 'owner', name: 'Other Owner', email: 'gst-other@example.test' },
  ]);
  await BusinessSettings.collection.insertOne({ userId: owner, businessName: 'Stored GST Business', gstin });
  const base = { userId: owner, businessId, documentType: 'invoice', branch: 'HQ', lifecycleStatus: 'posted', meta: { date: '2026-11-03' }, customer: { name: 'Buyer' }, createdAt: new Date('2026-11-03T10:00:00Z'), updatedAt: new Date('2026-11-03T11:00:00Z') };
  const item = (rate, gstRate) => [{ description: 'Recorded item', qty: 1, rate, gstRate }];
  await Invoice.collection.insertMany([
    { ...base, _id: oid(), number: 'GST-SALE-1', customer: { name: 'Registered Buyer', gstin: '33AAAAA0000A1Z5' }, items: item(1000, 18) },
    { ...base, _id: oid(), userId: member, branch: 'B1', number: 'GST-SALE-2', items: item(500, 5) },
    { ...base, _id: oid(), userId: member, branch: 'B1', number: 'GST-NONGST-1', documentType: 'bill-of-supply', items: item(200, 18) },
    { ...base, _id: oid(), number: 'GST-CREDIT-1', documentType: 'credit-note', items: item(100, 18) },
    { ...base, _id: oid(), number: 'GST-UNDATED-1', meta: {}, createdAt: new Date('2026-10-31T18:45:00Z'), items: item(100, 0) },
    { ...base, _id: oid(), number: 'GST-PREVIOUS-1', meta: {}, createdAt: new Date('2026-10-31T18:00:00Z'), updatedAt: new Date('2026-10-31T18:00:00Z'), items: item(7000, 18) },
    { ...base, _id: oid(), number: 'GST-PURCHASE-1', documentType: 'purchase-entry', customer: { name: 'Supplier A', gstin: '33AAAAA1111A1Z5' }, extra: { vendorInvoiceNo: 'BILL-SAME' }, items: item(800, 18) },
    { ...base, _id: oid(), userId: member, branch: 'B1', number: 'GST-PURCHASE-2', documentType: 'purchase-entry', customer: { name: 'Supplier B', gstin: '33BBBBB2222B1Z5' }, extra: { vendorInvoiceNo: 'BILL-SAME' }, items: item(200, 5) },
    ...['draft', 'cancelled'].map(lifecycleStatus => ({ ...base, _id: oid(), number: `GST-${lifecycleStatus}`, lifecycleStatus, items: item(9000, 18) })),
    { ...base, _id: oid(), userId: foreign, businessId: foreignBusiness, number: 'FOREIGN', items: item(50000, 28) },
  ]);
  await Gstr1.collection.insertMany([
    { userId: owner, gstin, period, filingType: 'monthly', status: 'filed', updatedAt: new Date('2026-11-03T09:00:00Z') },
    { userId: member, gstin, period, filingType: 'monthly', status: 'draft', updatedAt: new Date('2026-11-03T09:00:00Z') },
  ]);
  await Gstr3b.collection.insertOne({ userId: owner, gstin, period: 'October 2026', status: 'filed', outwardRows: [{ taxable: 1000, cgst: 100, cess: 3 }], itcAvailable: [{ cgst: 10, cess: 1 }], updatedAt: new Date('2026-10-22T10:00:00Z') });
  await GstReconciliation.collection.insertOne({ userId: owner, gstin, period, type: '2b', entries: [{ invoiceNo: 'BILL-SAME', gstin: '33AAAAA1111A1Z5', itcGstr2b: 144, statementRecorded: true }], updatedAt: new Date('2026-11-03T09:30:00Z') });
  return { owner, member, foreign, businessId, gstin, period, actor: { id: String(owner), businessId: String(businessId), accountType: 'owner', isSuperAdmin: true } };
}
