import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, ChevronRight, TrendingUp, X } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { debtLedgerApi } from '../lib/api';
import { DebtLedger } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Debt() {
  const { customers, refreshCustomers, activeTenant } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ledgers, setLedgers] = useState<DebtLedger[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [formError, setFormError] = useState('');
  const [debtForm, setDebtForm] = useState({
    customerId: '',
    amount: 0,
    type: 'decrease' as 'increase' | 'decrease',
    note: '',
    payFull: false,
  });

  const selectedDebtCustomer = useMemo(
    () => customers.find((customer) => customer.id === debtForm.customerId) || null,
    [customers, debtForm.customerId]
  );

  const debtCustomers = useMemo(() => {
    return customers.filter(c => c.totalDebt > 0);
  }, [customers]);

  const totalDebtAmount = useMemo(() => {
    return debtCustomers.reduce((sum, c) => sum + c.totalDebt, 0);
  }, [debtCustomers]);

  const overdueDebtAmount = useMemo(() => {
    const maxDebtDays = activeTenant?.settings?.debtPolicy?.maxDebtDays || 30;
    const cutoff = Date.now() - maxDebtDays * 24 * 60 * 60 * 1000;
    const overIncreaseByCustomer = new Map<string, number>();
    const decreasesByCustomer = new Map<string, number>();

    ledgers.forEach((entry) => {
      const createdAt = new Date(entry.createdAt).getTime();
      if (entry.type === 'increase' && createdAt <= cutoff) {
        overIncreaseByCustomer.set(entry.customerId, (overIncreaseByCustomer.get(entry.customerId) || 0) + entry.amount);
      }
      if (entry.type === 'decrease') {
        decreasesByCustomer.set(entry.customerId, (decreasesByCustomer.get(entry.customerId) || 0) + entry.amount);
      }
    });

    return debtCustomers.reduce((sum, customer) => {
      const overIncrease = overIncreaseByCustomer.get(customer.id) || 0;
      const decreased = decreasesByCustomer.get(customer.id) || 0;
      const estimatedOverdue = Math.max(0, overIncrease - decreased);
      return sum + Math.min(estimatedOverdue, customer.totalDebt);
    }, 0);
  }, [activeTenant?.settings?.debtPolicy?.maxDebtDays, debtCustomers, ledgers]);

  const filteredDebtCustomers = debtCustomers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  const openDebtModal = (type: 'increase' | 'decrease', customerId?: string) => {
    setDebtForm({
      customerId: customerId || searchParams.get('customerId') || debtCustomers[0]?.id || customers[0]?.id || '',
      amount: 0,
      type,
      note: type === 'decrease' ? 'Thu công nợ' : 'Điều chỉnh tăng công nợ',
      payFull: false,
    });
    setShowDebtModal(true);
  };

  const handleSubmitDebt = async () => {
    setFormError('');
    if (!debtForm.customerId || debtForm.amount <= 0) {
      setFormError('Vui lòng chọn khách hàng và nhập số tiền hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await debtLedgerApi.create({
        customerId: debtForm.customerId,
        amount: debtForm.payFull && debtForm.type === 'decrease' && selectedDebtCustomer
          ? selectedDebtCustomer.totalDebt
          : debtForm.amount,
        type: debtForm.type,
        note: debtForm.note.trim(),
        invoiceId: null,
      });
      setLedgers((prev) => [created, ...prev]);
      await refreshCustomers();
      setShowDebtModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu giao dịch công nợ.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const targetCustomer = searchParams.get('customerId');
    if (targetCustomer) {
      openDebtModal('decrease', targetCustomer);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadLedgers = async () => {
      setLoadingLedgers(true);
      try {
        const data = await debtLedgerApi.list();
        setLedgers(data);
      } catch (err) {
        console.error('Failed to load debt ledger:', err);
      } finally {
        setLoadingLedgers(false);
      }
    };
    loadLedgers();
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      {showDebtModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-section-title">
                {debtForm.type === 'decrease' ? 'Thu công nợ' : 'Tăng công nợ'}
              </h3>
              <button
                onClick={() => setShowDebtModal(false)}
                aria-label="Đóng popup"
                className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label>Khách hàng</label>
              <select
                value={debtForm.customerId}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, customerId: e.target.value }))}
                className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label>Số tiền</label>
              <Input
                type="number"
                min={1}
                value={debtForm.amount || ''}
                disabled={debtForm.type === 'decrease' && debtForm.payFull}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                className="h-11 rounded-lg bg-slate-50 border-none font-bold"
                placeholder="Nhập số tiền"
              />
            </div>

            {debtForm.type === 'decrease' && selectedDebtCustomer && (
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 space-y-2">
                <p className="text-sm text-slate-600">
                  Công nợ hiện tại: <span className="font-semibold text-sky-700">{formatCurrency(selectedDebtCustomer.totalDebt)}</span>
                </p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={debtForm.payFull}
                    onChange={(e) =>
                      setDebtForm((prev) => ({
                        ...prev,
                        payFull: e.target.checked,
                        amount: e.target.checked ? selectedDebtCustomer.totalDebt : prev.amount,
                        note: e.target.checked ? 'Thanh toán hết công nợ' : prev.note,
                      }))
                    }
                  />
                  Thanh toán hết công nợ
                </label>
              </div>
            )}

            <div className="space-y-2">
              <label>Ghi chú</label>
              <Input
                value={debtForm.note}
                onChange={(e) => setDebtForm((prev) => ({ ...prev, note: e.target.value }))}
                className="h-11 rounded-lg bg-slate-50 border-none font-bold"
                placeholder="Nội dung giao dịch"
              />
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}

            <Button
              onClick={handleSubmitDebt}
              disabled={submitting}
              className={`w-full h-11 rounded-lg text-sm font-semibold ${
                debtForm.type === 'decrease' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {submitting ? 'Đang lưu...' : 'Lưu giao dịch'}
            </Button>
          </div>
        </div>
      )}

      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-3 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-900/20 transform -rotate-3 shrink-0">
            <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Công nợ</h1>
            <p className="text-page-subtitle mt-1">{debtCustomers.length} khách nợ</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative group flex-1 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-orange-600 transition-colors" />
            <Input 
              className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-orange-500/20 transition-all font-semibold text-sm placeholder:text-slate-400" 
              placeholder="Tìm khách nợ..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => openDebtModal('decrease')}
            className="h-10 lg:h-11 px-4 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-900/20 transition-all text-white shrink-0 text-sm"
          >
            <ArrowDownCircle className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Thu nợ</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-10 space-y-6 lg:space-y-10">
        
        {/* Debt Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-slate-900 p-5 rounded-lg shadow-xl space-y-4 relative overflow-hidden group">
                <div className="relative z-10 space-y-2">
                    <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-md text-white group-hover:rotate-12 transition-transform duration-500">
                        <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-white/70">Tổng dư nợ hệ thống</p>
                        <h2 className="text-kpi-lg text-white">{formatCurrency(totalDebtAmount)}</h2>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-lg shadow-lg shadow-slate-900/5 border border-white space-y-4 relative overflow-hidden group">
                 <div className="relative z-10 space-y-2">
                    <div className="h-10 w-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 shadow-inner group-hover:scale-110 transition-transform">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-slate-500">Khoản nợ quá hạn</p>
                        <h2 className="text-kpi-lg text-orange-600">{formatCurrency(overdueDebtAmount)}</h2>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-lg shadow-lg shadow-slate-900/5 border border-white space-y-3 flex flex-col justify-center">
                 <div className="space-y-2 text-center">
                    <div className="text-xs font-medium text-slate-500">Hành động nhanh</div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => openDebtModal('decrease')}
                            className="flex-1 h-14 rounded-lg bg-slate-50 hover:bg-sky-50 transition-all flex flex-col items-center justify-center gap-1 group border border-transparent hover:border-sky-100"
                        >
                            <ArrowDownCircle className="h-4 w-4 text-sky-600 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-medium text-slate-600">Giảm nợ</span>
                        </button>
                        <button
                            onClick={() => openDebtModal('increase')}
                            className="flex-1 h-14 rounded-lg bg-slate-50 hover:bg-orange-50 transition-all flex flex-col items-center justify-center gap-1 group border border-transparent hover:border-orange-100"
                        >
                            <ArrowUpCircle className="h-4 w-4 text-orange-600 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-medium text-slate-600">Tăng nợ</span>
                        </button>
                    </div>
                 </div>
            </div>
        </div>

        {/* Debt List */}
        <div className="bg-white rounded-lg shadow-xl shadow-slate-900/10 border border-white overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-50 flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="text-section-title">Khách hàng nợ</h3>
                    <p className="text-section-subtitle">Sắp xếp theo số dư nợ cao nhất</p>
                </div>
            </div>

            <div className="divide-y divide-slate-50">
                {filteredDebtCustomers.map(customer => (
                    <div key={customer.id} className="p-4 sm:p-6 hover:bg-orange-50/20 transition-all group flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 cursor-pointer" onClick={() => navigate(`/app/customers/${customer.id}`)}>
                        <div className="flex items-center gap-4 sm:gap-6">
                             <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-orange-600 group-hover:text-white transition-all duration-500">
                                 <Wallet className="h-6 w-6 sm:h-7 sm:w-7" />
                             </div>
                             <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <h4 className="text-base sm:text-lg font-semibold text-slate-900">{customer.name}</h4>
                                    <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg">Nợ</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-slate-400 font-bold text-[10px]">
                                    <span className="font-mono">{customer.phone}</span>
                                </div>
                             </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                             <div className="text-right space-y-1">
                                <p className="text-xs text-slate-500 mb-1">Dư nợ hiện tại</p>
                                <div className="text-kpi-lg text-orange-600">{formatCurrency(customer.totalDebt)}</div>
                             </div>
                             <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDebtModal('decrease', customer.id);
                                }}
                                className="h-10 rounded-lg px-4 text-sm font-semibold bg-sky-600 hover:bg-sky-700"
                              >
                                Thu nợ
                              </Button>
                             <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-all transform group-hover:translate-x-1">
                                <ChevronRight className="h-4 w-4" />
                             </div>
                        </div>
                    </div>
                ))}

                {filteredDebtCustomers.length === 0 && (
                    <div className="p-40 text-center space-y-10 animate-pulse">
                         <div className="inline-flex h-40 w-40 items-center justify-center rounded-lg bg-slate-50 text-slate-100 shadow-inner">
                            <CheckCircle className="h-20 w-20 opacity-5" />
                         </div>
                         <div className="space-y-2">
                            <p className="text-slate-300 text-sm font-semibold">Danh sách công nợ trống</p>
                            <p className="text-slate-300 text-xs">Tất cả khách hàng đã thanh toán đầy đủ</p>
                         </div>
                    </div>
                )}
            </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl shadow-slate-900/10 border border-white overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-50">
            <h3 className="text-section-title">Lịch sử công nợ</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {loadingLedgers && (
              <div className="p-6 text-sm text-slate-500">Đang tải lịch sử...</div>
            )}
            {!loadingLedgers && ledgers.slice(0, 12).map((entry) => {
              const customer = customers.find((c) => c.id === entry.customerId);
              return (
                <div key={entry.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{customer?.name || entry.customerId}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(entry.createdAt).toLocaleString('vi-VN')} · {entry.note || 'Không có ghi chú'}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold ${entry.type === 'increase' ? 'text-orange-600' : 'text-sky-600'}`}>
                    {entry.type === 'increase' ? '+' : '-'} {formatCurrency(entry.amount)}
                  </div>
                </div>
              );
            })}
            {!loadingLedgers && ledgers.length === 0 && (
              <div className="p-6 text-sm text-slate-500">Chưa có giao dịch công nợ.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
