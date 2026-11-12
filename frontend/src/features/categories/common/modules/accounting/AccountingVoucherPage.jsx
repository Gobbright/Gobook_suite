import { BulkDeleteTable, BulkDeleteRow } from '../../../../../components/forms/BulkDeleteTable.jsx';
import { AutomobileVouchersPage } from '../../../automobile/AutomobileVouchersPage.jsx';
import { useAutomobileListingLayout } from '../../../../../hooks/useAutomobileListingLayout.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Edit3, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { VoucherEntryForm } from './VoucherEntryForm.jsx';
import { VoucherDetails } from './VoucherDetails.jsx';
import { JournalVoucherForm } from './JournalVoucherForm.jsx';
import { journalEntryError } from './journalEntryRules.js';

import {
  createAccountingVoucher,
  deleteAccountingVoucher,
  getAccountingVouchers,
  getAccountingVoucher,
  getLedgerAccounts,
  getNextVoucherNumber,
  getVoucherTypes,
  updateAccountingVoucher,
  cancelAccountingVoucher,
  reverseAccountingVoucher,
} from '../../../../../services/accountingService.js';
import { ExportButtons } from '../../../../../components/forms/ExportButtons.jsx';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser.js';

const EMPTY_LINE = {
  ledgerName: '',
  allocations: [],
  ledgerGroup: '',
  side: 'debit',
  amount: '',
  billRef: '',
  costCenter: '',
  narration: '',
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const emptyVoucher = () => ({
  requestKey: crypto.randomUUID(),
  voucherType: 'Journal',
  voucherNo: '',
  numberingMode: 'auto',
  attachments: [],
  date: today(),
  partyName: '',
  referenceNo: '',
  narration: '',
  status: 'Posted',
  entryMode: 'manual',
  bookGroup: 'General',
  lines: [
    { ...EMPTY_LINE, side: 'debit' },
    { ...EMPTY_LINE, side: 'credit' },
    { ...EMPTY_LINE, side: 'debit' },
  ],
});

const TH = 'text-left text-xs font-semibold uppercase tracking-wide text-[#536173] px-4 py-3 border-b border-[#edf2f7]';
const TD = 'px-4 py-3 border-b border-[#f3f4f6] text-[13px]';
const PAGE_SIZE = 8;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function totals(lines) {
  return lines.reduce((acc, line) => {
    const amount = money(line.amount);
    if (line.side === 'debit') acc.debit += amount;
    if (line.side === 'credit') acc.credit += amount;
    return acc;
  }, { debit: 0, credit: 0 });
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function normalizeForForm(voucher) {
  return {
    voucherType: voucher.voucherType || 'Journal',
    voucherNo: voucher.voucherNo || '',
    numberingMode: voucher.numberingMode || 'manual',
    financialYear: voucher.financialYear,
    fyStart: voucher.fyStart,
    attachments: voucher.attachments || [],
    revision: voucher.revision || 1,
    alterationReason: '',
    date: voucher.date || today(),
    partyName: voucher.partyName || '',
    referenceNo: voucher.referenceNo || '',
    narration: voucher.narration || '',
    status: voucher.status || 'Posted',
    entryMode: voucher.entryMode || (voucher.lines?.some((line) => line.billRef) ? 'bill' : 'manual'),
    bookGroup: voucher.bookGroup || 'General',
    lines: voucher.lines?.length
      ? voucher.lines.map((line) => ({
          ledgerId: line.ledgerId,
          allocations: line.allocations || [],
          ledgerName: line.ledgerName || '',
          ledgerGroup: line.ledgerGroup || '',
          side: line.side || 'debit',
          amount: line.amount || '',
          billRef: line.billRef || '',
          costCenter: line.costCenter || '',
          narration: line.narration || '',
        }))
      : emptyVoucher().lines,
  };
}

export function AccountingVoucherPage({ journal = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: journalId } = useParams();
  const isNewPage = location.pathname === (journal ? '/journal-entry/new' : '/vouchers/new');
  const numberVersion = useRef(0);
  const user = useCurrentUser();
  const canControl = Boolean(user?.isSuperAdmin || user?.accountType === 'owner' || user?.role === 'Super Admin' || user?.permissions?.modules?.includes('accounting') && user?.permissions?.actions?.edit);
  const useAutomobileLayout = useAutomobileListingLayout();
  const [details, setDetails] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);
  const [vouchers, setVouchers] = useState([]);
  const [voucherTypes, setVoucherTypes] = useState(['Journal']);
  const [ledgers, setLedgers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyVoucher);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [numbering, setNumbering] = useState(false);
  const [numberError, setNumberError] = useState('');
  const [notice, setNotice] = useState('');
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalReload, setJournalReload] = useState(0);
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('search') || '');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);

  const ledgerGroupsByName = useMemo(() => {
    const map = new Map();
    ledgers.forEach((ledger) => map.set(ledger.name, ledger.group));
    return map;
  }, [ledgers]);

  const loadData = useCallback(() => {
    setLoading(true);
    if (journal) {
      setLoadError('');
      return getLedgerAccounts({ balances: 'posted' }).then((data) => setLedgers(data.accounts || []))
        .catch((failure) => setLoadError(failure.message || 'Unable to load ledger accounts.'))
        .finally(() => setLoading(false));
    }
    {
      const version = ++loadVersion.current;
      setLoadError('');
      async function allVouchers() {
        const rows = []; let current = 1;
        while (version === loadVersion.current) {
          const response = await getAccountingVouchers({ page: current, limit: 500 });
          const batch = response.vouchers || []; rows.push(...batch);
          if (!batch.length || rows.length >= Number(response.total)) break;
          current++;
        }
        return rows;
      }
      return Promise.all([allVouchers(), getVoucherTypes(), getLedgerAccounts()])
        .then(([rows, types, accounts]) => { if (version === loadVersion.current) { setVouchers(rows); setVoucherTypes(types.types || ['Journal']); setLedgers(accounts.accounts || []); } })
        .catch((failure) => { if (version === loadVersion.current) setLoadError(failure.message || 'Unable to load vouchers.'); })
        .finally(() => { if (version === loadVersion.current) setLoading(false); });
    }
  }, [journal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter, from, to, accountFilter, yearFilter, sort]);

  async function fillNextNumber(voucherType, date = form.date) {
    const version = ++numberVersion.current;
    setNumbering(true);
    setNumberError('');
    setForm((current) => ({ ...current, voucherNo: '' }));
    try {
      const data = await getNextVoucherNumber(voucherType, date);
      if (version === numberVersion.current) setForm((current) => ({ ...current, voucherNo: data.voucherNo || current.voucherNo, ...(data.financialYear ? { financialYear: data.financialYear, fyStart: data.fyStart } : {}) }));
    } catch {
      if (version === numberVersion.current) setNumberError('Unable to generate voucher number. Enter a number or retry.');
    } finally {
      if (version === numberVersion.current) setNumbering(false);
    }
  }

  useEffect(() => {
    if (!isNewPage) return;
    const duplicateId = journal && new URLSearchParams(location.search).get('duplicate');
    if (duplicateId) {
      let active = true;
      setJournalLoading(true); setFormError(''); setEditingId(null);
      setForm({ ...emptyVoucher(), status: 'Draft' });
      getAccountingVoucher(duplicateId).then((data) => {
        if (!active) return;
        if (data.voucher?.voucherType !== 'Journal') throw new Error('Journal not found.');
        const duplicate = normalizeForForm(data.voucher);
        setForm({ ...duplicate, date: today(), voucherNo: '', requestKey: crypto.randomUUID(), numberingMode: 'auto', attachments: [], status: 'Draft', revision: undefined, financialYear: undefined });
        fillNextNumber('Journal', today());
      }).catch((failure) => { if (active) setFormError(failure.message); }).finally(() => { if (active) setJournalLoading(false); });
      return () => { active = false; };
    }
    const next = emptyVoucher();
    setForm(next);
    setEditingId(null);
    setFormError('');
    fillNextNumber(next.voucherType, next.date);
    // A fresh form is initialized when entering the new-voucher route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewPage, journal, location.search]);

  useEffect(() => {
    if (!journal || !journalId) { if (!new URLSearchParams(location.search).get('duplicate')) setJournalLoading(false); return; }
    let active = true;
    numberVersion.current++; setNumbering(false); setNumberError('');
    setJournalLoading(true); setEditingId(null); setFormError('');
    getAccountingVoucher(journalId).then((data) => {
      if (!active) return;
      const voucher = data.voucher;
      if (!voucher || voucher.voucherType !== 'Journal') throw new Error('Journal not found.');
      if (voucher.status !== 'Draft') setDetails(voucher);
      setForm(normalizeForForm(voucher)); setEditingId(voucher._id); setFormError('');
    }).catch((failure) => { if (active) setFormError(failure.message || 'Unable to load journal.'); }).finally(() => { if (active) setJournalLoading(false); });
    return () => { active = false; };
  }, [journal, journalId, journalReload, location.search]);

  function openNewForm() {
    setNotice('');
    navigate('/vouchers/new');
  }

  function startAnotherVoucher() {
    const next = { ...emptyVoucher(), voucherType: form.voucherType, date: form.date, entryMode: form.entryMode, bookGroup: form.bookGroup };
    setForm(next);
    setEditingId(null);
    setFormError('');
    setShowForm(true);
    fillNextNumber(next.voucherType, next.date);
  }

  function resetForm(noticeMessage = '') {
    numberVersion.current++;
    setNumbering(false);
    setNumberError('');
    if (journal) navigate('/journal-entry', { state: { notice: typeof noticeMessage === 'string' ? noticeMessage : '' } });
    else if (isNewPage) navigate('/vouchers');
    setShowForm(false);
    setEditingId(null);
    setForm(emptyVoucher());
    setFormError('');
  }

  function updateForm(field, value) {
    if (field === 'voucherNo') { numberVersion.current++; setNumbering(false); setNumberError(''); }
    setForm((current) => ({ ...current, [field]: value, ...(field === 'voucherNo' ? { numberingMode: 'manual' } : {}) }));
    if ((field === 'voucherType' || field === 'date' || field === 'numberingMode' && value === 'auto') && !editingId && (field === 'numberingMode' || form.numberingMode !== 'manual')) {
      fillNextNumber(field === 'voucherType' ? value : form.voucherType, field === 'date' ? value : form.date);
    }
  }

  function updateLine(index, field, value) {
    setForm((current) => {
      const lines = current.lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, [field]: value };
        if (field === 'ledgerName') { next.ledgerGroup = ledgerGroupsByName.get(value) || ''; next.ledgerId = ledgers.find((ledger) => ledger.name === value)?._id; next.allocations = []; }
        return next;
      });
      return { ...current, lines };
    });
  }

  function addLine(side = 'debit') {
    setForm((current) => ({ ...current, lines: [...current.lines, { ...EMPTY_LINE, side }] }));
  }

  function removeLine(index) {
    setForm((current) => {
      if (current.lines.length <= 2) return current;
      return { ...current, lines: current.lines.filter((_, i) => i !== index) };
    });
  }

  const linkedAccount = new URLSearchParams(location.search).get('account');
  const filtered = vouchers.filter((voucher) => {
    if (from && voucher.date < from || to && voucher.date > to) return false;
    if (accountFilter && !voucher.lines?.some((line) => line.ledgerName === accountFilter)) return false;
    if (yearFilter && voucher.financialYear !== yearFilter) return false;
    if (linkedAccount && !voucher.lines?.some((line) => line.ledgerName === linkedAccount)) return false;
    if (typeFilter !== 'All' && voucher.voucherType !== typeFilter) return false;
    if (statusFilter !== 'All' && voucher.status !== statusFilter) return false;
    if (!search) return true;
    const haystack = [
      voucher.voucherNo,
      voucher.voucherType,
      voucher.partyName,
      voucher.referenceNo,
      voucher.narration,
      voucher.sourceNumber,
    ].join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  filtered.sort((first, second) => sort === 'number' ? first.voucherNo.localeCompare(second.voucherNo, undefined, { numeric: true }) : sort === 'amount' ? second.debitTotal - first.debitTotal : second.date.localeCompare(first.date));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const formTotals = totals(form.lines);
  const formDiff = money(formTotals.debit - formTotals.credit);
  const postedCount = vouchers.filter((voucher) => voucher.status === 'Posted').length;
  const draftCount = vouchers.filter((voucher) => voucher.status === 'Draft').length;
  const totalDebit = vouchers.filter((voucher) => voucher.status === 'Posted').reduce((sum, voucher) => sum + money(voucher.debitTotal), 0);
  const totalCredit = vouchers.filter((voucher) => voucher.status === 'Posted').reduce((sum, voucher) => sum + money(voucher.creditTotal), 0);

  const exportColumns = [
    { label: 'Date', value: (row) => row.date },
    { label: 'Voucher Type', value: (row) => row.voucherType },
    { label: 'Voucher No.', value: (row) => row.voucherNo },
    { label: 'Financial Year', value: (row) => row.financialYear },
    { label: 'Party', value: (row) => row.partyName },
    { label: 'Debit', value: (row) => formatCurrency(row.debitTotal) },
    { label: 'Credit', value: (row) => formatCurrency(row.creditTotal) },
    { label: 'Status', value: (row) => row.status },
  ];

  function handleEdit(voucher) {
    setDetails(null);
    setForm(normalizeForForm(voucher));
    setEditingId(voucher._id);
    setFormError('');
    setShowForm(true);
  }

  async function handleDelete(id) {
    await deleteAccountingVoucher(id);
    await loadData();
  }

  async function handleSubmit(event, action = 'Posted') {
    event.preventDefault();
    if (saveLock.current || numbering) return;
    const status = action === 'Draft' ? 'Draft' : 'Posted';
    setFormError('');
    setNotice('');
    if (status === 'Posted' && Math.abs(formDiff) >= 0.01) {
      setFormError('Debit and credit totals must match before posting.');
      return;
    }

    if (journal) {
      const invalid = journalEntryError(form, ledgers, status === 'Posted');
      if (invalid) { setFormError(invalid); return; }
    }
    const lines = form.lines.filter((line) => line.ledgerName.trim() || line.amount !== '' || line.narration.trim() || line.billRef.trim() || line.costCenter?.trim() || line.allocations?.length);
    if (lines.length < 2 || lines.some((line) => !line.ledgerName.trim() || money(line.amount) <= 0)) {
      setFormError('Enter at least two ledger lines with an account and a positive amount.');
      return;
    }
    if (lines.some((line) => !ledgers.some((account) => account.active !== false && account.name === line.ledgerName))) {
      setFormError('Select an active ledger account for every journal line.');
      return;
    }
    if (journal && journalId && !editingId) { setFormError('Wait for the existing journal to load or return to the Journal List.'); return; }
    if (status === 'Posted' && form.entryMode === 'bill' && !form.referenceNo.trim() && !lines.some((line) => line.billRef.trim() || line.allocations?.length)) {
      setFormError('Enter a bill reference for an Against Bill voucher.');
      return;
    }
    if (lines.some((line) => line.allocations?.length && (line.allocations.some((allocation) => !Number.isFinite(Number(allocation.amount)) || Number(allocation.amount) <= 0 || allocation.type !== 'On Account' && !allocation.reference?.trim()) || money(line.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)) !== money(line.amount)))) {
      setFormError('Bill allocations need valid references and positive amounts that total the ledger line amount.');
      return;
    }
    if (editingId && form.status === 'Posted' && !form.alterationReason?.trim()) { setFormError('Enter an alteration reason for this posted voucher.'); return; }
    const payload = {
      ...form,
      status,
      ...(form.numberingMode === 'auto' && !editingId ? { voucherNo: '' } : {}),
      lines: lines.map((line) => ({ ...line, amount: money(line.amount) })),
    };

    saveLock.current = true;
    setSaving(true);
    try {
      if (editingId) await updateAccountingVoucher(editingId, payload);
      else await createAccountingVoucher(payload);
      if (!journal) await loadData();
      const message = status === 'Draft' ? 'Journal saved as draft.' : 'Journal saved successfully.';
      if (action === 'new') {
        if (journal && journalId) navigate('/journal-entry/new');
        else startAnotherVoucher();
      }
      else resetForm(journal ? message : '');
      setNotice(journal ? message : status === 'Draft' ? 'Voucher saved as draft.' : 'Voucher saved successfully.');
    } catch (err) {
      setFormError(err.message || 'Unable to save voucher');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function viewVoucher(voucher) {
    setDetailBusy(true); setDetailError(''); setDetails(voucher);
    try { const data = await getAccountingVoucher(voucher._id); setDetails(data.voucher); }
    catch (failure) { setDetailError(failure.message || 'Unable to load voucher details.'); }
    finally { setDetailBusy(false); }
  }

  function duplicateVoucher(voucher) {
    if (journal) { navigate(`/journal-entry/new?duplicate=${voucher._id}`); return; }
    setDetails(null);
    const duplicate = normalizeForForm(voucher);
    setForm({ ...duplicate, requestKey: crypto.randomUUID(), voucherNo: '', numberingMode: 'auto', status: 'Draft', attachments: [], revision: undefined, financialYear: undefined });
    setEditingId(null); setFormError(''); setShowForm(true);
    fillNextNumber(duplicate.voucherType, duplicate.date);
  }

  async function manageVoucher(action, voucher, reason, date) {
    if (detailBusy) return;
    setDetailBusy(true); setDetailError('');
    try {
      const data = action === 'cancel' ? await cancelAccountingVoucher(voucher._id, reason) : await reverseAccountingVoucher(voucher._id, reason, date);
      if (action === 'cancel') setDetails(data.voucher);
      else { const refreshed = await getAccountingVoucher(voucher._id); setDetails(refreshed.voucher); }
      await loadData();
      setNotice(action === 'cancel' ? 'Voucher cancelled. Audit history retained.' : 'Reversal posted. Original voucher retained.');
    } catch (failure) { setDetailError(failure.message); throw failure; }
    finally { setDetailBusy(false); }
  }

  if (details) return <VoucherDetails voucher={details} busy={detailBusy} error={detailError} onClose={() => { setDetails(null); if (journal) navigate('/journal-entry'); }} onEdit={handleEdit} onDuplicate={duplicateVoucher} onAction={manageVoucher} canControl={canControl} />;

  if (journal) return <JournalVoucherForm
    form={form} editingId={editingId} ledgers={ledgers} saving={saving} numbering={numbering}
    loading={loading || journalLoading} error={formError || numberError || loadError} notice={notice}
    onChange={updateForm} onLineChange={updateLine} onAdd={addLine} onRemove={removeLine}
    onCancel={resetForm} onSubmit={handleSubmit}
    onNew={() => { setNotice(''); if (journalId) navigate('/journal-entry/new'); else startAnotherVoucher(); }}
    onInsert={(index) => setForm((current) => ({ ...current, lines: [...current.lines.slice(0, index + 1), { ...EMPTY_LINE }, ...current.lines.slice(index + 1)] }))}
    onRefreshNumber={() => fillNextNumber('Journal', form.date)}
    onRetry={() => { loadData(); if (journalId) setJournalReload((value) => value + 1); else fillNextNumber('Journal', form.date); }}
  />;

  if (showForm || isNewPage) return <VoucherEntryForm
    form={form} editingId={editingId} voucherTypes={voucherTypes} ledgers={ledgers}
    saving={saving} loading={loading} numbering={numbering} error={formError || numberError || loadError} onChange={updateForm} onLineChange={updateLine}
    onAdd={addLine} onRemove={removeLine} onCancel={resetForm} onSubmit={handleSubmit}
    onRefreshNumber={() => fillNextNumber(form.voucherType, form.date)}
    onDuplicate={(index) => setForm((current) => ({ ...current, lines: [...current.lines.slice(0, index + 1), { ...current.lines[index] }, ...current.lines.slice(index + 1)] }))}
  />;

  return (
    <div className={useAutomobileLayout ? 'av-host p-4 md:p-7' : 'p-4 md:p-7'}>
      {loadError && <p role="alert" className="mb-3 text-red-700">{loadError}<button type="button" onClick={loadData}>Retry</button></p>}
      {notice && <p role="status" className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {useAutomobileLayout && <AutomobileVouchersPage vouchers={vouchers} voucherTypes={voucherTypes} ledgers={ledgers} loading={loading} error={loadError} onRefresh={loadData} onNew={openNewForm} onEdit={handleEdit} onView={viewVoucher} onDuplicate={duplicateVoucher} onDelete={handleDelete} />}
      {!useAutomobileLayout && <>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-1">
        <div>
          <nav className="flex items-center gap-1 text-[13px] text-[#536173] mb-1">
            <a className="text-blue-600 no-underline hover:underline" href="/dashboard">Home</a>
            <span>/</span><span>Accounting</span><span>/</span><span>Vouchers</span>
          </nav>
          <h1 className="m-0 text-[22px] font-bold">Accounting Vouchers</h1>
          <p className="m-0 text-[13px] text-[#536173] mt-0.5">Create and review Tally-style accounting vouchers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons title="Accounting Vouchers" filename="accounting-vouchers" rows={filtered} columns={exportColumns} />
          <button type="button" onClick={openNewForm} className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-blue-600 rounded-md cursor-pointer hover:bg-blue-700 border-0 font-[inherit]">
            <Plus size={14} />
            New Voucher
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-5">
        {[
          { label: 'Total Vouchers', value: String(vouchers.length), sub: `${postedCount} posted`, bg: '#eff6ff', color: '#2563eb' },
          { label: 'Draft Vouchers', value: String(draftCount), sub: 'Pending posting', bg: '#fffbeb', color: '#d97706' },
          { label: 'Total Debit', value: formatCurrency(totalDebit), sub: 'Posted vouchers only', bg: '#fef2f2', color: '#dc2626' },
          { label: 'Total Credit', value: formatCurrency(totalCredit), sub: 'Posted vouchers only', bg: '#f0fdf4', color: '#16a34a' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-[#dfe7f1] rounded-lg p-4">
            <div className="text-xs text-[#536173] mb-1">{stat.label}</div>
            <div className="text-[17px] font-bold leading-tight" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs mt-0.5" style={{ color: stat.color }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      </>}

      {!useAutomobileLayout && <div className="bg-white border border-[#dfe7f1] rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 gap-2 px-3 py-3 border-b border-[#edf2f7] md:flex md:flex-wrap md:items-center md:gap-3 md:px-5 md:py-3.5">
          <div className="relative col-span-2 md:col-span-1 md:min-w-55 md:max-w-sm md:flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#536173]" />
            <input className="h-11 rounded-lg border border-[#dbe4ef] pl-9 pr-3 py-2 text-[13px] w-full outline-none focus:border-blue-500 font-[inherit] md:h-auto md:rounded-md" placeholder="Search vouchers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectDropdown className="min-w-0 md:w-36 md:flex-none" buttonClassName="h-11 rounded-lg md:h-auto md:rounded-md" value={typeFilter} onChange={setTypeFilter} options={['All', ...voucherTypes]} />
          <SelectDropdown className="min-w-0 md:w-32 md:flex-none" buttonClassName="h-11 rounded-lg md:h-auto md:rounded-md" value={statusFilter} onChange={setStatusFilter} options={['All', 'Posted', 'Draft', 'Cancelled']} />
          <input aria-label="Voucher start date" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="border border-[#dbe4ef] rounded-md p-2 text-[13px]" />
          <input aria-label="Voucher end date" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="border border-[#dbe4ef] rounded-md p-2 text-[13px]" />
          <SelectDropdown aria-label="Account / Ledger filter" value={accountFilter} onChange={setAccountFilter} options={[{ value: '', label: 'All ledgers' }, ...ledgers.map((ledger) => ({ value: ledger.name, label: ledger.name }))]} />
          <SelectDropdown aria-label="Financial year filter" value={yearFilter} onChange={setYearFilter} options={[{ value: '', label: 'All financial years' }, ...[...new Set(vouchers.map((voucher) => voucher.financialYear))].filter(Boolean).sort().map((year) => ({ value: year, label: year }))]} />
          <SelectDropdown aria-label="Sort vouchers" value={sort} onChange={setSort} options={[{ value: 'date', label: 'Date (Newest)' }, { value: 'number', label: 'Voucher number' }, { value: 'amount', label: 'Amount (Highest)' }]} />
        </div>

        <div className="overflow-x-auto">
          <BulkDeleteTable allowReadOnlySelection canDelete={record => record.status === 'Draft' && !record.sourceType} onDeleteRecord={record => deleteAccountingVoucher(record._id)} onDeleted={ids => loadData()} className="w-full border-collapse min-w-220">
            <thead>
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Voucher No.</th>
                <th className={TH}>Type</th>
                <th className={TH}>FY</th>
                <th className={TH}>Party</th>
                <th className={`${TH} text-right`}>Debit</th>
                <th className={`${TH} text-right`}>Credit</th>
                <th className={TH}>Status</th>
                <th className={TH}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className={`${TD} text-[#536173]`} colSpan="9">Loading vouchers...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td className={`${TD} text-[#536173]`} colSpan="9">No vouchers found.</td></tr>
              ) : paginated.map((voucher) => {
                const sourceLinked = Boolean(voucher.sourceType && voucher.sourceId);
                return (
                  <BulkDeleteRow record={voucher} key={voucher._id} className="hover:bg-gray-50">
                    <td className={`${TD} text-[#536173]`}>{voucher.date}</td>
                    <td className={`${TD} font-mono font-semibold text-[#111827]`}><button type="button" onClick={() => viewVoucher(voucher)}>{voucher.voucherNo}</button>{voucher.attachments?.length > 0 && <small className="block">Attachments: {voucher.attachments.length}</small>}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{voucher.voucherType}</span>
                        {sourceLinked && <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">Auto</span>}
                      </div>
                    </td>
                    <td className={`${TD} text-[#536173]`}>{voucher.financialYear || '-'}</td>
                    <td className={`${TD} text-[#374151]`}>{voucher.partyName || voucher.sourceNumber || '-'}</td>
                    <td className={`${TD} text-right text-[#dc2626] font-medium`}>{formatCurrency(voucher.debitTotal)}</td>
                    <td className={`${TD} text-right text-[#16a34a] font-medium`}>{formatCurrency(voucher.creditTotal)}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${voucher.status === 'Posted' ? 'text-green-700 bg-green-50' : voucher.status === 'Draft' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'}`}>
                        {voucher.status}
                      </span>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-1">
                        <button type="button" title="View voucher" onClick={() => viewVoucher(voucher)}><Eye size={14} /></button>
                        <button type="button" title="Duplicate voucher" onClick={() => duplicateVoucher(voucher)}><Copy size={14} /></button>
                        <button type="button" disabled={sourceLinked || voucher.status !== 'Draft'} onClick={() => handleEdit(voucher)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 bg-transparent border-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title={sourceLinked ? 'Edit from source document' : 'Edit voucher'}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" disabled={sourceLinked || voucher.status !== 'Draft'} onClick={() => handleDelete(voucher._id).catch((failure) => setLoadError(failure.message))} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 bg-transparent border-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title={sourceLinked ? 'Delete from source document' : 'Delete voucher'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </BulkDeleteRow>
                );
              })}
            </tbody>
          </BulkDeleteTable>
        </div>

        <div className="px-5 py-3 border-t border-[#edf2f7] flex items-center justify-between text-[13px] text-[#536173]">
          <span>Showing {paginated.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-[12px] border border-[#dbe4ef] rounded hover:bg-gray-50 disabled:opacity-40 bg-white font-[inherit] cursor-pointer">Prev</button>
            {pageNumbers(page, totalPages).map((p, i) => p === '...' ? (
              <span key={`ellipsis-${i}`} className="px-2 py-1 text-[12px] text-[#536173]">...</span>
            ) : (
              <button type="button" key={p} onClick={() => setPage(p)} className={`px-2 py-1 text-[12px] border rounded font-[inherit] cursor-pointer ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-[#dbe4ef] hover:bg-gray-50 bg-white'}`}>{p}</button>
            ))}
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 text-[12px] border border-[#dbe4ef] rounded hover:bg-gray-50 disabled:opacity-40 bg-white font-[inherit] cursor-pointer">Next</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
