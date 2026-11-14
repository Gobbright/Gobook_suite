import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import ZXing from '@zxing/library';
const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } = ZXing;
import { employeeLoginUrl } from '../src/features/employee-management/services/employeeQr.js';

test('downloadable employee QR PNGs decode to the exact business/employee login URL', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4173', 'https://gobooksuite.com', 'https://staging.gobooksuite.com']) {
    const path = '/employee-login/anbu-retail-a1b2c3d4/EMP-001';
    const url = employeeLoginUrl({ loginPath: path }, origin);
    assert.equal(url, origin + path);
    const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 3, errorCorrectionLevel: 'M' });
    assert.match(dataUrl, /^data:image\/png;base64,/);
    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
    const luminance = new Uint8ClampedArray(png.width * png.height);
    for (let index = 0; index < luminance.length; index++) luminance[index] = (png.data[index * 4] + 2 * png.data[index * 4 + 1] + png.data[index * 4 + 2]) / 4;
    // This is the generated PNG itself, so it has no perspective distortion.
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height))), new Map([[ZXing.DecodeHintType.PURE_BARCODE, true]]));
    assert.equal(decoded.getText(), url);
    assert.equal(new URL(decoded.getText()).searchParams.has('password'), false);
  }
});
