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
  ChevronRight,
  MoreVertical,
  Plus,
  Receipt,
  UserCheck,
  Star,
  Download,
  Share2,
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
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Sửa hồ sơ khách hàng</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-red-500">
                <MoreVertical className="h-5 w-5" />
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
      <div className="p-6 md:p-8 bg-white/80 backdrop-blur-xl border-b sticky top-0 z-40 flex flex-col md:flex-row gap-6 items-center justify-between shadow-sm">
        <div className="flex items-center gap-6 w-full md:w-auto">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/app/customers')} 
            className="h-12 w-12 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-5">
            <div className="relative">
                <div className="h-16 w-16 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-900/20 transform rotate-3 font-black text-2xl uppercase italic">
                {customer.name.charAt(0)}
                </div>
                {customer.type === 'loyal' && (
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-lg bg-amber-400 text-white flex items-center justify-center shadow-lg border-2 border-white">
                        <Star className="h-3 w-3 fill-white" />
                    </div>
                )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-slate-900 font-display tracking-tight uppercase italic">{customer.name}</h1>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${
                    customer.type === 'loyal' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
                }`}>
                    {customer.type === 'loyal' ? 'VIP MEMBER' : 'RETAIL'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ID: #{customer.id.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            onClick={openEditModal}
            variant="outline"
            className="flex-1 md:flex-none h-12 px-6 rounded-lg font-black text-[10px] uppercase tracking-widest bg-white border-slate-200 text-slate-600 hover:bg-slate-50 gap-2"
          >
            <Edit2 className="h-4 w-4" /> Sửa hồ sơ
          </Button>
          <Button className="flex-1 md:flex-none h-12 px-8 rounded-lg bg-slate-900 hover:bg-slate-800 shadow-lg font-black text-[10px] uppercase tracking-widest text-white gap-2" onClick={() => navigate('/app/pos')}>
            <Plus className="h-4 w-4" /> Bán hàng
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-5 rounded-lg shadow-sm border border-slate-100 flex items-center gap-4 group hover:border-indigo-100 hover:shadow-indigo-900/5 transition-all">
                        <div className={`h-12 w-12 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform`}>
                            <stat.icon className="h-6 w-6" />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-500">{stat.label}</p>
                            <p className="text-lg md:text-xl font-semibold text-slate-900 font-display tabular-nums break-all max-w-[240px]">{stat.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Profile & Actions */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-8 space-y-8">
                            <div className="space-y-6">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <span className="h-1 w-6 bg-indigo-600 rounded-full" />
                                    Thông tin liên hệ
                                </h3>
                                
                                <div className="space-y-6">
                                    <div className="flex items-start gap-4">
                                        <div className="h-10 w-10 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                                            <Phone className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Số điện thoại</p>
                                            <p className="text-base font-black text-slate-900">{customer.phone}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="h-10 w-10 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                                            <MapPin className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Địa chỉ giao hàng</p>
                                            <p className="text-sm font-bold text-slate-900 leading-relaxed">{customer.address || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="h-10 w-10 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                                            <UserCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Nhân sự tạo khách</p>
                                            <p className="text-sm font-semibold text-slate-900">{customer.createdByName || customer.createdBy || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100 space-y-4">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <span className="h-1 w-6 bg-orange-600 rounded-full" />
                                    Tình trạng công nợ
                                </h3>
                                <div className="p-5 rounded-lg bg-slate-50 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nợ hiện tại</span>
                                        <span className={`text-sm font-black ${customer.totalDebt > 0 ? 'text-orange-600' : 'text-sky-600'}`}>
                                            {formatCurrency(customer.totalDebt)}
                                        </span>
                                    </div>
                                    <Button
                                        onClick={() => navigate(`/app/debt?customerId=${customer.id}`)}
                                        className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20"
                                    >
                                        Thanh toán nợ
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-lg p-8 text-white relative overflow-hidden group">
                        <div className="relative z-10 space-y-6">
                            <div className="space-y-2">
                                <h4 className="text-xl font-black font-display tracking-tight uppercase italic">Báo cáo khách hàng</h4>
                                <p className="text-white/40 text-[10px] font-medium leading-relaxed uppercase tracking-widest">Kết xuất dữ liệu giao dịch</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="ghost" className="h-12 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white hover:text-slate-900 font-black text-[9px] uppercase tracking-widest gap-2">
                                    <Download className="h-4 w-4" /> PDF
                                </Button>
                                <Button variant="ghost" className="h-12 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white hover:text-slate-900 font-black text-[9px] uppercase tracking-widest gap-2">
                                    <Share2 className="h-4 w-4" /> Chia sẻ
                                </Button>
                            </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-indigo-500/10 blur-[50px]" />
                    </div>
                </div>

                {/* Right: History */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-100 flex flex-col min-h-[600px] overflow-hidden">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                             <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Receipt className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic leading-none">Lịch sử giao dịch</h3>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Toàn bộ hóa đơn mua hàng, ghi nợ & thanh toán công nợ</p>
                                </div>
                             </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                            <div className="divide-y divide-slate-50">
                                {customerTimeline.map((event, idx) => (
                                    <motion.div 
                                        key={event.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="p-6 sm:p-8 hover:bg-indigo-50/30 transition-all group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-l-4 border-transparent hover:border-indigo-600"
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="h-12 w-12 rounded-lg bg-white shadow-sm ring-1 ring-slate-100 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors">
                                                {event.kind === 'invoice' ? (
                                                  <ShoppingCart className="h-6 w-6" />
                                                ) : (
                                                  <Wallet className="h-6 w-6" />
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-3">
                                                    <p className="text-lg font-black text-slate-900 tracking-tight">
                                                      {event.kind === 'invoice' ? `#${event.invoice.id}` : 'Thanh toán công nợ'}
                                                    </p>
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${
                                                        event.kind === 'invoice'
                                                          ? (event.invoice.status === 'completed' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700')
                                                          : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {event.kind === 'invoice'
                                                          ? (event.invoice.status === 'completed' ? 'PAID' : 'DEBT')
                                                          : 'DEBT PAYMENT'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(event.createdAt).toLocaleString('vi-VN')}
                                                </div>
                                                {event.kind === 'payment' && event.payment.note && (
                                                  <p className="text-xs text-slate-500">{event.payment.note}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between w-full sm:w-auto gap-8 border-t sm:border-t-0 pt-4 sm:pt-0">
                                            <div className="text-left sm:text-right">
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">
                                                  {event.kind === 'invoice' ? 'Thành tiền' : 'Đã thu nợ'}
                                                </p>
                                                <p className={`text-2xl font-black font-display tracking-tight tabular-nums ${
                                                  event.kind === 'invoice' ? 'text-indigo-700' : 'text-emerald-700'
                                                }`}>
                                                  {event.kind === 'invoice'
                                                    ? formatCurrency(event.invoice.finalAmount)
                                                    : `-${formatCurrency(event.payment.amount)}`}
                                                </p>
                                            </div>
                                            {event.kind === 'invoice' ? (
                                              <Button variant="ghost" className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-slate-50 text-slate-300 hover:text-indigo-600 transition-all">
                                                  <ChevronRight className="h-5 w-5" />
                                              </Button>
                                            ) : (
                                              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                <History className="h-5 w-5" />
                                              </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}

                                {customerTimeline.length === 0 && (
                                    <div className="p-20 text-center space-y-6">
                                        <div className="inline-flex h-24 w-24 items-center justify-center rounded-lg bg-slate-50 text-slate-100">
                                            <ShoppingCart className="h-12 w-12 opacity-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-slate-300 font-black uppercase tracking-widest text-[9px]">Chưa có giao dịch</p>
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
