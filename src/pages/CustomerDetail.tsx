import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../lib/utils';
import { debtLedgerApi } from '../lib/api';
import { DebtLedger } from '../types';
import {
  Users,
  Phone,
  MapPin,
  ArrowLeft,
  Wallet,
  History,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Plus,
  Receipt,
  UserCheck,
  Star,
  Edit2
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, invoices, updateCustomer } = useApp();
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editError, setEditError] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    type: 'retail' as 'retail' | 'loyal',
  });
  const [debtPayments, setDebtPayments] = useState<DebtLedger[]>([]);

  const customer = customers.find(c => c.id === id);
  const customerInvoices = useMemo(() => {
    return invoices
      .filter(inv => inv.customerId === id)
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [invoices, id]);

  const totalSpent = useMemo(() => 
    customerInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0), 
  [customerInvoices]);

  useEffect(() => {
    const loadDebtPayments = async () => {
      if (!id) return;
      try {
        const entries = await debtLedgerApi.list(undefined, id);
        setDebtPayments(entries.filter((entry) => entry.type === 'decrease'));
      } catch {
        setDebtPayments([]);
      }
    };
    loadDebtPayments();
  }, [id]);

  const customerTimeline = useMemo(() => {
    const invoiceEvents = customerInvoices.map((inv) => ({
      id: `invoice-${inv.id}`,
      createdAt: inv.createdAt,
      kind: 'invoice' as const,
      invoice: inv,
    }));

    const paymentEvents = debtPayments.map((entry) => ({
      id: `payment-${entry.id}`,
      createdAt: entry.createdAt,
      kind: 'payment' as const,
      payment: entry,
    }));

    return [...invoiceEvents, ...paymentEvents].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [customerInvoices, debtPayments]);

  const statusMeta = (status: 'completed' | 'partial' | 'unpaid') => {
    if (status === 'completed') return { label: 'Đã thanh toán', tone: 'status-chip-success' };
    if (status === 'partial') return { label: 'Thanh toán một phần', tone: 'status-chip-warning' };
    return { label: 'Chưa thanh toán', tone: 'status-chip-danger' };
  };

  const dayLabel = (value: string) =>
    new Date(value).toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const stats = [
    { 
      label: 'Tổng chi tiêu', 
      val: formatCurrency(totalSpent), 
      icon: TrendingUp, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100/50' 
    },
    { 
      label: 'Số dư nợ', 
      val: formatCurrency(customer?.totalDebt || 0), 
      icon: Wallet, 
      color: 'text-orange-600', 
      bg: 'bg-orange-100/50' 
    },
    { 
      label: 'Tổng đơn hàng', 
      val: customerInvoices.length, 
      icon: ShoppingCart, 
      color: 'text-blue-600', 
      bg: 'bg-blue-100/50' 
    },
  ];

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-20 text-center space-y-6">
        <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
           <Users className="h-12 w-12" />
        </div>
        <p className="font-black text-slate-300 uppercase tracking-widest text-xs">Không tìm thấy khách hàng</p>
        <Button onClick={() => navigate('/app/customers')} className="rounded-lg">Quay lại danh sách</Button>
      </div>
    );
  }

  const openEditModal = () => {
    setProfileForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      type: customer.type,
    });
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    setEditError('');
    if (!profileForm.name.trim() || !profileForm.phone.trim()) {
      setEditError('Vui lòng nhập tên và số điện thoại.');
      return;
    }

    setSavingProfile(true);
    const success = await updateCustomer(customer.id, {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      address: profileForm.address.trim(),
      type: profileForm.type,
    });
    setSavingProfile(false);

    if (!success) {
      setEditError('Không thể cập nhật hồ sơ khách hàng.');
      return;
    }
    setShowEditModal(false);
  };

  return (
    <div className="erp-compact flex flex-col h-full bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-white bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Sửa hồ sơ khách hàng</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-red-500">
                <Plus className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên khách hàng</label>
              <Input
                value={profileForm.name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                className="h-11 rounded-lg bg-slate-50 border-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số điện thoại</label>
              <Input
                value={profileForm.phone}
                onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                className="h-11 rounded-lg bg-slate-50 border-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Địa chỉ</label>
              <Input
                value={profileForm.address}
                onChange={(e) => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                className="h-11 rounded-lg bg-slate-50 border-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phân loại khách hàng</label>
              <select
                value={profileForm.type}
                onChange={(e) => setProfileForm(prev => ({ ...prev, type: e.target.value as 'retail' | 'loyal' }))}
                className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
              >
                <option value="retail">Khách lẻ</option>
                <option value="loyal">Khách thân thiết</option>
              </select>
            </div>
            {editError && <p className="text-sm text-rose-600">{editError}</p>}

            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest"
            >
              {savingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-3 md:p-4 bg-white border-b sticky top-0 z-40 flex flex-col md:flex-row gap-2 md:gap-4 items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/app/customers')} 
            className="h-9 w-9 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
                <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm font-semibold text-base uppercase">
                {customer.name.charAt(0)}
                </div>
                {customer.type === 'loyal' && (
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-amber-400 text-white flex items-center justify-center shadow border border-white">
                        <Star className="h-2.5 w-2.5 fill-white" />
                    </div>
                )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 tracking-tight line-clamp-1">{customer.name}</h1>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg ${
                    customer.type === 'loyal' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
                }`}>
                    {customer.type === 'loyal' ? 'VIP' : 'Khách lẻ'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400">Mã: {customer.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2 w-full md:w-auto">
          <Button
            onClick={openEditModal}
            variant="outline"
            className="h-9 px-3 rounded-lg font-medium text-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 gap-2"
          >
            <Edit2 className="h-4 w-4" /> Sửa hồ sơ
          </Button>
          <Button className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 shadow-sm font-medium text-sm text-white gap-2" onClick={() => navigate('/app/pos')}>
            <Plus className="h-4 w-4" /> Bán hàng
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center gap-3 group hover:border-indigo-100 transition-all">
                        <div className={`h-9 w-9 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center`}>
                            <stat.icon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-500">{stat.label}</p>
                            <p className="text-base font-semibold text-slate-900 tabular-nums break-all max-w-[240px]">{stat.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Profile & Actions */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 space-y-4">
                            <div className="space-y-3">
                                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-normal text-slate-900">
                                    <span className="h-1 w-6 bg-indigo-600 rounded-full" />
                                    Thông tin liên hệ
                                </h3>
                                
                                <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                                            <Phone className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Số điện thoại</p>
                                            <p className="text-xs font-medium text-slate-900">{customer.phone || '-'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                                            <MapPin className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Địa chỉ giao hàng</p>
                                            <p className="text-xs font-medium leading-5 text-slate-900">{customer.address || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                                            <UserCheck className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Nhân sự tạo khách</p>
                                            <p className="text-xs font-medium text-slate-900">{customer.createdByName || customer.createdBy || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-3">
                                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-normal text-slate-900">
                                    <span className="h-1 w-6 bg-orange-600 rounded-full" />
                                    Tình trạng công nợ
                                </h3>
                                <div className="mt-2 rounded-md bg-slate-50 p-2.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-slate-500">Nợ hiện tại</span>
                                        <span className={`text-sm font-semibold ${customer.totalDebt > 0 ? 'text-orange-600' : 'text-sky-600'}`}>
                                            {formatCurrency(customer.totalDebt)}
                                        </span>
                                    </div>
                                    <Button
                                        onClick={() => navigate(`/app/debt?customerId=${customer.id}`)}
                                        className="mt-2 h-8 w-full rounded-md bg-indigo-600 text-xs font-medium text-white shadow-none hover:bg-indigo-700"
                                    >
                                        Thanh toán nợ
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right: History */}
                <div className="lg:col-span-8 space-y-4">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-100 flex flex-col min-h-[360px] overflow-hidden">
                        <div className="p-3 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                             <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                                    <Receipt className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold leading-tight text-slate-900">Lịch sử giao dịch</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Hóa đơn, ghi nợ và thanh toán công nợ</p>
                                </div>
                             </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                            <div className="divide-y divide-slate-50">
                                {customerTimeline.map((event, idx) => {
                                    const prev = customerTimeline[idx - 1];
                                    const showDateGroup = !prev || new Date(prev.createdAt).toDateString() !== new Date(event.createdAt).toDateString();
                                    return (
                                    <div key={event.id}>
                                    {showDateGroup && (
                                      <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                                        {dayLabel(event.createdAt)}
                                      </div>
                                    )}
                                    <motion.div 
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex flex-col items-start justify-between gap-2 border-l-2 border-transparent p-2.5 transition-all group hover:border-indigo-600 hover:bg-indigo-50/30 sm:flex-row sm:items-center"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-300 shadow-sm ring-1 ring-slate-100 transition-colors group-hover:text-indigo-600">
                                                {event.kind === 'invoice' ? (
                                                  <ShoppingCart className="h-4 w-4" />
                                                ) : (
                                                  <Wallet className="h-4 w-4" />
                                                )}
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    {event.kind === 'invoice' ? (
                                                      <button type="button" className="text-xs font-semibold tracking-tight text-sky-700 hover:underline" onClick={() => navigate(`/app/invoices?invoiceId=${encodeURIComponent(event.invoice.id)}`)}>#{event.invoice.id}</button>
                                                    ) : <p className="text-xs font-semibold tracking-tight text-slate-900">Thanh toán công nợ</p>}
                                                    <span className={`status-chip ${
                                                        event.kind === 'invoice'
                                                          ? statusMeta(event.invoice.status).tone
                                                          : 'status-chip-success'
                                                    }`}>
                                                        {event.kind === 'invoice'
                                                          ? statusMeta(event.invoice.status).label
                                                          : 'Đã thu nợ'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(event.createdAt).toLocaleString('vi-VN')}
                                                </div>
                                                {event.kind === 'payment' && event.payment.note && (
                                                  <p className="text-xs text-slate-500">{event.payment.note}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex w-full items-center justify-between gap-3 border-t pt-2 sm:w-auto sm:border-t-0 sm:pt-0">
                                            <div className="text-left sm:text-right">
                                                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                                  {event.kind === 'invoice' ? 'Thành tiền' : 'Đã thu nợ'}
                                                </p>
                                                <p className={`text-sm font-semibold tracking-tight tabular-nums ${
                                                  event.kind === 'invoice' ? 'text-indigo-700' : 'text-emerald-700'
                                                }`}>
                                                  {event.kind === 'invoice'
                                                    ? formatCurrency(event.invoice.finalAmount)
                                                    : `-${formatCurrency(event.payment.amount)}`}
                                                </p>
                                            </div>
                                            {event.kind !== 'invoice' && (
                                              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                <History className="h-4 w-4" />
                                              </div>
                                            )}
                                        </div>
                                    </motion.div>
                                    </div>
                                    );
                                  })}

                                {customerTimeline.length === 0 && (
                                    <div className="space-y-2 p-8 text-center">
                                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-100">
                                            <ShoppingCart className="h-6 w-6 opacity-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-slate-400 text-sm">Chưa có giao dịch</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
