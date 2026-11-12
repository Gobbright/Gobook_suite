import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import ZXing from '@zxing/library';
const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } = ZXing;

test('downloadable employee QR PNGs decode to the exact business/employee login URL', async () => {
  for (const code of ['a'.repeat(64), 'b'.repeat(64)]) {
    const url = `https://example.test/employee-login/anbu-retail-${code.slice(0, 8)}/EMP-001`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
    assert.match(dataUrl, /^data:image\/png;base64,/);
    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
    const luminance = new Uint8ClampedArray(png.width * png.height);
    for (let index = 0; index < luminance.length; index++) luminance[index] = (png.data[index * 4] + 2 * png.data[index * 4 + 1] + png.data[index * 4 + 2]) / 4;
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height))));
    assert.equal(decoded.getText(), url);
    assert.equal(new URL(decoded.getText()).searchParams.has('password'), false);
  }
});
