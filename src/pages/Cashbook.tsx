import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, BookText, Download, Plus } from 'lucide-react';
import { cashbookApi } from '../lib/api';
import { CashbookEntry } from '../types';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Cashbook() {
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
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

  const totals = useMemo(() => {
    const income = entries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const expense = entries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    return { income, expense, balance: income - expense };
  }, [entries]);

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
      setForm({ type: 'income', amount: 0, category: '', note: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo giao dịch.');
    }
  };

  const exportCsv = () => {
    const header = ['Thoi gian', 'Loai', 'Danh muc', 'So tien', 'Ghi chu'];
    const rows = entries.map((e) => [
      new Date(e.createdAt).toLocaleString('vi-VN'),
      e.type === 'income' ? 'Thu' : 'Chi',
      e.category || '',
      String(e.amount || 0),
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

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden">
      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex items-center justify-between gap-4 shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-12 w-12 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-lg">
            <BookText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Sổ quỹ</h1>
            <p className="text-page-subtitle">Thu - Chi và số dư quỹ hiện tại</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 lg:h-11" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button className="h-10 lg:h-11" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tạo giao dịch
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
          <Button variant="outline" onClick={() => { setFromDate(''); setToDate(''); setTypeFilter('all'); }} className="h-10">Reset lọc</Button>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tổng thu</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(totals.income)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tổng chi</p>
            <p className="mt-1 text-lg font-semibold text-rose-700">{formatCurrency(totals.expense)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Số dư quỹ</p>
            <p className={`mt-1 text-lg font-semibold ${totals.balance >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{formatCurrency(totals.balance)}</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Lịch sử giao dịch</div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Đang tải...</p>
          ) : entries.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Chưa có giao dịch thu chi.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{entry.category || 'Khác'}</p>
                    <p className="text-xs text-slate-500 truncate">{entry.note || 'Không ghi chú'} · {new Date(entry.createdAt).toLocaleString('vi-VN')}</p>
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
          <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Thêm giao dịch sổ quỹ</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm((p) => ({ ...p, type: 'income' }))} className={`h-10 rounded-lg border ${form.type === 'income' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'} text-sm`}>
                <ArrowDownCircle className="inline h-4 w-4 mr-1" /> Thu
              </button>
              <button type="button" onClick={() => setForm((p) => ({ ...p, type: 'expense' }))} className={`h-10 rounded-lg border ${form.type === 'expense' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600'} text-sm`}>
                <ArrowUpCircle className="inline h-4 w-4 mr-1" /> Chi
              </button>
            </div>
            <Input type="number" value={form.amount || ''} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))} placeholder="Số tiền" />
            <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="Danh mục (vd: Bán hàng, Điện nước...)" />
            <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Ghi chú" />
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
