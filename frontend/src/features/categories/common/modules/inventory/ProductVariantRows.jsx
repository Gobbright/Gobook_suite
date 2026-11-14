const ATTRIBUTES = {
  modelName: 'Model / variant', size: 'Size', modelCode: 'Code', barcode: 'Barcode', colour: 'Colour',
  length: 'Length', type: 'Type', material: 'Material', pattern: 'Pattern', quality: 'Quality',
  ageGroup: 'Age group', other: 'Brand / other', ram: 'RAM', storage: 'Storage', processor: 'Processor',
  display: 'Display', graphics: 'Graphics', operatingSystem: 'Operating system',
};
const NUMBERS = { stock: 'Current stock', purchasePrice: 'Purchase price', mrp: 'MRP', rate: 'Sale price', minStockLevel: 'Minimum stock' };

// Every category uses the saved option attributes and IDs. A size-only row
// must not appear empty just because that category normally uses model names.
export function ProductVariantRows({ rows, onChange, onRemove, isTextile = false }) {
  const name = isTextile || rows.length && rows.every(row => !row.modelName) && rows.some(row => row.size) ? 'size' : 'modelName';
  const fields = [name, ...Object.keys(ATTRIBUTES).filter(key => key !== name
    && (['modelCode', 'barcode'].includes(key) || rows.some(row => String(row[key] ?? '').trim())))];
  return <div className="flex flex-col gap-3">
    {rows.map((row, index) => <fieldset key={row._id || index} className="min-w-0 rounded-md border border-[#dbe4ef] p-3">
      <legend className="px-1 text-[12px] font-semibold text-[#374151]">Variant {index + 1}: {row.modelName || row.size || 'New variant'}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...fields, ...Object.keys(NUMBERS)].map(key => <label key={key} className="block text-[11px] font-medium text-[#536173]">
          {ATTRIBUTES[key] || NUMBERS[key]}
          <input aria-label={`Variant ${index + 1} ${key}`} className="mt-1 h-9 w-full rounded-md border border-[#dbe4ef] bg-white px-2 text-[12px] text-[#111827] outline-none focus:border-blue-500"
            type={key in NUMBERS ? 'number' : 'text'} min={key in NUMBERS ? 0 : undefined} step={key in NUMBERS ? 'any' : undefined}
            value={row[key] ?? ''} onChange={event => onChange(index, key, event.target.value)} />
        </label>)}
      </div>
      <button type="button" className="mt-2 rounded border border-red-100 bg-white px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
        onClick={() => onRemove(index)}>Remove variant {index + 1}</button>
    </fieldset>)}
  </div>;
}
