function loadImage(src, required = false) {
  return new Promise((resolve, reject) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => required ? reject(new Error('Unable to load the QR image. Please try again.')) : resolve(null);
    img.src = src;
  });
}
function linesFor(ctx, text, width, maxLines = 4) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}
export async function downloadEmployeeQrCard({ qr, profile, photoUrl, businessName, employeeId }) {
  const [code, photo] = await Promise.all([loadImage(qr, true), loadImage(photoUrl)]);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 720, 1200);
  ctx.fillStyle = '#315bd5'; ctx.fillRect(0, 0, 720, 12);
  ctx.fillStyle = '#60718d'; ctx.font = '600 24px system-ui';
  ctx.fillText(String(businessName || 'Employee access').slice(0, 45), 54, 66, 612);
  let y = 116;
  if (photo) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(54, y, 108, 108, 18); ctx.clip();
    const size = Math.min(photo.width, photo.height);
    ctx.drawImage(photo, (photo.width - size) / 2, (photo.height - size) / 2, size, size, 54, y, 108, 108); ctx.restore();
  }
  const x = photo ? 184 : 54;
  ctx.fillStyle = '#172943'; ctx.font = '700 32px system-ui';
  for (const line of linesFor(ctx, profile?.name || 'Employee access', 666 - x, 2)) { ctx.fillText(line, x, y + 32, 666 - x); y += 38; }
  ctx.fillStyle = '#65758d'; ctx.font = '24px system-ui';
  if (profile?.role) { ctx.fillText(profile.role, x, y + 30, 666 - x); y += 34; }
  if (profile?.employeeId) { ctx.fillText(profile.employeeId, x, y + 30, 666 - x); y += 34; }
  y = Math.max(y + 55, photo ? 270 : y + 55);
  for (const [label, value] of [['Address', profile?.address], ['Phone', profile?.phone], ['Email', profile?.email]]) {
    if (!value) continue;
    ctx.fillStyle = '#8795a8'; ctx.font = '600 18px system-ui'; ctx.fillText(label.toUpperCase(), 54, y); y += 30;
    ctx.fillStyle = '#3e506d'; ctx.font = '24px system-ui';
    for (const line of linesFor(ctx, value, 612, 3)) { ctx.fillText(line, 54, y, 612); y += 31; }
    y += 20;
  }
  ctx.drawImage(code, 200, y, 320, 320); y += 360;
  ctx.textAlign = 'center'; ctx.fillStyle = '#273d60'; ctx.font = '600 25px system-ui'; ctx.fillText('Scan to sign in', 360, y);
  ctx.fillStyle = '#8996aa'; ctx.font = '19px system-ui'; ctx.fillText('Username and employee ID are filled in.', 360, y + 37);
  const trimmed = document.createElement('canvas'); trimmed.width = 720; trimmed.height = Math.min(y + 90, 1200);
  trimmed.getContext('2d').drawImage(canvas, 0, 0);
  const link = document.createElement('a'); link.download = `${String(employeeId || 'employee').replace(/[^a-zA-Z0-9_-]/g, '_')}-login-card.png`; link.href = trimmed.toDataURL('image/png'); link.click();
}
