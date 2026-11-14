// OCR keeps word positions so the existing table parser can retain Qty, Rate,
// GST and variant columns. Invoice pages never leave this browser.
export function purchaseOcrLines(data, scale = 1) {
  const words = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => (paragraph.lines || []).flatMap(line => line.words || [])))
    .filter(word => word.text?.trim() && word.bbox)
    .sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 || a.bbox.x0 - b.bbox.x0);
  const rows = [];
  for (const word of words) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2;
    const height = word.bbox.y1 - word.bbox.y0;
    let row = rows.find(value => Math.abs(value.center - center) < Math.max(3, height * .45));
    if (!row) { row = { center, words: [] }; rows.push(row); }
    row.words.push(word);
  }
  return rows.sort((a, b) => a.center - b.center).map(row => {
    const cells = [];
    for (const word of row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
      const previous = cells.at(-1);
      const gap = previous ? word.bbox.x0 / scale - previous.x - previous.width : Infinity;
      const height = (word.bbox.y1 - word.bbox.y0) / scale;
      // Never join adjacent numbers from separate financial columns.
      if (previous && gap < height * .65 && !/^[\d,.%]+$/.test(word.text) && !/^[\d,.%]+$/.test(previous.text)) {
        previous.text += ` ${word.text}`;
        previous.width = word.bbox.x1 / scale - previous.x;
        previous.confidence = Math.min(previous.confidence, word.confidence);
      } else cells.push({ text: word.text.trim(), x: word.bbox.x0 / scale, width: (word.bbox.x1 - word.bbox.x0) / scale, confidence: word.confidence });
    }
    return { y: -row.center / scale, cells };
  });
}

export async function createPurchaseOcr(onProgress) {
  const { createWorker, PSM } = await import('tesseract.js');
  const base = new URL(`${import.meta.env.BASE_URL}assets/purchase-ocr-v7/`, window.location.origin).href;
  let page = 1;
  onProgress('Preparing local PDF reader...');
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base, langPath: base.replace(/\/$/, ''), workerBlobURL: false,
    logger: event => onProgress(event.status === 'recognizing text' ? `Reading page ${page} locally... ${Math.round(event.progress * 100)}%` : 'Preparing local PDF reader...'),
  });
  // Sparse-text segmentation drops isolated single-character cells such as
  // Qty 2 or Size M. Automatic segmentation retains them; we reorder by bbox.
  try { await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' }); }
  catch (error) { await worker.terminate(); throw error; }
  return {
    async recognize(image, pageNumber) {
      page = pageNumber;
      let timer;
      try {
        const result = await Promise.race([
          worker.recognize(image, {}, { blocks: true, text: true }),
          new Promise((_, reject) => { timer = setTimeout(() => { worker.terminate(); reject(new Error('Local PDF reading timed out. Try a smaller or clearer PDF.')); }, 120000); }),
        ]);
        return purchaseOcrLines(result.data);
      } finally { clearTimeout(timer); }
    },
    terminate: () => worker.terminate(),
  };
}
