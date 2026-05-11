import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Search, 
  ShoppingCart, 
  Filter, 
  Download, 
  ArrowUpDown, 
  ChevronRight, 
  Calendar,
  Users,
  MoreVertical,
  CheckCircle,
  Clock,
  Printer,
  Receipt
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Invoices() {
  const { invoices, customers } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const getCustomerName = (id: string | null | undefined) => {
    if (!id) return 'Khách vãng lai';
    return customers.find(c => c.id === id)?.name || 'Khách vãng lai';
  };

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(inv => 
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        getCustomerName(inv.customerId).toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [invoices, searchTerm, customers]);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden pb-16 md:pb-0">
      <div className="p-4 sm:p-8 bg-white border-b sticky top-0 z-40 flex flex-col md:flex-row gap-4 sm:gap-6 items-start md:items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20 transform -rotate-3 shrink-0">
            <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black text-slate-900 font-display tracking-tight uppercase italic text-left">Lịch sử Bán hàng</h1>
            <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] mt-0.5 text-left">{invoices.length} đơn hàng đã xuất</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative group flex-1 md:w-56 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
            <Input 
              className="h-9 sm:h-11 rounded-xl border-none bg-slate-100/50 shadow-inner focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-xs sm:text-sm placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
              placeholder="MÃ ĐƠN, TÊN KHÁCH..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button className="h-9 sm:h-11 px-4 rounded-xl gap-2 font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all text-white uppercase tracking-widest shrink-0 text-[10px] sm:text-xs" onClick={() => navigate('/app/pos')}>
            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Lên đơn mới</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 pb-40">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-white overflow-hidden">
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 md:hidden">
            {filteredInvoices.map(inv => (
              <div key={inv.id} className="p-4 bg-white space-y-3 relative group" onClick={() => navigate(`/app/customers/${inv?.customerId || ''}`)}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-[7px] font-black text-slate-300 uppercase tracking-widest font-mono leading-none">#{inv.id}</div>
                    <div className="font-black text-slate-900 text-base leading-tight tracking-tight uppercase italic">{getCustomerName(inv.customerId)}</div>
                  </div>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                    inv.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {inv.status === 'completed' ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-[8px] font-black text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg uppercase tracking-widest ring-1 ring-slate-100">
                    <Calendar className="h-3 w-3" />
                    {new Date(inv.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                  <div className="text-[8px] font-black text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg uppercase tracking-widest ring-1 ring-slate-100">
                    {inv.items?.length || 0} SP
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="space-y-1">
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Tổng tiền</div>
                    <div className="text-xl font-black text-emerald-700 font-display tracking-tighter tabular-nums">
                      {formatCurrency(inv.finalAmount)}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Mã đơn hàng</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Thời gian</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Khách hàng</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Trạng thái</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-right">Tổng thanh toán</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="group hover:bg-emerald-50/20 transition-all duration-300">
                    <td className="px-8 py-6">
                      <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/50 uppercase tracking-widest">#{inv.id}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="font-black text-slate-900 tracking-tight">{new Date(inv.createdAt).toLocaleDateString('vi-VN')}</div>
                        <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{new Date(inv.createdAt).toLocaleTimeString('vi-VN')}</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-white group-hover:shadow-lg transition-all border border-transparent group-hover:border-slate-100">
                           <Users className="h-5 w-5" />
                        </div>
                        <div className="font-black text-slate-900 tracking-tight group-hover:text-emerald-700 transition-colors uppercase italic">{getCustomerName(inv.customerId)}</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest ${
                        inv.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                         {inv.status === 'completed' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                         {inv.status === 'completed' ? 'Hoàn tất' : 'Còn nợ'}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="font-black text-emerald-700 font-display text-xl tabular-nums tracking-tighter">{formatCurrency(inv.finalAmount)}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-center items-center gap-2">
                        <Button variant="ghost" className="h-10 w-10 rounded-xl bg-slate-50 text-slate-300 hover:text-emerald-600">
                          <Printer className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" className="h-10 w-10 rounded-xl bg-slate-50 text-slate-300 hover:text-emerald-600" onClick={() => navigate(`/app/customers/${inv.customerId}`)}>
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredInvoices.length === 0 && (
            <div className="p-32 text-center space-y-10 animate-pulse">
                <div className="inline-flex h-40 w-40 items-center justify-center rounded-[64px] bg-slate-50 text-slate-100 shadow-inner">
                    <ShoppingCart className="h-20 w-20 opacity-5" />
                </div>
                <div className="space-y-2">
                    <p className="text-slate-300 font-black uppercase tracking-[0.5em] text-xs">Không tìm thấy đơn hàng</p>
                    <p className="text-[10px] text-slate-200 font-black uppercase tracking-widest">Thử tìm kiếm với từ khóa khác</p>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
