import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, BookText, Download, Plus } from 'lucide-react';
import { cashAccountsApi, cashbookApi } from '../lib/api';
import { CashbookEntry } from '../types';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppPageHeader from '../components/layout/AppPageHeader';
import { useApp } from '../context/AppContext';

const technicalIdPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const readableEntryNote = (entry: CashbookEntry) => {
  const note = entry.displayNote || entry.note || '';
  if (!entry.referenceLabel && entry.referenceId && technicalIdPattern.test(entry.note || '')) {
    technicalIdPattern.lastIndex = 0;
    const legacyLabel = entry.category === 'Bán hàng'
      ? 'Hóa đơn cũ'
      : entry.category === 'Hoàn tiền khách hàng'
        ? 'Phiếu trả cũ'
        : 'chứng từ cũ';
    return String(entry.note).replace(technicalIdPattern, legacyLabel).replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim() || 'Không ghi chú';
  }
  technicalIdPattern.lastIndex = 0;
  const withDocument = entry.referenceLabel && entry.referenceId
    ? note.replaceAll(entry.referenceId, entry.referenceLabel)
    : note;
  return withDocument.replace(technicalIdPattern, '').replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim() || 'Không ghi chú';
};

export default function Cashbook() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [participants, setParticipants] = useState<{ users: any[]; customers: any[]; suppliers: any[] }>({ users: [], customers: [], suppliers: [] });
  const [accountFilter, setAccountFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [form, setForm] = useState({
    type: 'income' as 'income' | 'expense',
    amount: 0,
    category: '',
    note: '',
    accountId: '',
    actorId: '',
    counterpartyType: 'other' as 'customer' | 'supplier' | 'other',
    counterpartyId: '',
    counterpartyName: '',
  });
  const [error, setError] = useState('');

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await cashbookApi.list({
        from: fromDate || undefined,
        to: toDate || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
      });
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải sổ quỹ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [fromDate, toDate, typeFilter]);
  useEffect(() => { cashAccountsApi.list().then(setAccounts).catch(() => setAccounts([])); }, []);
  useEffect(() => {
    if (!showModal) return;
    cashbookApi.participants().then(setParticipants).catch(() => setParticipants({ users: [], customers: [], suppliers: [] }));
  }, [showModal]);
  useEffect(() => {
    if (currentUser?.id) setForm((previous) => ({ ...previous, actorId: previous.actorId || currentUser.id }));
  }, [currentUser?.id]);

  const totals = useMemo(() => {
    const scoped = accountFilter === 'all' ? entries : entries.filter((entry) => entry.accountId === accountFilter);
    const income = scoped.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const expense = scoped.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    return { income, expense, balance: income - expense };
  }, [accountFilter, entries]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.amount <= 0) {
      setError('Số tiền phải lớn hơn 0.');
      return;
    }
    try {
      const created = await cashbookApi.create(form);
      setEntries((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({ type: 'income', amount: 0, category: '', note: '', accountId: '', actorId: currentUser?.id || '', counterpartyType: 'other', counterpartyId: '', counterpartyName: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo giao dịch.');
    }
  };

  const exportCsv = () => {
    const header = ['Thoi gian', 'Loai', 'Tai khoan', 'Danh muc', 'So tien', 'Nguoi thu/chi', 'Nguoi nop/nhan', 'Ghi chu'];
    const rows = entries.filter((e) => accountFilter === 'all' || e.accountId === accountFilter).map((e) => [
      new Date(e.createdAt).toLocaleString('vi-VN'),
      e.type === 'income' ? 'Thu' : 'Chi',
      accounts.find((account) => account.id === e.accountId)?.name || 'Chưa phân bổ',
      e.category || '',
      String(e.amount || 0),
      e.actorName || e.createdByName || 'Chua xac dinh',
      e.counterpartyName || '',
      (e.note || '').replaceAll(',', ' '),
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cashbook-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openReference = (entry: CashbookEntry) => {
    if (!entry.referenceId) return;
    if (entry.referenceType === 'invoice' || entry.category === 'Bán hàng') {
      navigate(`/app/invoices?invoiceId=${encodeURIComponent(entry.referenceId)}`);
      return;
    }
    if (entry.referenceType === 'sales_return' || entry.category === 'Hoàn tiền khách hàng') {
      navigate('/app/returns');
      return;
    }
    if (entry.referenceType === 'purchase_return') {
      navigate('/app/purchase-returns');
      return;
    }
    if (entry.referenceType === 'purchase') {
      navigate(`/app/purchases?purchaseId=${encodeURIComponent(entry.referenceId)}`);
      return;
    }
    if (entry.category?.includes('Nhập hàng')) {
      navigate(`/app/purchases?purchaseId=${encodeURIComponent(entry.referenceId)}`);
      return;
    }
    if (entry.category?.includes('NCC')) {
      navigate('/app/suppliers');
      return;
    }
    navigate('/app/debt');
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden">
      <AppPageHeader icon={BookText} accentClassName="bg-emerald-600" title="Sổ quỹ" subtitle="Thu - Chi và số dư quỹ hiện tại" actions={<div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
          <Button variant="outline" className="h-10 lg:h-11 px-3" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button className="h-10 lg:h-11 px-3" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tạo giao dịch
          </Button>
        </div>} />

      <div className="flex-1 overflow-y-auto space-y-2 p-2 md:space-y-3 md:p-3 lg:p-4">
        <section className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-4 md:p-3">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="all">Tất cả tài khoản</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
          <Button variant="outline" onClick={() => { setFromDate(''); setToDate(''); setTypeFilter('all'); }} className="h-10">Reset lọc</Button>
        </section>

        <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Tổng thu</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(totals.income)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Tổng chi</p>
            <p className="mt-1 text-lg font-semibold text-rose-700">{formatCurrency(totals.expense)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Số dư quỹ</p>
            <p className={`mt-1 text-lg font-semibold ${totals.balance >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{formatCurrency(totals.balance)}</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Lịch sử giao dịch</div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Đang tải...</p>
          ) : entries.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Chưa có giao dịch thu chi.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{entry.category || 'Khác'}</p>
                    <p className="truncate text-xs text-slate-500">{accounts.find((account) => account.id === entry.accountId)?.name || 'Chưa phân bổ'} · {readableEntryNote(entry)} · {new Date(entry.createdAt).toLocaleString('vi-VN')}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Người thực hiện: {entry.createdByName || 'Chưa xác định'}</p>
                    {(entry.actorName || entry.counterpartyName) && <p className="mt-0.5 text-[11px] text-slate-500">{entry.type === 'income' ? 'Người thu' : 'Người chi'}: {entry.actorName || 'Chưa xác định'}{entry.counterpartyName ? ` · ${entry.type === 'income' ? 'Người nộp' : 'Người nhận'}: ${entry.counterpartyName}` : ''}</p>}
                    {entry.referenceId && entry.referenceLabel && <button type="button" onClick={() => openReference(entry)} className="mt-0.5 text-[11px] text-sky-700 hover:underline">Mở chứng từ liên quan · {entry.referenceLabel}</button>}
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${entry.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <form onSubmit={submit} className="max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-base font-semibold text-slate-900">Tạo phiếu {form.type === 'income' ? 'thu' : 'chi'} tiền</h3><p className="mt-0.5 text-xs text-slate-500">Thông tin người thực hiện và đối tác được lưu cùng giao dịch.</p></div>
              <button type="button" onClick={() => setShowModal(false)} className="text-xl leading-none text-slate-400 hover:text-slate-700" aria-label="Đóng">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm((p) => ({ ...p, type: 'income' }))} className={`h-10 rounded-lg border ${form.type === 'income' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'} text-sm`}>
                <ArrowDownCircle className="inline h-4 w-4 mr-1" /> Thu
              </button>
              <button type="button" onClick={() => setForm((p) => ({ ...p, type: 'expense' }))} className={`h-10 rounded-lg border ${form.type === 'expense' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600'} text-sm`}>
                <ArrowUpCircle className="inline h-4 w-4 mr-1" /> Chi
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Loại {form.type === 'income' ? 'thu' : 'chi'}<Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder={form.type === 'income' ? 'Ví dụ: Thu công nợ' : 'Ví dụ: Điện nước'} /></label>
              <label className="text-xs font-medium text-slate-600">{form.type === 'income' ? 'Người thu' : 'Người chi'}<select value={form.actorId} onChange={(e) => setForm((p) => ({ ...p, actorId: e.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Chọn tài khoản</option>{participants.users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}</option>)}</select></label>
              <label className="text-xs font-medium text-slate-600">{form.type === 'income' ? 'Đối tượng nộp' : 'Đối tượng nhận'}<select value={form.counterpartyType} onChange={(e) => setForm((p) => ({ ...p, counterpartyType: e.target.value as 'customer' | 'supplier' | 'other', counterpartyId: '', counterpartyName: '' }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="customer">Khách hàng</option><option value="supplier">Nhà cung cấp</option><option value="other">Khác</option></select></label>
              <label className="text-xs font-medium text-slate-600">{form.type === 'income' ? 'Tên người nộp' : 'Tên người nhận'}{form.counterpartyType === 'other' ? <Input value={form.counterpartyName} onChange={(e) => setForm((p) => ({ ...p, counterpartyName: e.target.value }))} placeholder="Nhập tên đối tác" /> : <select value={form.counterpartyId} onChange={(e) => { const collection = form.counterpartyType === 'customer' ? participants.customers : participants.suppliers; const selected = collection.find((item) => item.id === e.target.value); setForm((p) => ({ ...p, counterpartyId: e.target.value, counterpartyName: selected?.name || '' })); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Chọn đối tác</option>{(form.counterpartyType === 'customer' ? participants.customers : participants.suppliers).map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}</select>}</label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Số tiền<Input type="number" min="0" step="0.01" value={form.amount || ''} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))} placeholder="Nhập số tiền" /></label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Tài khoản ghi nhận<select value={form.accountId} onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Tự động: Tiền mặt</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Ghi chú<textarea value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Nhập ghi chú" className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500" /></label>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
              <Button type="submit">Lưu giao dịch</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
