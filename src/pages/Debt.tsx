import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, ChevronRight, TrendingUp, X, MessageCircleMore, Copy, ExternalLink, Tags } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { customerCareApi, debtLedgerApi, customersApi } from '../lib/api';
import { CustomerCareLog, DebtLedger } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Debt() {
  const { customers, refreshCustomers, activeTenant, invoices } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ledgers, setLedgers] = useState<DebtLedger[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [formError, setFormError] = useState('');
  const [showZaloReminderModal, setShowZaloReminderModal] = useState(false);
  const [zaloMessage, setZaloMessage] = useState('');
  const [zaloDueDate, setZaloDueDate] = useState('');
  const [zaloTargetCustomerId, setZaloTargetCustomerId] = useState('');
  const [zaloTemplateType, setZaloTemplateType] = useState<'pre_due' | 'due_today' | 'overdue' | 'thanks_after_payment' | 'repurchase_invite' | 'new_arrival'>('due_today');
  const [careLogs, setCareLogs] = useState<CustomerCareLog[]>([]);
  const [loadingCareLogs, setLoadingCareLogs] = useState(false);
  const [careFilter, setCareFilter] = useState<'all' | 'debt' | 'due_soon' | 'inactive_7' | 'inactive_30'>('all');
  const [tagEditorCustomerId, setTagEditorCustomerId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
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

  const selectedZaloCustomer = useMemo(
    () => customers.find((customer) => customer.id === zaloTargetCustomerId) || null,
    [customers, zaloTargetCustomerId]
  );

  const messageTemplates = useMemo(() => ({
    pre_due: 'Dạ em chào anh/chị {ten_khach}. Em gửi nhắc nhẹ công nợ hiện tại của mình là {so_tien}, hạn thanh toán {ngay_han}. Khi tiện anh/chị hỗ trợ giúp em nhé. Em cảm ơn ạ.',
    due_today: 'Dạ em chào anh/chị {ten_khach}. Hôm nay là hạn thanh toán công nợ {so_tien}. Anh/chị sắp xếp hỗ trợ giúp em trong hôm nay nhé. Em cảm ơn ạ.',
    overdue: 'Dạ em chào anh/chị {ten_khach}. Công nợ {so_tien} đã quá hạn từ {ngay_han}. Anh/chị hỗ trợ thanh toán sớm giúp em để em đối soát ạ. Em cảm ơn.',
    thanks_after_payment: 'Em cảm ơn anh/chị {ten_khach} đã thanh toán công nợ. Cửa hàng rất trân trọng sự đồng hành của anh/chị ạ.',
    repurchase_invite: 'Dạ chào anh/chị {ten_khach}. Cửa hàng có chương trình ưu đãi cho khách thân thiết, em mời anh/chị ghé lại mua hàng nhé.',
    new_arrival: 'Dạ chào anh/chị {ten_khach}. Bên em vừa có hàng mới phù hợp nhu cầu của anh/chị, em gửi thông tin để anh/chị tham khảo ạ.',
  }), []);

  const lastPurchaseByCustomer = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((invoice) => {
      if (!invoice.customerId) return;
      const existing = map.get(invoice.customerId);
      if (!existing || new Date(invoice.createdAt).getTime() > new Date(existing).getTime()) {
        map.set(invoice.customerId, invoice.createdAt);
      }
    });
    return map;
  }, [invoices]);

  const withDerivedFields = useMemo(() => {
    return customers.map((customer) => {
      const dueDate = estimateDueDateForCustomer(customer.id);
      const lastPurchase = lastPurchaseByCustomer.get(customer.id) || null;
      const latestCare = careLogs.find((log) => log.customerId === customer.id) || null;
      return { customer, dueDate, lastPurchase, latestCare };
    });
  }, [customers, careLogs, lastPurchaseByCustomer]);

  const filteredDebtCustomers = withDerivedFields
    .filter(({ customer, dueDate, lastPurchase }) => {
      const matchesSearch =
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone.includes(searchTerm);
      if (!matchesSearch) return false;
      if (careFilter === 'all') return customer.totalDebt > 0;
      if (careFilter === 'debt') return customer.totalDebt > 0;
      if (careFilter === 'due_soon') {
        const due = new Date(dueDate).getTime();
        const now = Date.now();
        const in7Days = now + 7 * 24 * 60 * 60 * 1000;
        return customer.totalDebt > 0 && due >= now && due <= in7Days;
      }
      if (careFilter === 'inactive_7') {
        if (!lastPurchase) return true;
        return Date.now() - new Date(lastPurchase).getTime() >= 7 * 24 * 60 * 60 * 1000;
      }
      if (careFilter === 'inactive_30') {
        if (!lastPurchase) return true;
        return Date.now() - new Date(lastPurchase).getTime() >= 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    })
    .sort((a, b) => b.customer.totalDebt - a.customer.totalDebt);

  function estimateDueDateForCustomer(customerId: string) {
    const maxDebtDays = activeTenant?.settings?.debtPolicy?.maxDebtDays || 30;
    const latestIncrease = ledgers
      .filter((entry) => entry.customerId === customerId && entry.type === 'increase')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const base = latestIncrease ? new Date(latestIncrease.createdAt) : new Date();
    const due = new Date(base.getTime() + maxDebtDays * 24 * 60 * 60 * 1000);
    return due.toISOString().slice(0, 10);
  }

  const buildZaloReminderMessage = (
    customerName: string,
    debtAmount: number,
    dueDateIso: string,
    templateType: 'pre_due' | 'due_today' | 'overdue' | 'thanks_after_payment' | 'repurchase_invite' | 'new_arrival'
  ) => {
    const dueDate = new Date(dueDateIso).toLocaleDateString('vi-VN');
    const template = messageTemplates[templateType];
    return template
      .replaceAll('{ten_khach}', customerName)
      .replaceAll('{so_tien}', formatCurrency(debtAmount))
      .replaceAll('{ngay_han}', dueDate);
  };

  const openZaloReminder = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const dueDate = estimateDueDateForCustomer(customerId);
    setZaloTargetCustomerId(customerId);
    setZaloDueDate(dueDate);
    setZaloTemplateType('due_today');
    setZaloMessage(buildZaloReminderMessage(customer.name, customer.totalDebt, dueDate, 'due_today'));
    setShowZaloReminderModal(true);
  };

  const normalizePhoneForZalo = (rawPhone: string) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('84')) return digits;
    if (digits.startsWith('0')) return `84${digits.slice(1)}`;
    return digits;
  };

  const handleCopyZaloMessage = async () => {
    try {
      await navigator.clipboard.writeText(zaloMessage);
      setFormError('');
    } catch {
      setFormError('Không thể copy nội dung. Vui lòng copy thủ công.');
    }
  };

  const createCareLog = async (status: CustomerCareLog['status']) => {
    if (!selectedZaloCustomer) return;
    try {
      const created = await customerCareApi.create({
        customerId: selectedZaloCustomer.id,
        channel: 'zalo',
        templateType: zaloTemplateType,
        message: zaloMessage,
        dueDate: zaloDueDate || null,
        status,
        responded: false,
        note: '',
      });
      setCareLogs((prev) => [created, ...prev]);
    } catch (err) {
      console.error('Failed to create care log', err);
    }
  };

  const handleOpenZalo = () => {
    if (!selectedZaloCustomer) return;
    const phone = normalizePhoneForZalo(selectedZaloCustomer.phone);
    if (!phone) {
      setFormError('Số điện thoại khách hàng không hợp lệ để mở Zalo.');
      return;
    }
    const deepLink = `zalo://conversation?phone=${phone}`;
    const webFallback = `https://zalo.me/${phone}`;
    void createCareLog('sent');
    window.location.href = deepLink;
    window.setTimeout(() => {
      window.open(webFallback, '_blank', 'noopener,noreferrer');
    }, 500);
  };

  const updateCareStatus = async (logId: string, status: CustomerCareLog['status']) => {
    try {
      const updated = await customerCareApi.update(logId, {
        status,
        responded: status === 'promised' || status === 'paid',
      });
      setCareLogs((prev) => prev.map((log) => (log.id === logId ? updated : log)));
    } catch (err) {
      console.error('Failed to update care status', err);
    }
  };

  const saveCustomerTags = async (customerId: string) => {
    if (!tagInput.trim()) return;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const existingTags = customer.tags || [];
    const nextTags = Array.from(new Set([...existingTags, ...tagInput.split(',').map((t) => t.trim()).filter(Boolean)]));
    setSavingTags(true);
    try {
      await customersApi.update(customerId, { tags: nextTags });
      await refreshCustomers();
      setTagInput('');
      setTagEditorCustomerId('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không lưu được tags.');
    } finally {
      setSavingTags(false);
    }
  };

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
    const queryFilter = searchParams.get('careFilter');
    if (queryFilter && ['all', 'debt', 'due_soon', 'inactive_7', 'inactive_30'].includes(queryFilter)) {
      setCareFilter(queryFilter as typeof careFilter);
    }
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

  useEffect(() => {
    const loadCareLogs = async () => {
      setLoadingCareLogs(true);
      try {
        const data = await customerCareApi.list();
        setCareLogs(data);
      } catch (err) {
        console.error('Failed to load customer care logs:', err);
      } finally {
        setLoadingCareLogs(false);
      }
    };
    loadCareLogs();
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

      {showZaloReminderModal && selectedZaloCustomer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-white bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-section-title">Nhắc nợ qua Zalo</h3>
              <button
                onClick={() => setShowZaloReminderModal(false)}
                aria-label="Đóng popup"
                className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
              <p><span className="text-slate-500">Khách hàng:</span> <span className="font-semibold text-slate-900">{selectedZaloCustomer.name}</span></p>
              <p><span className="text-slate-500">Số điện thoại:</span> <span className="font-semibold text-slate-900">{selectedZaloCustomer.phone}</span></p>
              <p><span className="text-slate-500">Công nợ:</span> <span className="font-semibold text-orange-600">{formatCurrency(selectedZaloCustomer.totalDebt)}</span></p>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Hạn thanh toán</label>
                <Input
                  type="date"
                  value={zaloDueDate}
                  onChange={(e) => {
                    const dueDate = e.target.value;
                    setZaloDueDate(dueDate);
                    setZaloMessage(buildZaloReminderMessage(selectedZaloCustomer.name, selectedZaloCustomer.totalDebt, dueDate, zaloTemplateType));
                  }}
                  className="h-10 rounded-lg bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-700">Mẫu tin nhắn</label>
              <select
                value={zaloTemplateType}
                onChange={(e) => {
                  const nextType = e.target.value as typeof zaloTemplateType;
                  setZaloTemplateType(nextType);
                  setZaloMessage(buildZaloReminderMessage(selectedZaloCustomer.name, selectedZaloCustomer.totalDebt, zaloDueDate, nextType));
                }}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="pre_due">Nhắc trước hạn</option>
                <option value="due_today">Nhắc đến hạn</option>
                <option value="overdue">Nhắc quá hạn</option>
                <option value="thanks_after_payment">Cảm ơn sau thanh toán</option>
                <option value="repurchase_invite">Mời mua lại</option>
                <option value="new_arrival">Báo hàng mới</option>
              </select>
              <label className="text-sm text-slate-700">Nội dung nhắc nợ</label>
              <textarea
                value={zaloMessage}
                onChange={(e) => setZaloMessage(e.target.value)}
                className="w-full min-h-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              />
              <p className="text-xs text-slate-500">Khuyến nghị: bấm Copy trước, sau đó mở Zalo để dán và gửi.</p>
            </div>

            {formError && <p className="text-sm text-rose-600">{formError}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 rounded-lg text-sm font-semibold" onClick={handleCopyZaloMessage}>
                <Copy className="h-4 w-4 mr-2" /> Copy nội dung
              </Button>
              <Button className="h-11 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenZalo}>
                <ExternalLink className="h-4 w-4 mr-2" /> Mở Zalo
              </Button>
            </div>
          </div>
        </div>
      )}

      {tagEditorCustomerId && (
        <div className="fixed inset-0 z-[109] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-section-title">Tag khách hàng</h3>
              <button onClick={() => setTagEditorCustomerId('')} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Nhập tag, ngăn cách bằng dấu phẩy. Ví dụ: VIP, Nợ quá hạn, Lâu chưa mua</p>
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="h-11 rounded-lg bg-slate-50 border-none font-semibold" />
            <Button onClick={() => saveCustomerTags(tagEditorCustomerId)} disabled={savingTags} className="w-full h-11 rounded-lg">
              {savingTags ? 'Đang lưu...' : 'Lưu tag'}
            </Button>
          </div>
        </div>
      )}

      <div className="p-3 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-2 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-900/20 transform -rotate-3 shrink-0">
            <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Công nợ</h1>
            <p className="text-page-subtitle mt-1">{debtCustomers.length} khách nợ</p>
          </div>
        </div>
        
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3">
          <div className="relative group w-full flex-1 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-orange-600 transition-colors" />
            <Input 
              className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-orange-500/20 transition-all font-semibold text-sm placeholder:text-slate-400" 
              placeholder="Tìm khách nợ..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:gap-3">
            <select
              value={careFilter}
              onChange={(e) => setCareFilter(e.target.value as typeof careFilter)}
              className="h-10 lg:h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">Còn nợ</option>
              <option value="due_soon">Sắp đến hạn</option>
              <option value="inactive_7">7 ngày chưa mua</option>
              <option value="inactive_30">30 ngày chưa mua</option>
            </select>
            <Button
              onClick={() => openDebtModal('decrease')}
              className="h-10 lg:h-11 px-3 lg:px-4 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-900/20 transition-all text-white shrink-0 text-sm"
            >
              <ArrowDownCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Thu nợ</span>
            </Button>
          </div>
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
                {filteredDebtCustomers.map(({ customer, dueDate, lastPurchase, latestCare }) => (
                  <div
                    key={customer.id}
                    className="erp-debt-row p-3 sm:p-5 hover:bg-orange-50/20 transition-all group cursor-pointer"
                    onClick={() => navigate(`/app/customers/${customer.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-orange-600 group-hover:text-white transition-all duration-500 shrink-0">
                          <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-semibold text-slate-900 truncate">{customer.name}</h4>
                            <span className="text-[11px] font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">Nợ</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">{customer.phone}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>Hạn: {new Date(dueDate).toLocaleDateString('vi-VN')}</span>
                            <span>Mua: {lastPurchase ? new Date(lastPurchase).toLocaleDateString('vi-VN') : 'Chưa có'}</span>
                            <span>CSKH: {latestCare?.status === 'paid' ? 'Đã trả' : latestCare?.status === 'promised' ? 'Hứa trả' : latestCare?.status === 'sent' ? 'Đã nhắc' : 'Chưa nhắc'}</span>
                          </div>
                          {!!customer.tags?.length && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {customer.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-500">Dư nợ</p>
                        <div className="text-base sm:text-xl font-semibold text-orange-600 tabular-nums">{formatCurrency(customer.totalDebt)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          openZaloReminder(customer.id);
                        }}
                        variant="outline"
                        className="h-8 rounded-lg px-2.5 text-xs font-medium border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircleMore className="h-3.5 w-3.5 mr-1" /> Nhắc
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagEditorCustomerId(customer.id);
                          setTagInput((customer.tags || []).join(', '));
                        }}
                        variant="outline"
                        className="h-8 rounded-lg px-2.5 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Tags className="h-3.5 w-3.5 mr-1" /> Tag
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDebtModal('decrease', customer.id);
                        }}
                        className="h-8 rounded-lg px-3 text-xs font-medium bg-sky-600 hover:bg-sky-700"
                      >
                        Thu nợ
                      </Button>
                      <div className="ml-auto h-8 w-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-all">
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

        <div className="bg-white rounded-lg shadow-xl shadow-slate-900/10 border border-white overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-50">
            <h3 className="text-section-title">Lịch sử chăm sóc khách (Zalo)</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {loadingCareLogs && <div className="p-6 text-sm text-slate-500">Đang tải lịch sử chăm sóc...</div>}
            {!loadingCareLogs && careLogs.slice(0, 20).map((log) => {
              const customer = customers.find((c) => c.id === log.customerId);
              return (
                <div key={log.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{customer?.name || log.customerId}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {new Date(log.createdAt).toLocaleString('vi-VN')} · {log.createdByName || log.createdBy} · {log.templateType}
                    </p>
                    <p className="text-xs text-slate-600 line-clamp-2">{log.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={log.status}
                      onChange={(e) => updateCareStatus(log.id, e.target.value as CustomerCareLog['status'])}
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="not_sent">Chưa nhắc</option>
                      <option value="sent">Đã nhắc</option>
                      <option value="promised">Hứa trả</option>
                      <option value="paid">Đã trả</option>
                    </select>
                    <span className={`text-xs px-2 py-1 rounded-md ${
                      log.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                      log.status === 'promised' ? 'bg-sky-50 text-sky-700' :
                      log.status === 'sent' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {log.responded ? 'Đã phản hồi' : 'Chưa phản hồi'}
                    </span>
                  </div>
                </div>
              );
            })}
            {!loadingCareLogs && careLogs.length === 0 && (
              <div className="p-6 text-sm text-slate-500">Chưa có lịch sử nhắc nợ/Zalo.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
