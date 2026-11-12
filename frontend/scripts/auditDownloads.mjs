import fs from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';

const controls = [];
let scannedFiles = 0;
function scan(file) {
  const source = fs.readFileSync(file, 'utf8');
  scannedFiles++;
  const messages = new Linter().verify(source, [{ files: ['**/*.{js,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { downloads: { rules: { scan: { create(context) {
    return { JSXOpeningElement(node) {
      const tag = node.name.name || '';
      if (tag !== 'a' && tag !== 'button' && !/Button|Btn/.test(tag)) return;
      const attr = (name) => node.attributes.find((item) => item.name?.name === name);
      const label = ['aria-label', 'title'].map((key) => attr(key)?.value?.value).filter(Boolean).join(' ') + ' ' + node.parent.children.map((child) => child.type === 'JSXText' ? child.value : '').join(' ');
      if (/^(?:dismiss|close|choose|upload|import)\b/i.test(label.trim())) return;
      const handler = attr('onClick') || attr('onSelect');
      const text = handler ? context.sourceCode.getText(handler.value) : '';
      if (!/\bpdf\b|\bcsv\b|export|download/i.test(label) && !/download.*(?:Pdf|Csv)|export.*(?:Pdf|Csv)/i.test(text) && !/<(?:Download|FileDown|FileSpreadsheet)\b/.test(context.sourceCode.getText(node.parent)) && tag !== 'ExportButtons') return;
      const parents = context.sourceCode.getAncestors(node).filter((item) => item.type === 'JSXElement' && item.openingElement !== node);
      const delegated = parents.some((parent) => parent.openingElement.attributes.some((item) => item.name?.name === 'onClick'));
      const disabled = attr('disabled') && (!attr('disabled').value || attr('disabled').value.expression?.value === true);
      const submitsForm = attr('type')?.value?.value === 'submit' && parents.some((parent) => parent.openingElement.name.name === 'form' && parent.openingElement.attributes.some((item) => item.name?.name === 'onSubmit'));
      const spread = node.attributes.some((item) => item.type === 'JSXSpreadAttribute');
      const noticeOnly = /setNotice\(|setMessage\(|alert\(/.test(text) && !/download|export|\.pdf|\.csv/i.test(text.replace(/(['"])(?:\\.|(?!\1).)*\1/g, ''));
      controls.push({ file: file.replaceAll('\\', '/'), line: node.loc.start.line, component: tag, label: label.replace(/\s+/g, ' ').trim(), handler: text, status: tag === 'ExportButtons' ? 'shared-export-component' : disabled ? 'disabled' : noticeOnly ? 'placeholder-handler' : handler ? 'handler-present' : submitsForm ? 'form-submit' : delegated ? 'delegated-handler' : attr('href') ? 'link' : spread ? 'forwarded-props' : 'missing-handler' });
    } };
  } } } } }, rules: { 'downloads/scan': 'warn' } }], { filename: file });
  const errors = messages.filter((message) => message.fatal);
  if (errors.length) throw new Error(`${file}: ${errors[0].message}`);
}
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) walk(file); else if (/\.(js|jsx)$/.test(file)) scan(file); } }
walk('src');
const counts = {};
for (const control of controls) counts[control.status] = (counts[control.status] || 0) + 1;
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/download-audit.json', JSON.stringify({ scope: 'Source inventory of PDF/CSV buttons and links. Handler presence requires runtime verification; action menu options and shared export components also require tracing.', scannedFiles, counts, controls }, null, 2));
console.log(JSON.stringify({ scannedFiles, counts }));
for (const control of controls.filter((item) => /missing|placeholder/.test(item.status))) console.log(`${control.status} ${control.file}:${control.line} ${control.label} ${control.handler}`);
