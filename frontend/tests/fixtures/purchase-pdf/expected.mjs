export const purchasePdfCases = [
  {
    file: 'dummy_purchase_bill_single_product_multi_variants.pdf', invoiceNo: 'INV-4590', invoiceAmount: 28875, quantity: 110, taxable: 27500,
    rows: [
      ['CCT-BLK-S', 'S', 'Black', 10], ['CCT-BLK-M', 'M', 'Black', 15], ['CCT-BLK-L', 'L', 'Black', 20], ['CCT-BLK-XL', 'XL', 'Black', 15], ['CCT-BLK-XXL', 'XXL', 'Black', 10],
      ['CCT-WHT-S', 'S', 'White', 8], ['CCT-WHT-M', 'M', 'White', 12], ['CCT-WHT-L', 'L', 'White', 10], ['CCT-WHT-XL', 'XL', 'White', 6], ['CCT-WHT-XXL', 'XXL', 'White', 4],
    ].map(([productCode, size, colour, qty]) => ({ description: "Men's Cotton T-Shirt", productCode, size, colour, qty, rate: 250, sourceAmount: qty * 250, hsn: '6109', brand: 'Classic Cotton', category: "Men's Wear", productType: 'Matrix', unit: 'Pcs', gstRate: 5 })),
  },
  {
    file: 'dummy_clothing_purchase_bill.pdf', invoiceNo: 'INV-4589', invoiceAmount: 63682.5, quantity: 147, taxable: 60650,
    rows: [
      ["Men's Cotton Shirt", '6205', 20, 450, 9000], ["Men's Denim Jeans", '6203', 15, 750, 11250], ["Women's Kurti", '6206', 25, 380, 9500], ["Women's Leggings", '6104', 30, 180, 5400],
      ['Cotton Saree', '6211', 10, 850, 8500], ['Kids T-Shirt', '6109', 20, 220, 4400], ["Men's Formal Pant", '6203', 12, 650, 7800], ['Ladies Nightwear', '6108', 15, 320, 4800],
    ].map(([description, hsn, qty, rate, sourceAmount]) => ({ description, hsn, qty, rate, sourceAmount, productType: 'Standard', unit: 'Pcs', gstRate: 5 })),
  },
];
