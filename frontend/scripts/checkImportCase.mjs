import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else files.push(absolute);
  }
}

walk(sourceRoot);
const relativeName = (absolute) => path.relative(sourceRoot, absolute).replaceAll('\\', '/');
const exactFiles = new Set(files.map(relativeName));
const lowerFiles = new Map(files.map((file) => [relativeName(file).toLowerCase(), relativeName(file)]));
const sourceFiles = files.filter((file) => /\.(?:js|jsx|mjs)$/.test(file));
const importPattern = /(?:\bfrom\s*|\bimport\s*\()\s*['"](\.[^'"]+)['"]/g;
const extensions = ['', '.js', '.jsx', '.mjs', '.json', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp'];
const failures = [];

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1].split('?')[0].split('#')[0];
    const base = path.resolve(path.dirname(file), specifier);
    const candidates = [
      ...extensions.map((extension) => `${base}${extension}`),
      ...extensions.slice(1).map((extension) => path.join(base, `index${extension}`)),
    ].map(relativeName);
    if (candidates.some((candidate) => exactFiles.has(candidate))) continue;
    const caseMatch = candidates.map((candidate) => lowerFiles.get(candidate.toLowerCase())).find(Boolean);
    failures.push(caseMatch
      ? `${relativeName(file)} imports ${specifier}; actual path is ${caseMatch}`
      : `${relativeName(file)} imports missing path ${specifier}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Checked ${sourceFiles.length} source files: import casing is Linux-safe.`);
