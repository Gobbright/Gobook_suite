import { DateTime } from 'luxon';
import { Invoice } from '../../models/Invoice.js';
import { Product } from '../../models/Product.js';
import { Payment } from '../../models/Payment.js';
import { Customer } from '../../models/Customer.js';
import { Vendor } from '../../models/Vendor.js';
import { LedgerAccount } from '../../models/LedgerAccount.js';
import { AccountingPosting } from '../../models/AccountingPosting.js';
import { branchScopedQuery } from '../../utils/branchScope.js';
import { buildAutomobileDashboard } from '../../services/automobileDashboard.js';
import { httpError } from '../../utils/httpError.js';

export async function getAutomobileDashboard(req, res, next) {
  try {
    if (!['automobile', 'retail'].includes(req.user.category)) throw httpError(404, 'Not found');
    const period = req.query.period || DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM');
    if (!/^\d{4}-\d{2}$/.test(period) || !DateTime.fromFormat(period, 'yyyy-MM').isValid) throw httpError(400, 'Select a valid dashboard month');
    const models = [Invoice, Product, Payment, Customer, Vendor, LedgerAccount, AccountingPosting];
    const filters = await Promise.all(models.map((model) => branchScopedQuery(req, { model, ownerField: 'userId' })));
    const [invoices, products, payments, customers, suppliers, accounts, postings] = await Promise.all([
      Invoice.find({ ...filters[0], documentType: { $in: ['invoice', 'purchase-entry', 'purchase-order', ...(req.user.category === 'retail' ? ['bill-of-supply'] : [])] }, lifecycleStatus: { $nin: ['draft', 'cancelled'] } }).select('number documentType lifecycleStatus meta items charges totals customer.name advanceReceived createdAt').lean(),
      Product.find(filters[1]).select('description status itemType stock minStockLevel category unit landingCost purchasePrice').lean(),
      Payment.find(filters[2]).select('invoiceId amount date createdAt').lean(),
      Customer.countDocuments({ ...filters[3], status: 'Active' }),
      Vendor.countDocuments({ ...filters[4], status: 'Active' }),
      LedgerAccount.find(filters[5]).select('group opening debit credit').lean(),
      AccountingPosting.find(filters[6]).select('date lines createdAt').lean(),
    ]);
    res.json(buildAutomobileDashboard({ invoices, products, payments, customers, suppliers, accounts, postings, period, includeBillOfSupply: req.user.category === 'retail' }));
  } catch (error) { next(error); }
}
