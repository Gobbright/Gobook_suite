import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';

// Source audit, not proof that a handler succeeds against a live backend.
export function inspectButtons(source, file = 'component.jsx') {
  const controls = [];
  const linter = new Linter();
  const messages = linter.verify(source, [{
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { audit: { rules: { buttons: { create(context) {
      return { JSXOpeningElement(node) {
        const name = node.name.name;
        if (name !== 'button' && !/Button$/.test(name || '')) return;
        const attr = (key) => node.attributes.find((item) => item.name?.name === key);
        const value = (key) => { const item = attr(key); return item?.value?.type === 'JSXExpressionContainer' ? item.value.expression.value : item?.value?.value; };
        const events = (element) => element.attributes?.some((item) => /^on(?:Click|MouseDown|MouseUp|PointerDown|PointerUp|KeyDown|TouchStart)$/.test(item.name?.name));
        const ancestors = context.sourceCode.getAncestors(node);
        const elements = ancestors.filter((item) => item.type === 'JSXElement' && item.openingElement !== node);
        const delegated = elements.some((item) => events(item.openingElement));
        const navigation = elements.some((item) => ['Link', 'NavLink', 'a'].includes(item.openingElement.name.name) && item.openingElement.attributes.some((attribute) => ['to', 'href'].includes(attribute.name?.name)));
        const form = elements.some((item) => item.openingElement.name.name === 'form');
        const spread = node.attributes.some((item) => item.type === 'JSXSpreadAttribute');
        const handler = attr('onClick')?.value?.expression;
        const disabled = attr('disabled') && (attr('disabled').value == null || value('disabled') === true);
        const empty = /^(ArrowFunctionExpression|FunctionExpression)$/.test(handler?.type || '') && handler.body.type === 'BlockStatement' && handler.body.body.length === 0;
        let status = disabled ? 'disabled' : empty ? 'empty-handler' : events(node) || delegated || (name === 'FileButton' && attr('onChange')) ? 'handler-present' : navigation ? 'navigation' : spread ? 'forwarded-props' : value('type') === 'submit' || (form && !value('type')) ? 'native-submit' : 'needs-review';
        if (!disabled && form && events(node) && !attr('type') && name === 'button') status = 'implicit-submit';
        const label = value('aria-label') || value('title') || node.parent.children.map((child) => child.type === 'JSXText' ? child.value : child.type === 'JSXExpressionContainer' ? `{${context.sourceCode.getText(child.expression)}}` : '').join(' ');
        controls.push({ file, line: node.loc.start.line, component: name, status, label: String(label).replace(/\s+/g, ' ').trim().slice(0, 110) });
      } };
    } } } } }, rules: { 'audit/buttons': 'warn' },
  }], { filename: file });
  const fatal = messages.filter((message) => message.fatal);
  if (fatal.length) throw new Error(`${file}: ${fatal.map((message) => message.message).join('; ')}`);
  return controls;
}

export function auditTree(root = 'src') {
  const controls = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.(jsx|js)$/.test(file)) controls.push(...inspectButtons(fs.readFileSync(file, 'utf8'), file.replaceAll('\\', '/')));
    }
  }
  walk(root);
  const counts = {};
  for (const control of controls) counts[control.status] = (counts[control.status] || 0) + 1;
  return { scope: 'All src JavaScript/JSX native buttons and components ending in Button. Handler presence does not verify runtime behavior. Forwarded props, delegated handlers, conditional disabling and custom components need manual review.', total: controls.length, counts, findings: controls.filter((control) => ['needs-review', 'empty-handler', 'implicit-submit'].includes(control.status)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditTree();
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/button-audit.json', `${JSON.stringify(report, null, 2)}\n`);
  const lines = ['# Button source audit', '', report.scope, '', `Scanned ${report.total} button definitions. ${report.findings.length} findings require manual review.`, '', '| Classification | Count |', '| --- | ---: |', ...Object.entries(report.counts).map(([name, count]) => `| ${name} | ${count} |`), '', '## Remaining findings', '', 'These are source candidates, not confirmed runtime failures. Custom components can handle actions internally. Controls with handlers still require live data and permission checks to verify their complete workflows.', '', '| Source | Line | Component | Label | Finding |', '| --- | ---: | --- | --- | --- |', ...report.findings.map((row) => `| [${row.file}](../${row.file}) | ${row.line} | ${row.component} | ${row.label.replaceAll('|', '\\|')} | ${row.status} |`), '', 'Regenerate with `npm run check:buttons`. Verify interactions against real data and permissions in staging before production deployment.', ''];
  fs.writeFileSync('reports/button-audit.md', lines.join('\n'));
  console.log(JSON.stringify({ total: report.total, counts: report.counts, report: 'reports/button-audit.json' }, null, 2));
}
