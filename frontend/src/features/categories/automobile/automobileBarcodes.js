export function printableBarcode(value) {
  const text = String(value || '').trim();
  return Boolean(text && text.length <= 32 && /^[0-9A-Z ./$+%-]+$/.test(text));
}
export function barcodeStatus(row) {
  return !String(row.barcode || '').trim() ? 'Pending' : printableBarcode(row.barcode) ? 'Generated' : 'Unsupported';
}
export function barcodePrintCount(rows, count) {
  const amount = Number(count);
  if (!rows.length || !Number.isInteger(amount) || amount < 1 || rows.length * amount > 5000) return null;
  if (rows.some((row) => !printableBarcode(row.barcode))) return null;
  return rows.length * amount;
}
export function lastBarcodePrint(row, activity) {
  return [...activity].reverse().find((event) => event.increments.some((increment) => String(increment.id) === String(row.parentId || row._id) && increment.variantIndex === row.variantIndex))?.at || '';
}
