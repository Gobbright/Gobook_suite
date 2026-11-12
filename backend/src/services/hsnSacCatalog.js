import { readFile } from 'node:fs/promises';
import { httpError } from '../utils/httpError.js';

export const hsnSacCatalogUrl = new URL('../data/hsn-sac.json', import.meta.url);
let catalogPromise;

export function normalizeCatalogCode(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

export async function loadHsnSacCatalog() {
  if (!catalogPromise) {
    catalogPromise = readFile(hsnSacCatalogUrl, 'utf8').then((contents) => {
      const catalog = JSON.parse(contents);
      return {
        ...catalog,
        entries: catalog.entries.map((entry) => ({ ...entry, searchText: [entry.description, ...(entry.alternateDescriptions || [])].join(' ').toLowerCase() })),
      };
    }).catch((error) => {
      catalogPromise = undefined;
      throw error;
    });
  }
  return catalogPromise;
}

export function searchHsnSacCatalog(catalog, params = {}) {
  if (params.q !== undefined && typeof params.q !== 'string') throw httpError(400, 'Invalid HSN/SAC search');
  const query = (params.q || '').trim().toLowerCase();
  if (query.length > 100) throw httpError(400, 'Search must be at most 100 characters');
  if (params.type !== undefined && !['', 'HSN', 'SAC'].includes(params.type)) throw httpError(400, 'Type must be HSN or SAC');
  const requestedLimit = params.limit === undefined ? 20 : Number(params.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || Array.isArray(params.limit)) throw httpError(400, 'Invalid result limit');
  const limit = Math.min(50, requestedLimit);
  const metadata = { counts: catalog.counts, source: catalog.source };
  if (query.length < 2) return { data: [], hasMore: false, ...metadata };
  const codeQuery = normalizeCatalogCode(query);
  const numeric = /^\d+$/.test(codeQuery);
  const words = query.split(/\s+/);
  const matches = [];
  for (const entry of catalog.entries) {
    if (params.type && entry.type !== params.type) continue;
    const matchesQuery = numeric ? entry.code.startsWith(codeQuery) : words.every((word) => entry.searchText.includes(word));
    if (matchesQuery) matches.push(entry);
    if (matches.length > limit) break;
  }
  return {
    data: matches.slice(0, limit).map(({ searchText, alternateDescriptions, ...entry }) => entry),
    hasMore: matches.length > limit,
    ...metadata,
  };
}
