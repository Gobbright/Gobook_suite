import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep the worker, WASM engine and language model on our own origin in both
// development and production. A clean build must never depend on a CDN.
export function purchaseOcrAssets() {
  const root = new URL('../node_modules/', import.meta.url);
  const prefix = 'assets/purchase-ocr-v7/';
  let files;
  async function sources() {
    if (!files) {
      const core = new URL('tesseract.js-core/', root);
      files = new Map([
        [prefix + 'worker.min.js', new URL('tesseract.js/dist/worker.min.js', root)],
        [prefix + 'eng.traineddata.gz', new URL('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', root)],
        ...(await readdir(core)).filter(name => /\.wasm(?:\.js)?$/.test(name)).map(name => [prefix + name, new URL(name, core)]),
      ]);
    }
    return files;
  }
  return {
    name: 'purchase-ocr-assets',
    async generateBundle() {
      for (const [fileName, path] of await sources()) this.emitFile({ type: 'asset', fileName, source: await readFile(path) });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\//, '');
        if (!name?.startsWith(prefix)) return next();
        try {
          const path = (await sources()).get(name);
          if (!path) { res.statusCode = 404; return res.end(); }
          res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          res.end(await readFile(fileURLToPath(path)));
        } catch (error) { next(error); }
      });
    },
  };
}
