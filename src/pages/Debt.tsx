import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, ChevronRight, TrendingUp } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Debt() {
  const { customers } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const debtCustomers = useMemo(() => {
    return customers.filter(c => c.totalDebt > 0);
  }, [customers]);

  const totalDebtAmount = useMemo(() => {
    return debtCustomers.reduce((sum, c) => sum + c.totalDebt, 0);
  }, [debtCustomers]);

  const filteredDebtCustomers = debtCustomers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <div className="p-4 sm:p-8 bg-white border-b sticky top-0 z-40 flex flex-col md:flex-row gap-4 sm:gap-6 items-start md:items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-900/20 transform -rotate-3 shrink-0">
            <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black text-slate-900 font-display tracking-tight uppercase italic">Công nợ</h1>
            <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] mt-0.5">{debtCustomers.length} khách nợ</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative group flex-1 md:w-56 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-orange-600 transition-colors" />
            <Input 
              className="h-9 sm:h-11 rounded-xl border-none bg-slate-100/50 shadow-inner focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-xs sm:text-sm placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
              placeholder="TÌM KHÁCH NỢ..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button className="h-9 sm:h-11 px-4 rounded-xl gap-2 font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all text-white uppercase tracking-widest shrink-0 text-[10px] sm:text-xs">
            <ArrowDownCircle className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Thu nợ</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-10 pb-40 space-y-6 sm:space-y-10">
        
        {/* Debt Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-slate-900 p-5 rounded-3xl shadow-xl space-y-4 relative overflow-hidden group">
                <div className="relative z-10 space-y-2">
                    <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md text-white group-hover:rotate-12 transition-transform duration-500">
                        <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[7px] sm:text-[8px] font-black text-white/40 uppercase tracking-widest">Tổng dư nợ hệ thống</p>
                        <h2 className="text-xl sm:text-2xl font-black text-white font-display tabular-nums tracking-tighter leading-none">{formatCurrency(totalDebtAmount)}</h2>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-lg shadow-slate-900/5 border border-white space-y-4 relative overflow-hidden group">
                 <div className="relative z-10 space-y-2">
                    <div className="h-10 w-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner group-hover:scale-110 transition-transform">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Khoản nợ quá hạn</p>
                        <h2 className="text-xl sm:text-2xl font-black text-orange-600 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(totalDebtAmount * 0.4)}</h2>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-lg shadow-slate-900/5 border border-white space-y-3 flex flex-col justify-center">
                 <div className="space-y-2 text-center">
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hành động nhanh</div>
                    <div className="flex gap-2">
                        <button className="flex-1 h-14 rounded-2xl bg-slate-50 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-1 group border border-transparent hover:border-emerald-100">
                            <ArrowDownCircle className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                            <span className="text-[6px] font-black uppercase text-slate-500">Giảm nợ</span>
                        </button>
                        <button className="flex-1 h-14 rounded-2xl bg-slate-50 hover:bg-orange-50 transition-all flex flex-col items-center justify-center gap-1 group border border-transparent hover:border-orange-100">
                            <ArrowUpCircle className="h-4 w-4 text-orange-600 group-hover:scale-110 transition-transform" />
                            <span className="text-[6px] font-black uppercase text-slate-500">Tăng nợ</span>
                        </button>
                    </div>
                 </div>
            </div>
        </div>

        {/* Debt List */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/10 border border-white overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-50 flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">Khách hàng nợ</h3>
                    <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest">Sắp xếp theo số dư nợ cao nhất</p>
                </div>
            </div>

            <div className="divide-y divide-slate-50">
                {filteredDebtCustomers.map(customer => (
                    <div key={customer.id} className="p-4 sm:p-6 hover:bg-orange-50/20 transition-all group flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 cursor-pointer" onClick={() => navigate(`/app/customers/${customer.id}`)}>
                        <div className="flex items-center gap-4 sm:gap-6">
                             <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-orange-600 group-hover:text-white transition-all duration-500">
                                 <Wallet className="h-6 w-6 sm:h-7 sm:w-7" />
                             </div>
                             <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <h4 className="text-lg sm:text-xl font-black text-slate-900 font-display tracking-tight uppercase italic">{customer.name}</h4>
                                    <span className="text-[6px] sm:text-[8px] font-black bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg uppercase tracking-widest">Nợ</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-slate-400 font-bold text-[10px]">
                                    <span className="font-mono">{customer.phone}</span>
                                </div>
                             </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                             <div className="text-right space-y-1">
                                <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Dư nợ hiện tại</p>
                                <div className="text-xl sm:text-2xl font-black text-orange-600 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(customer.totalDebt)}</div>
                             </div>
                             <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-all transform group-hover:translate-x-1">
                                <ChevronRight className="h-4 w-4" />
                             </div>
                        </div>
                    </div>
                ))}

                {filteredDebtCustomers.length === 0 && (
                    <div className="p-40 text-center space-y-10 animate-pulse">
                         <div className="inline-flex h-40 w-40 items-center justify-center rounded-[64px] bg-slate-50 text-slate-100 shadow-inner">
                            <CheckCircle className="h-20 w-20 opacity-5" />
                         </div>
                         <div className="space-y-2">
                            <p className="text-slate-300 font-black uppercase tracking-[0.5em] text-xs">Phòng công nợ trống</p>
                            <p className="text-[10px] text-slate-200 font-black uppercase tracking-widest">Tất cả khách hàng đã thanh toán đầy đủ</p>
                         </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
