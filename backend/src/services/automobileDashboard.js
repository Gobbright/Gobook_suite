import { DateTime } from 'luxon';

const ZONE = 'Asia/Kolkata';
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value) => Math.round(value * 100) / 100;
const dateOf = (doc) => {
  const value = doc.meta?.date || doc.date || doc.createdAt;
  return value instanceof Date ? DateTime.fromJSDate(value, { zone: ZONE }) : DateTime.fromISO(String(value || ''), { zone: ZONE });
};
const active = (doc) => !['draft', 'cancelled'].includes(doc.lifecycleStatus);

export function automobileDocumentTotal(doc) {
  for (const key of ['finalTotal', 'grandTotal', 'total']) {
    if (doc.totals?.[key] != null && Number.isFinite(Number(doc.totals[key]))) return amount(doc.totals[key]);
  }
  return round((doc.items || []).reduce((sum, item) => {
    const gross = amount(item.qty) * amount(item.rate);
    const discount = item.discountType === 'amount' ? Math.min(gross, amount(item.discount)) : gross * amount(item.discount) / 100;
    return sum + (gross - discount) * (1 + amount(item.gstRate) / 100);
  }, 0) + (doc.charges || []).reduce((sum, charge) => sum + amount(charge.amount) * (1 + amount(charge.gstRate) / 100), 0));
}

export function buildAutomobileDashboard({ invoices = [], products = [], payments = [], accounts = [], postings = [], customers = 0, suppliers = 0, period, now = new Date(), includeBillOfSupply = false }) {
  const today = DateTime.fromJSDate(now, { zone: ZONE });
  const month = DateTime.fromFormat(period || today.toFormat('yyyy-MM'), 'yyyy-MM', { zone: ZONE }).startOf('month');
  if (!month.isValid) throw new Error('Invalid dashboard month');
  const inMonth = (doc, target = month) => dateOf(doc).hasSame(target, 'month');
  const sum = (docs) => round(docs.reduce((value, doc) => value + automobileDocumentTotal(doc), 0));
  const sales = invoices.filter((doc) => (doc.documentType === 'invoice' || includeBillOfSupply && doc.documentType === 'bill-of-supply') && active(doc));
  const purchases = invoices.filter((doc) => doc.documentType === 'purchase-entry' && active(doc));
  const orders = invoices.filter((doc) => doc.documentType === 'purchase-order' && active(doc));
  const paid = new Map();
  for (const payment of payments) paid.set(String(payment.invoiceId), (paid.get(String(payment.invoiceId)) || 0) + amount(payment.amount));
  const outstanding = (doc) => Math.max(0, automobileDocumentTotal(doc) - (paid.get(String(doc._id)) ?? amount(doc.advanceReceived)));
  const monthSales = sales.filter((doc) => inMonth(doc));
  const monthPurchases = purchases.filter((doc) => inMonth(doc));
  const stock = products.filter((product) => product.status === 'Active' && product.itemType !== 'Service');
  const low = stock.filter((product) => amount(product.stock) <= amount(product.minStockLevel));
  const pending = sales.filter((doc) => outstanding(doc) > 0);
  const balance = (account) => amount(account.opening) + amount(account.debit) - amount(account.credit);
  const profit = postings.filter((posting) => inMonth(posting)).reduce((value, posting) => value + (posting.lines || []).reduce((net, line) => {
    if (!/income|expense/i.test(line.group)) return net;
    return net + amount(line.amount) * (line.side === 'credit' ? 1 : -1);
  }, 0), 0);
  const financialMetric = (docs, previousDocs) => {
    const value = sum(docs);
    const previous = sum(previousDocs);
    return { value, change: previous ? round((value - previous) / previous * 100) : null };
  };
  const lastMonth = month.minus({ months: 1 });
  const metrics = {
    todaySales: financialMetric(sales.filter((doc) => dateOf(doc).hasSame(today, 'day')), sales.filter((doc) => dateOf(doc).hasSame(today.minus({ days: 1 }), 'day'))),
    monthlySales: financialMetric(monthSales, sales.filter((doc) => inMonth(doc, lastMonth))),
    purchases: financialMetric(monthPurchases, purchases.filter((doc) => inMonth(doc, lastMonth))),
    purchaseOrders: { value: sum(orders.filter((doc) => inMonth(doc))), change: null },
    receivables: { value: round(pending.reduce((value, doc) => value + outstanding(doc), 0)), change: null },
    payables: { value: round(purchases.reduce((value, doc) => value + outstanding(doc), 0)), change: null },
    inventoryValue: { value: round(stock.reduce((value, product) => value + amount(product.stock) * amount(product.landingCost || product.purchasePrice), 0)), change: null },
    lowStock: { value: low.length, change: null }, customers: { value: customers, change: null }, suppliers: { value: suppliers, change: null },
    profit: { value: round(profit), change: null },
    cashBalance: { value: round(accounts.filter((account) => ['Cash-In-Hand', 'Bank Accounts'].includes(account.group)).reduce((value, account) => value + balance(account), 0)), change: null },
  };
  const daily = Array.from({ length: month.daysInMonth }, (_, index) => {
    const day = month.plus({ days: index });
    return { label: day.toFormat('d MMM'), sales: sum(monthSales.filter((doc) => dateOf(doc).hasSame(day, 'day'))), purchases: sum(monthPurchases.filter((doc) => dateOf(doc).hasSame(day, 'day'))) };
  });
  const monthly = Array.from({ length: 7 }, (_, index) => {
    const target = month.minus({ months: 6 - index });
    const targetSales = sales.filter((doc) => inMonth(doc, target));
    return { label: target.toFormat('MMM'), sales: sum(targetSales), purchases: sum(purchases.filter((doc) => inMonth(doc, target))), received: round(payments.filter((payment) => inMonth(payment, target) && sales.some((sale) => String(sale._id) === String(payment.invoiceId))).reduce((value, payment) => value + amount(payment.amount), 0)), pending: round(targetSales.reduce((value, doc) => value + outstanding(doc), 0)) };
  });
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const categorySales = new Map();
  const bestSellers = new Map();
  for (const invoice of monthSales) {
    const lines = (invoice.items || []).map((item) => ({ item, value: automobileDocumentTotal({ items: [item] }) }));
    const lineTotal = lines.reduce((value, line) => value + line.value, 0);
    for (const { item, value } of lines) {
      const product = productMap.get(String(item.productId));
      const category = item.category || product?.category || 'Others';
      // Allocate invoice-level discounts and charges so the chart reconciles with sales.
      const share = lineTotal ? value / lineTotal * automobileDocumentTotal(invoice) : 0;
      categorySales.set(category, (categorySales.get(category) || 0) + share);
      const key = String(item.productId || item.description);
      const record = bestSellers.get(key) || { id: key, name: item.description || product?.description || 'Item', quantity: 0, value: 0 };
      record.quantity += amount(item.qty); record.value += share;
      bestSellers.set(key, record);
    }
    if (!lines.length || !lineTotal) categorySales.set('Others', (categorySales.get('Others') || 0) + automobileDocumentTotal(invoice));
  }
  const recent = (docs) => [...docs].sort((a, b) => dateOf(b).toMillis() - dateOf(a).toMillis()).slice(0, 5).map((doc) => ({ id: String(doc._id), number: doc.number, name: doc.customer?.name || '—', date: dateOf(doc).toISODate(), amount: automobileDocumentTotal(doc), status: outstanding(doc) > 0 ? 'Pending' : 'Paid' }));
  const pendingCustomers = new Map();
  for (const doc of pending) {
    const name = doc.customer?.name || 'Customer';
    pendingCustomers.set(name, round((pendingCustomers.get(name) || 0) + outstanding(doc)));
  }
  return {
    period: month.toFormat('yyyy-MM'), metrics, daily, monthly,
    categorySales: [...categorySales].map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value),
    topProducts: [...bestSellers.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((item) => ({ ...item, value: round(item.value) })),
    inventory: { total: stock.length, inStock: stock.filter((product) => amount(product.stock) > amount(product.minStockLevel)).length, lowStock: stock.filter((product) => amount(product.stock) > 0 && amount(product.stock) <= amount(product.minStockLevel)).length, outOfStock: stock.filter((product) => amount(product.stock) <= 0).length },
    lowStock: [...low].sort((a, b) => amount(a.stock) - amount(b.stock)).slice(0, 5).map((product) => ({ id: String(product._id), name: product.description, stock: amount(product.stock), unit: product.unit || 'units' })),
    recentSales: recent(monthSales), recentPurchases: recent(monthPurchases),
    pendingCustomers: [...pendingCustomers].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}
