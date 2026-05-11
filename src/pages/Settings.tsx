import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Store, Settings as SettingsIcon, Clock, CreditCard, ShieldCheck, Upload, Save, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function Settings() {
  const { activeTenant, updateTenant } = useApp();
  const [activeTab, setActiveTab] = useState('profile');
  
  const [formData, setFormData] = useState({
    name: activeTenant?.name || '',
    legalName: activeTenant?.legalName || '',
    address: activeTenant?.address || '',
    phone: activeTenant?.phone || '',
    invoicePrefix: activeTenant?.invoicePrefix || '',
    lowStockThreshold: activeTenant?.settings?.lowStockThresholdDefault || 10,
    allowDebt: activeTenant?.settings?.debtPolicy?.allowDebt ?? true,
    maxDebtAmount: activeTenant?.settings?.debtPolicy?.maxDebtAmount || 50000000,
    openTime: activeTenant?.settings?.workingHours?.open || '07:00',
    closeTime: activeTenant?.settings?.workingHours?.close || '18:00',
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    updateTenant({
      ...formData,
      settings: {
        ...activeTenant?.settings,
        lowStockThresholdDefault: formData.lowStockThreshold,
        debtPolicy: {
          ...activeTenant?.settings?.debtPolicy,
          allowDebt: formData.allowDebt,
          maxDebtAmount: formData.maxDebtAmount,
        },
        workingHours: {
          open: formData.openTime,
          close: formData.closeTime
        }
      }
    });
    setIsSaving(false);
  };

  const tabs = [
    { id: 'profile', label: 'Hồ sơ cửa hàng', icon: Store },
    { id: 'system', label: 'Cấu hình hệ thống', icon: SettingsIcon },
    { id: 'operation', label: 'Vận hành & Ngưỡng', icon: Clock },
    { id: 'security', label: 'Bảo mật & Phân quyền', icon: ShieldCheck },
  ];

  return (
    <div className="p-4 sm:p-10 space-y-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-900 font-display tracking-tight uppercase italic leading-none">Cài đặt hệ thống</h1>
          <p className="text-slate-500 font-medium">Quản lý định danh và các tham số vận hành của {activeTenant?.name}</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="h-14 px-8 rounded-[24px] bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-900/20 font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all"
        >
          {isSaving ? (
            <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          <span>Lưu thay đổi</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Sidebar Tabs */}
        <div className="space-y-2">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between p-5 rounded-[24px] transition-all duration-300 group ${
                        activeTab === tab.id 
                        ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/20' 
                        : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-900 border border-slate-100'
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <tab.icon className={`h-5 w-5 ${activeTab === tab.id ? 'text-emerald-400' : 'group-hover:text-emerald-600'}`} />
                        <span className="font-black text-[10px] uppercase tracking-widest">{tab.label}</span>
                    </div>
                    {activeTab === tab.id && <ChevronRight className="h-4 w-4 text-emerald-400" />}
                </button>
            ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
            <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-900/[0.02] p-8 sm:p-12"
            >
                {activeTab === 'profile' && (
                    <div className="space-y-10">
                        <div className="flex flex-col sm:flex-row gap-10 items-start">
                            <div className="relative group">
                                <div className="h-32 w-32 rounded-[40px] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 group-hover:border-emerald-400 group-hover:bg-emerald-50 transition-all cursor-pointer overflow-hidden">
                                    <Upload className="h-6 w-6 mb-1" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Thay đổi Logo</span>
                                </div>
                            </div>
                            <div className="flex-1 space-y-6 w-full">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tên hiển thị cửa hàng</label>
                                        <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg focus:ring-4 focus:ring-emerald-500/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tên pháp lý (Công ty)</label>
                                        <Input value={formData.legalName} onChange={e => setFormData({...formData, legalName: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg focus:ring-4 focus:ring-emerald-500/10" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Địa chỉ kinh doanh</label>
                                    <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg focus:ring-4 focus:ring-emerald-500/10" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số điện thoại liên hệ</label>
                                    <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg focus:ring-4 focus:ring-emerald-500/10" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                             <div className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 space-y-6">
                                <h3 className="font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
                                    <Receipt className="h-5 w-5 text-emerald-600" />
                                    HÓA ĐƠN & TÀI CHÍNH
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mã tiền tố hóa đơn</label>
                                        <Input value={formData.invoicePrefix} onChange={e => setFormData({...formData, invoicePrefix: e.target.value})} className="h-12 rounded-xl bg-white border-none font-black text-emerald-600 uppercase" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Ngôn ngữ mặc định</label>
                                        <div className="h-12 rounded-xl bg-white flex items-center px-4 font-bold text-slate-700">Tiếng Việt (vi-VN)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'operation' && (
                    <div className="space-y-10">
                         <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-8">
                                <div className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 space-y-6">
                                    <h3 className="font-black text-slate-900 uppercase italic tracking-tight">KHO HÀNG</h3>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Ngưỡng cảnh báo tồn thấp</label>
                                        <Input type="number" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: parseInt(e.target.value)})} className="h-12 rounded-xl border-none bg-white font-black" />
                                    </div>
                                </div>
                                <div className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 space-y-6">
                                    <h3 className="font-black text-slate-900 uppercase italic tracking-tight flex items-center justify-between">
                                        CÔNG NỢ
                                        <div className="h-6 w-12 rounded-full bg-emerald-100 p-1 flex items-center">
                                            <div className="h-4 w-4 rounded-full bg-emerald-600"></div>
                                        </div>
                                    </h3>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Hạn mức nợ mặc định (VND)</label>
                                        <Input type="number" value={formData.maxDebtAmount} onChange={e => setFormData({...formData, maxDebtAmount: parseInt(e.target.value)})} className="h-12 rounded-xl border-none bg-white font-black" />
                                    </div>
                                </div>
                            </div>
                            <div className="p-10 rounded-[40px] bg-slate-900 text-white space-y-8 relative overflow-hidden">
                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div className="space-y-4">
                                        <Clock className="h-10 w-10 text-emerald-400" />
                                        <h3 className="text-2xl font-black uppercase italic leading-none">Giờ hoạt động hệ thống</h3>
                                        <p className="text-white/40 text-xs font-medium">Sau giờ này, các chức năng POS sẽ yêu cầu xác thực thêm từ Quản lý.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-10">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Mở cửa</label>
                                            <Input type="time" value={formData.openTime} onChange={e => setFormData({...formData, openTime: e.target.value})} className="bg-white/10 border-white/10 text-white h-12 rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Đóng cửa</label>
                                            <Input type="time" value={formData.closeTime} onChange={e => setFormData({...formData, closeTime: e.target.value})} className="bg-white/10 border-white/10 text-white h-12 rounded-xl" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                         </div>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                            <ShieldCheck className="h-10 w-10" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-black text-slate-900 uppercase">Phân quyền nâng cao</h3>
                            <p className="text-slate-400 text-sm max-w-xs mx-auto">Vui lòng nâng cấp lên gói Enterprise để sử dụng tính năng quản lý quyền chi tiết cho nhiều chi nhánh.</p>
                        </div>
                        <Button variant="outline" className="h-12 rounded-xl px-8 font-black text-[10px] uppercase tracking-widest mt-4">Nâng cấp ngay</Button>
                    </div>
                )}
            </motion.div>
        </div>
      </div>

      <div className="text-center pt-10 border-t border-slate-100">
         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">© 2024 TDPOS - TRANDAO Investment. All rights reserved.</p>
      </div>
    </div>
  );
}

import { Receipt } from 'lucide-react';
