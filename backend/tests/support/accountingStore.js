import { mock } from 'node:test';
import mongoose from 'mongoose';
import { AccountingVoucher } from '../../src/models/AccountingVoucher.js';
import { AccountingPosting } from '../../src/models/AccountingPosting.js';
import { VoucherSequence } from '../../src/models/VoucherSequence.js';
import { LedgerAccount } from '../../src/models/LedgerAccount.js';
import { JournalEntry } from '../../src/models/JournalEntry.js';
import { CashBookEntry } from '../../src/models/CashBookEntry.js';
import { BankBookEntry } from '../../src/models/BankBookEntry.js';
import { BusinessSettings } from '../../src/models/BusinessSettings.js';

export function accountingStore(accounts = []) {
  let sequence = 0;
  const data = { vouchers: [], postings: [], journals: [], cash: [], bank: [], accounts: accounts.map((account) => ({ _id: `ledger-${++sequence}`, active: true, opening: 0, debit: 0, credit: 0, ...account })), sequences: [] };
  const options = { failPosting: false, failVoucher: false, failLedger: false };
  const valuesAt = (row, key) => key.split('.').reduce((values, part) => values.flatMap((value) => Array.isArray(value) ? value.map((item) => item?.[part]) : [value?.[part]]), [row]).flat();
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((clause) => matches(row, clause));
    if (key === '$and') return value.every((clause) => matches(row, clause));
    return valuesAt(row, key).some((actual) => {
      if (value instanceof RegExp) return value.test(actual || '');
      if (value && typeof value === 'object') {
        if ('$in' in value) return value.$in.some((candidate) => String(actual) === String(candidate));
        if ('$ne' in value) return String(actual) !== String(value.$ne);
      }
      return String(actual) === String(value);
    });
  });
  function query(read) {
    let sort;
    return { select() { return this; }, sort(value) { sort = value; return this; }, skip() { return this; }, limit() { return this; }, lean: async () => {
      const rows = read();
      return Array.isArray(rows) && sort ? rows.sort((first, second) => { for (const [key, direction] of Object.entries(sort)) { const result = String(first[key]).localeCompare(String(second[key])); if (result) return result * direction; } return 0; }) : rows;
    }, then(resolve, reject) { return Promise.resolve(read()).then(resolve, reject); } };
  }
  function document(row, key) {
    if (!row) return null;
    const result = { ...row };
    Object.defineProperties(result, {
      save: { value: async () => { const saved = { ...result }; data[key][data[key].findIndex((item) => item._id === row._id)] = saved; return result; } },
      deleteOne: { value: async () => { data[key] = data[key].filter((item) => item._id !== row._id); } },
      toObject: { value: () => ({ ...result }) },
    });
    return result;
  }
  mock.method(mongoose.connection, 'transaction', async (work) => {
    if (mongoose.transactionAsyncLocalStorage?.getStore()?.session) return work();
    const before = structuredClone(data);
    try { return await mongoose.transactionAsyncLocalStorage.run({ session: {} }, work); }
    catch (error) { Object.assign(data, before); throw error; }
  });
  for (const [Model, key] of [[AccountingVoucher, 'vouchers'], [AccountingPosting, 'postings'], [JournalEntry, 'journals'], [CashBookEntry, 'cash'], [BankBookEntry, 'bank'], [VoucherSequence, 'sequences'], [LedgerAccount, 'accounts']]) {
    mock.method(Model, 'find', (filter) => query(() => data[key].filter((row) => matches(row, filter))));
    mock.method(Model, 'findOne', (filter, _projection, queryOptions) => query(() => {
      let rows = data[key].filter((row) => matches(row, filter));
      if (queryOptions?.sort?.voucherNo) rows = rows.sort((first, second) => second.voucherNo.localeCompare(first.voucherNo));
      return document(rows[0], key);
    }));
    mock.method(Model, 'create', async (payload) => {
      if (key === 'postings' && options.failPosting || key === 'vouchers' && options.failVoucher) throw new Error('Injected persistence failure');
      if (key === 'vouchers' && data.vouchers.some((row) => row.userId === payload.userId && row.financialYear === payload.financialYear && row.voucherType === payload.voucherType && row.voucherNo === payload.voucherNo)) throw Object.assign(new Error('Duplicate voucher number'), { code: 11000 });
      const row = { ...payload, _id: `row-${++sequence}`, createdAt: new Date(sequence * 1000).toISOString() };
      data[key].push(row);
      return document(row, key);
    });
    function update(filter, changes, config) {
      if (key === 'accounts' && options.failLedger) throw new Error('Injected ledger failure');
      let row = data[key].find((item) => matches(item, filter));
      if (!row && config?.upsert) { row = { _id: `row-${++sequence}`, ...filter, ...changes.$setOnInsert }; data[key].push(row); }
      if (row) {
        for (const [field, amount] of Object.entries(changes.$inc || {})) row[field] = (row[field] || 0) + amount;
        for (const [field, amount] of Object.entries(changes.$max || {})) row[field] = Math.max(row[field] || 0, amount);
        Object.assign(row, changes.$set || {});
      }
      return row;
    }
    mock.method(Model, 'updateOne', async (filter, changes, config) => update(filter, changes, config));
    mock.method(Model, 'findOneAndUpdate', (filter, changes, config) => query(() => update(filter, changes, config)));
    for (const method of ['deleteOne', 'deleteMany']) mock.method(Model, method, async (filter) => { const count = data[key].length; data[key] = data[key].filter((row) => !matches(row, filter)); return { deletedCount: count - data[key].length }; });
  }
  mock.method(BusinessSettings, 'findOne', () => query(() => ({ bankName: 'HDFC', accountNumber: '123456', fyStart: '01 April' })));
  return { data, options };
}
