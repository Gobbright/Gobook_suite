import {
  Document as PdfDocument,
  Page as PdfPage,
  Rect as PdfRect,
  StyleSheet as PdfStyleSheet,
  Svg as PdfSvg,
  Text as PdfText,
  View as PdfView,
  pdf,
} from '@react-pdf/renderer';
const mm = value => value * 72 / 25.4;
const BARCODE_LABEL_PAGE_SIZE = [mm(80), mm(24)];

function PurchaseLabelPdfBarcode({ value, code39BarRects }) {
  const height = 32;
  const { bars, width } = code39BarRects(value, height);
  return (
    <PdfSvg width={mm(31)} height={mm(8)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {bars.map((bar) => (
        <PdfRect key={bar.key} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill="#111827" />
      ))}
    </PdfSvg>
  );
}

const purchaseBarcodePdfStyles = PdfStyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    paddingTop: mm(2),
    paddingRight: mm(2),
    paddingBottom: mm(2),
    paddingLeft: mm(2),
  },
  label: {
    width: mm(35),
    height: mm(18.5),
    borderWidth: 0.75,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    padding: mm(1.2),
    color: '#111827',
    fontFamily: 'Helvetica',
    overflow: 'hidden',
  },
  labelGap: {
    marginRight: mm(3),
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    minHeight: mm(4.8),
  },
  titleWrap: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: mm(1),
  },
  name: {
    fontSize: 6.4,
    fontWeight: 700,
    lineHeight: 1.05,
  },
  meta: {
    marginTop: mm(0.2),
    color: '#475569',
    fontSize: 4.8,
    lineHeight: 1.05,
  },
  price: {
    flexShrink: 0,
    fontSize: 6.4,
    fontWeight: 700,
    lineHeight: 1,
  },
  barcode: {
    alignItems: 'center',
    marginTop: mm(0.8),
  },
  code: {
    marginTop: mm(0.4),
    color: '#475569',
    width: '70%',
    alignSelf: 'center',
    fontSize: 6.5,
    letterSpacing: 0.35,
    lineHeight: 1,
    textAlign: 'center',
  },
});

function PurchaseBarcodePdfDocument({ rows = [], code39BarRects, chunkPurchaseBarcodePages, purchaseLabelVariantText, purchaseLabelPrice, normalizePurchaseLabelBarcode }) {
  return (
    <PdfDocument title="Purchase Barcode Labels">
      {chunkPurchaseBarcodePages(rows).map((pageRows, pageIndex) => (
        <PdfPage key={`barcode-pdf-page-${pageIndex}`} size={BARCODE_LABEL_PAGE_SIZE} style={purchaseBarcodePdfStyles.page}>
          {pageRows.map((row, rowIndex) => {
            const barcodeVal = row.barcode || '';
            const price = purchaseLabelPrice(row);
            return (
              <PdfView key={row.printKey || `${pageIndex}-${rowIndex}`} style={[purchaseBarcodePdfStyles.label, rowIndex === 0 && pageRows.length > 1 ? purchaseBarcodePdfStyles.labelGap : null]}>
                <PdfView style={purchaseBarcodePdfStyles.top}>
                  <PdfView style={purchaseBarcodePdfStyles.titleWrap}>
                    <PdfText style={purchaseBarcodePdfStyles.name}>{row.description || '-'}</PdfText>
                    <PdfText style={purchaseBarcodePdfStyles.meta}>{purchaseLabelVariantText(row)}</PdfText>
                  </PdfView>
                  {price ? <PdfText style={purchaseBarcodePdfStyles.price}>{price}</PdfText> : null}
                </PdfView>
                <PdfView style={purchaseBarcodePdfStyles.barcode}>
                  <PurchaseLabelPdfBarcode value={barcodeVal} code39BarRects={code39BarRects} />
                  <PdfText style={purchaseBarcodePdfStyles.code}>{normalizePurchaseLabelBarcode(barcodeVal)}</PdfText>
                </PdfView>
              </PdfView>
            );
          })}
        </PdfPage>
      ))}
    </PdfDocument>
  );
}


export function purchaseBarcodePdfBlob(rows, helpers) {
  return pdf(<PurchaseBarcodePdfDocument rows={rows} {...helpers} />).toBlob();
}
