export function getInvoiceQuantitySummary(items = []) {
  const totals = new Map();
  for (const item of items) {
    const quantity = Number(item.quantityValue ?? item.qty);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    const unit = String(item.unit || item.uqc || 'NOS').trim().toUpperCase() || 'NOS';
    totals.set(unit, (totals.get(unit) || 0) + quantity);
  }
  return [...totals].map(([unit, quantity]) => ({
    unit,
    quantity: Number(quantity.toFixed(8)),
  }));
}

export function formatInvoiceQuantity(quantity) {
  return Number(quantity).toLocaleString('en-IN', { maximumFractionDigits: 8 });
}
