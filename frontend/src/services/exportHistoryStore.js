const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('gobook-export-files', 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('exports')) request.result.createObjectStore('exports', { keyPath: 'id' }); };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
async function access(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => { const transaction = db.transaction('exports', mode); let value; const request = operation(transaction.objectStore('exports')); request.onsuccess = () => { value = request.result; }; transaction.oncomplete = () => { db.close(); resolve(value); }; transaction.onerror = () => { db.close(); reject(transaction.error); }; transaction.onabort = () => { db.close(); reject(transaction.error || new Error('History storage aborted')); }; });
}
export async function listExportHistory(owner) { const rows = await access('readonly', (store) => store.getAll()); return rows.filter((row) => row.owner === owner).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export const saveExportHistory = (record) => access('readwrite', (store) => store.put(record));
export async function deleteExportHistory(id, owner) { const record = await access('readonly', (store) => store.get(id)); if (record?.owner === owner) await access('readwrite', (store) => store.delete(id)); }
