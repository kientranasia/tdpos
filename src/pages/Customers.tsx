import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, Users, UserPlus, Phone, MapPin, ChevronRight, UserCheck, Star, Wallet } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Customers() {
  const { customers } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <div className="p-4 sm:p-8 bg-white border-b sticky top-0 z-40 flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-center justify-between shadow-sm">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-900/20 transform -rotate-3">
            <Users className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black text-slate-900 font-display tracking-tight uppercase italic">Khách hàng</h1>
            <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] mt-0.5">{customers.length} khách trong hệ thống</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-56 lg:w-72 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
            <Input 
              className="h-9 sm:h-11 rounded-xl border-none bg-slate-100/50 shadow-inner focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-xs sm:text-sm placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
              placeholder="TÌM THEO TÊN, SỐ ĐT..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button className="h-9 sm:h-11 px-4 rounded-xl gap-2 font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20 active:scale-95 transition-all text-white uppercase tracking-widest shrink-0 text-[10px] sm:text-xs">
            <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Thêm mới</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-10 pb-40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {filteredCustomers.map(customer => (
                <div 
                    key={customer.id} 
                    onClick={() => navigate(`/app/customers/${customer.id}`)}
                    className="group bg-white p-5 rounded-3xl shadow-lg shadow-slate-900/5 border border-white hover:border-blue-100 hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-500 cursor-pointer relative overflow-hidden"
                >
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner group-hover:rotate-6 transition-transform duration-500">
                           <Users className="h-6 w-6" />
                        </div>
                        <div className={`px-2.5 py-1 rounded-xl text-[7px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                            customer.type === 'loyal' ? 'bg-emerald-50 text-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-400'
                        }`}>
                           {customer.type === 'loyal' ? <Star className="h-3 w-3 fill-emerald-600" /> : <UserCheck className="h-3 w-3" />}
                           {customer.type === 'loyal' ? 'Thân thiết' : 'Khách lẻ'}
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        <div className="space-y-1">
                            <h3 className="text-lg sm:text-xl font-black text-slate-900 font-display tracking-tight group-hover:text-blue-700 transition-colors uppercase italic">{customer.name}</h3>
                            <p className="text-[7px] sm:text-[8px] font-black text-slate-300 uppercase tracking-widest font-mono">MSKH: #{customer.id.toUpperCase()}</p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                                <div className="h-6 w-6 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                    <Phone className="h-3 w-3" />
                                </div>
                                {customer.phone}
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                                <div className="h-6 w-6 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                    <MapPin className="h-3 w-3" />
                                </div>
                                <span className="truncate">{customer.address}</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Số dư nợ</p>
                                <div className={`text-lg sm:text-xl font-black font-display tabular-nums tracking-tighter leading-none ${customer.totalDebt > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(customer.totalDebt)}
                                </div>
                            </div>
                            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg shadow-blue-900/20 transition-all transform group-hover:translate-x-1">
                                <ChevronRight className="h-4 w-4" />
                            </div>
                        </div>
                    </div>

                    {/* Decorative blobs */}
                    <div className="absolute -right-8 -top-8 h-32 w-32 bg-blue-50 opacity-0 group-hover:opacity-40 rounded-full blur-3xl transition-opacity" />
                    <div className="absolute -left-10 -bottom-10 h-40 w-40 bg-emerald-50 opacity-0 group-hover:opacity-20 rounded-full blur-3xl transition-opacity" />
                </div>
            ))}
            
            {/* Empty State */}
            {filteredCustomers.length === 0 && (
                <div className="col-span-full py-40 text-center space-y-10 animate-pulse">
                     <div className="inline-flex h-40 w-40 items-center justify-center rounded-[64px] bg-slate-50 text-slate-200 shadow-inner">
                        <Users className="h-20 w-20 opacity-5" />
                     </div>
                     <div className="space-y-2">
                        <p className="text-slate-300 font-black uppercase tracking-[0.5em] text-xs leading-relaxed">Danh bạ khách hàng trống</p>
                        <p className="text-[10px] text-slate-200 font-black uppercase tracking-widest leading-relaxed">Vui lòng thêm khách hàng mới để quản lý</p>
                     </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
