import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CheckCircle, Store, Settings, Users, ShieldCheck, ArrowRight, ArrowLeft, Upload, Clock, CreditCard, Package, BarChart3, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const STEPS = [
  { id: 'verify', title: 'Xác minh', icon: ShieldCheck },
  { id: 'profile', title: 'Hồ sơ', icon: Store },
  { id: 'rules', title: 'Quy tắc', icon: Settings },
  { id: 'team', title: 'Đội ngũ', icon: Users },
  { id: 'import', title: 'Dữ liệu', icon: Package },
  { id: 'finish', title: 'Hoàn tất', icon: CheckCircle },
];

export default function TenantSetup() {
  const { activeTenant, updateTenant } = useApp();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  
  const [formData, setFormData] = useState({
    name: activeTenant?.name || '',
    legalName: activeTenant?.legalName || '',
    address: activeTenant?.address || '',
    phone: activeTenant?.phone || '',
    invoicePrefix: activeTenant?.invoicePrefix || '',
    industry: '',
    businessModel: 'retail_store',
    staffSize: '1-5',
    monthlyOrdersEstimate: '0-300',
    salesChannels: ['offline_store'] as string[],
    primaryGoal: 'increase_sales',
    lowStockThreshold: 10,
    allowDebt: true,
    maxDebtAmount: 50000000,
    openTime: '07:00',
    closeTime: '18:00',
  });

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Finalize setup
      updateTenant({
        ...formData,
        status: 'trial',
        settings: {
          lowStockThresholdDefault: formData.lowStockThreshold,
          enabledPaymentMethods: ['cash', 'transfer', 'debt'],
          debtPolicy: {
            allowDebt: formData.allowDebt,
            maxDebtAmount: formData.maxDebtAmount,
            maxDebtDays: 30
          },
          workingHours: {
            open: formData.openTime,
            close: formData.closeTime
          },
          defaultLanguage: 'vi',
          insights: {
            businessModel: formData.businessModel,
            industry: formData.industry,
            staffSize: formData.staffSize,
            monthlyOrdersEstimate: formData.monthlyOrdersEstimate,
            salesChannels: formData.salesChannels,
            primaryGoal: formData.primaryGoal,
          },
        }
      });
      navigate('/app/dashboard');
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    
    // Auto focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const toggleSalesChannel = (channel: string) => {
    setFormData((prev) => {
      const has = prev.salesChannels.includes(channel);
      return {
        ...prev,
        salesChannels: has
          ? prev.salesChannels.filter((item) => item !== channel)
          : [...prev.salesChannels, channel],
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-sky-100 selection:text-sky-900">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-sky-900/20">
            <Store className="h-6 w-6" />
          </div>
          <span className="font-black text-xl text-slate-900 tracking-tighter uppercase italic">TDPOS</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="hidden sm:block text-[10px] font-black text-slate-400 uppercase tracking-widest mr-4">Tiến trình onboarding</span>
            <div className="flex gap-1.5">
                {STEPS.map((step, idx) => (
                    <div 
                        key={step.id} 
                        className={`h-1.5 w-8 rounded-full transition-all duration-500 ${idx <= currentStep ? 'bg-sky-600 w-16' : 'bg-slate-200'}`}
                    />
                ))}
            </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-6 md:p-12">
        <div className="bg-white rounded-lg shadow-2xl shadow-sky-900/5 border border-white overflow-hidden min-h-[700px] flex flex-col">
          
          <div className="flex-1 p-8 md:p-20">
            <AnimatePresence mode="wait">
              {currentStep === 0 && (
                <motion.div 
                  key="step0"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-12 text-center"
                >
                  <div className="flex justify-center">
                    <div className="h-24 w-24 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shadow-inner">
                        <ShieldCheck className="h-12 w-12" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight leading-tight">Xác minh chủ tài khoản 🛡️</h1>
                    <p className="text-slate-500 font-medium text-lg max-w-md mx-auto">Chúng tôi đã gửi mã OTP 6 số đến email của bạn để xác minh quyền sở hữu cửa hàng.</p>
                  </div>

                  <div className="flex justify-center gap-3">
                    {otp.map((digit, i) => (
                      <input 
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        className="w-14 h-20 text-center text-3xl font-black rounded-lg bg-slate-50 border-none shadow-inner focus:ring-4 focus:ring-sky-500/10 transition-all text-slate-900 uppercase" 
                      />
                    ))}
                  </div>

                  <div className="pt-4">
                    <p className="text-sm font-bold text-slate-400">Không nhận được mã? <button className="text-sky-600 hover:underline">Gửi lại sau 59s</button></p>
                  </div>
                </motion.div>
              )}

              {currentStep === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-10"
                >
                  <div className="space-y-2">
                    <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight leading-tight">Hồ sơ cửa hàng 🏠</h1>
                    <p className="text-slate-500 font-medium text-lg">Thông tin này sẽ hiển thị trên các hóa đơn gửi cho khách hàng.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Địa chỉ kinh doanh</label>
                            <Input 
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                                className="h-14 rounded-lg bg-slate-50 border-none font-bold text-lg"
                                placeholder="Số nhà, đường, quận/huyện..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Số điện thoại liên hệ</label>
                            <Input 
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                                className="h-14 rounded-lg bg-slate-50 border-none font-bold text-lg"
                                placeholder="+84 9xx xxx xxx"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Mã tiền tố hóa đơn</label>
                          <Input 
                              value={formData.invoicePrefix}
                              onChange={e => setFormData({...formData, invoicePrefix: e.target.value})}
                              className="h-14 rounded-lg bg-slate-50 border-none font-bold text-lg uppercase"
                              placeholder="VD: LM"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Logo cửa hàng</label>
                          <div className="h-32 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-sky-400 hover:bg-sky-50 transition-all cursor-pointer">
                            <Upload className="h-6 w-6 mb-1" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Tải ảnh lên</span>
                          </div>
                        </div>
                    </div>
                  </div>

                  <div className="mt-10 rounded-lg border border-slate-100 bg-slate-50 p-6 space-y-5">
                    <h3 className="text-section-title">Thông tin insight cửa hàng</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label>Ngành hàng chính</label>
                        <Input
                          value={formData.industry}
                          onChange={e => setFormData({ ...formData, industry: e.target.value })}
                          className="h-11 rounded-lg border-slate-200 bg-white"
                          placeholder="Ví dụ: Tạp hóa, F&B, thời trang..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label>Mô hình kinh doanh</label>
                        <select
                          value={formData.businessModel}
                          onChange={e => setFormData({ ...formData, businessModel: e.target.value })}
                          className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="retail_store">Cửa hàng bán lẻ</option>
                          <option value="fnb">Ăn uống / Cafe</option>
                          <option value="service">Dịch vụ</option>
                          <option value="multi_branch">Chuỗi nhiều chi nhánh</option>
                          <option value="other">Khác</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label>Quy mô nhân sự</label>
                        <select
                          value={formData.staffSize}
                          onChange={e => setFormData({ ...formData, staffSize: e.target.value })}
                          className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="1-5">1-5 người</option>
                          <option value="6-15">6-15 người</option>
                          <option value="16-50">16-50 người</option>
                          <option value="50+">Trên 50 người</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label>Ước lượng đơn/tháng</label>
                        <select
                          value={formData.monthlyOrdersEstimate}
                          onChange={e => setFormData({ ...formData, monthlyOrdersEstimate: e.target.value })}
                          className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="0-300">0 - 300 đơn</option>
                          <option value="301-1000">301 - 1.000 đơn</option>
                          <option value="1001-3000">1.001 - 3.000 đơn</option>
                          <option value="3000+">Trên 3.000 đơn</option>
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label>Kênh bán hàng</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'offline_store', label: 'Tại cửa hàng' },
                            { key: 'facebook', label: 'Facebook' },
                            { key: 'zalo', label: 'Zalo' },
                            { key: 'ecommerce', label: 'Sàn TMĐT' },
                            { key: 'website', label: 'Website' },
                          ].map((channel) => {
                            const active = formData.salesChannels.includes(channel.key);
                            return (
                              <button
                                key={channel.key}
                                type="button"
                                onClick={() => toggleSalesChannel(channel.key)}
                                className={`h-9 rounded-lg border px-3 text-sm transition ${
                                  active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600'
                                }`}
                              >
                                {channel.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label>Mục tiêu chính 3 tháng tới</label>
                        <select
                          value={formData.primaryGoal}
                          onChange={e => setFormData({ ...formData, primaryGoal: e.target.value })}
                          className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="increase_sales">Tăng doanh thu</option>
                          <option value="optimize_inventory">Tối ưu tồn kho</option>
                          <option value="control_debt">Kiểm soát công nợ</option>
                          <option value="improve_operations">Chuẩn hóa vận hành</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div 
                   key="step2"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-10"
                >
                  <div className="space-y-2">
                    <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight leading-tight">Quy tắc vận hành ⚙️</h1>
                    <p className="text-slate-500 font-medium text-lg">Cấu hình các mặc định theo nhu cầu thực tế của cửa hàng.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-8">
                        <div className="p-8 rounded-lg bg-slate-50 border border-slate-100 space-y-6">
                            <h3 className="font-black text-slate-900 uppercase italic tracking-tight">KHO & THANH TOÁN</h3>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngưỡng tồn thấp</label>
                                <Input type="number" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: parseInt(e.target.value)})} className="h-12 rounded-lg border-none bg-white font-black" />
                            </div>
                        </div>
                        <div className="p-8 rounded-lg bg-slate-50 border border-slate-100 space-y-6">
                            <h3 className="font-black text-slate-900 uppercase italic tracking-tight">CHÍNH SÁCH CÔNG NỢ</h3>
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-600">Cho phép bán nợ</span>
                                <input type="checkbox" checked={formData.allowDebt} onChange={e => setFormData({...formData, allowDebt: e.target.checked})} className="h-6 w-6 rounded-lg text-sky-600" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hạn mức nợ tối đa (VND)</label>
                                <Input type="number" value={formData.maxDebtAmount} onChange={e => setFormData({...formData, maxDebtAmount: parseInt(e.target.value)})} className="h-12 rounded-lg border-none bg-white font-black" />
                            </div>
                        </div>
                    </div>
                    <div className="p-10 rounded-lg bg-slate-900 text-white space-y-8 relative overflow-hidden">
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="space-y-4">
                                <Clock className="h-10 w-10 text-sky-400" />
                                <h3 className="text-2xl font-black uppercase italic leading-none">Giờ hoạt động</h3>
                                <p className="text-white/40 text-sm font-medium">Hệ thống sẽ tự động cập nhật trạng thái online theo giờ này.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-10">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Mở cửa</label>
                                    <Input type="time" value={formData.openTime} onChange={e => setFormData({...formData, openTime: e.target.value})} className="bg-white/10 border-white/10 text-white h-12 rounded-lg" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Đóng cửa</label>
                                    <Input type="time" value={formData.closeTime} onChange={e => setFormData({...formData, closeTime: e.target.value})} className="bg-white/10 border-white/10 text-white h-12 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div 
                   key="step3"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-10"
                >
                  <div className="space-y-2 text-center">
                    <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight leading-tight">Đội ngũ vận hành 👥</h1>
                    <p className="text-slate-500 font-medium text-lg">Phân quyền vai trò để nhân viên làm đúng trách nhiệm.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                    {[
                        { label: 'Chủ cửa hàng', desc: 'Toàn quyền điều hành & quản lý dữ liệu', icon: ShieldCheck, color: 'text-sky-600', bg: 'bg-sky-50' },
                        { label: 'Thu ngân', desc: 'Bán hàng tại quầy & in hóa đơn', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Thủ kho', desc: 'Quản lý nhập hàng & kiểm kê tồn kho', icon: Store, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: 'Kế toán', desc: 'Xem báo cáo tài chính & xử lý công nợ', icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
                    ].map((role, i) => (
                        <div key={i} className="p-6 rounded-lg bg-white border border-slate-100 shadow-sm flex items-start gap-5 hover:border-slate-300 transition-all cursor-pointer group">
                            <div className={`h-12 w-12 rounded-lg ${role.bg} ${role.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                                <role.icon className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 uppercase tracking-tight italic leading-tight">{role.label}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{role.desc}</p>
                            </div>
                        </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === 4 && (
                <motion.div 
                    key="step4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-12 text-center"
                >
                    <div className="h-24 w-24 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                        <Package className="h-12 w-12" />
                    </div>
                    <div className="space-y-3">
                        <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight leading-tight">Khởi tạo dữ liệu 📦</h1>
                        <p className="text-slate-500 font-medium text-lg max-w-md mx-auto">Nhập danh sách sản phẩm & khách hàng ban đầu từ tệp Excel / CSV.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                        <div className="p-8 rounded-lg border-2 border-dashed border-slate-200 hover:border-sky-600 hover:bg-sky-50 transition-all cursor-pointer group">
                             <Upload className="h-8 w-8 text-slate-300 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                             <p className="font-black text-sm text-slate-900 uppercase tracking-tight mb-1">Mặt hàng (.xlsx)</p>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tải tệp mẫu</p>
                        </div>
                        <div className="p-8 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-all cursor-pointer group">
                             <Upload className="h-8 w-8 text-slate-300 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                             <p className="font-black text-sm text-slate-900 uppercase tracking-tight mb-1">Khách hàng (.csv)</p>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tải tệp mẫu</p>
                        </div>
                    </div>

                    <button onClick={handleNext} className="text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-[0.2em]">Bỏ qua bước này và nhập thủ công sau</button>
                </motion.div>
              )}

              {currentStep === 5 && (
                <motion.div 
                   key="step5"
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="flex flex-col items-center justify-center text-center space-y-8"
                >
                  <div className="relative">
                    <div className="h-32 w-32 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-2xl shadow-sky-900/40 transform rotate-6 scale-110">
                        <CheckCircle className="h-16 w-16" />
                    </div>
                    <div className="absolute -top-4 -right-4 h-12 w-12 rounded-lg bg-amber-400 text-white flex items-center justify-center shadow-lg transform -rotate-12 animate-pulse">
                        <Zap className="h-6 w-6" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-5xl font-black text-slate-900 font-display tracking-tighter uppercase italic leading-none">CỬA HÀNG ĐÃ SẴN SÀNG!</h2>
                    <p className="text-slate-500 font-medium text-lg max-w-md mx-auto">Mọi thiết lập đã hoàn tất. Workspace TDPOS đã sẵn sàng để đón nhận đơn hàng đầu tiên.</p>
                  </div>

                  <div className="bg-sky-50 p-10 rounded-lg w-full max-w-md space-y-6">
                      <div className="flex justify-between items-center border-b border-sky-100 pb-4">
                        <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Tên hệ thống</span>
                        <span className="font-black text-sky-900 italic uppercase">{formData.name}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-sky-100 pb-4">
                        <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Loại mô hình</span>
                        <span className="font-black text-sky-900 italic uppercase">Bán lẻ / Dịch vụ</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Trạng thái</span>
                        <span className="px-3 py-1 rounded-lg bg-sky-600 text-white font-black text-[10px] uppercase tracking-widest">Verified</span>
                      </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-8 md:p-12 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <Button 
                variant="ghost" 
                onClick={handleBack} 
                className={`h-14 px-8 rounded-lg font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 ${currentStep === 0 ? 'invisible' : ''}`}
            >
              <ArrowLeft className="h-5 w-5 mr-3" /> Quay lại
            </Button>
            <Button 
                onClick={handleNext}
                className="h-16 px-12 rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-2xl shadow-slate-900/20 font-black text-lg uppercase tracking-widest flex items-center group transition-all"
            >
              {currentStep === STEPS.length - 1 ? 'Kích hoạt ngay' : 'Tiếp tục'}
              <ArrowRight className="h-6 w-6 ml-3 group-hover:translate-x-1.5 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
