import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else files.push(absolute);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const exactFiles = new Set(files.map(relative));
const lowercaseFiles = new Map(files.map((file) => [relative(file).toLowerCase(), relative(file)]));
const sourceFiles = files.filter((file) => /\.[cm]?js$/.test(file));
const failures = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
    const target = relative(path.resolve(path.dirname(file), match[1].split(/[?#]/)[0]));
    if (exactFiles.has(target)) continue;
    failures.push(`${relative(file)} imports ${match[1]}: ${lowercaseFiles.has(target.toLowerCase()) ? `actual casing is ${lowercaseFiles.get(target.toLowerCase())}` : 'file is missing or lacks an explicit ESM extension'}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${sourceFiles.length} backend source files: import paths are Linux-safe.`);
