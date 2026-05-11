import { useApp } from '../context/AppContext';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, ShoppingCart, Wallet, Package, AlertCircle, ArrowUpRight, ArrowDownRight, Printer, Plus, ChevronRight, Activity, CheckCircle, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const salesData = [
  { name: 'Thứ 2', sales: 12000000 },
  { name: 'Thứ 3', sales: 15000000 },
  { name: 'Thứ 4', sales: 8000000 },
  { name: 'Thứ 5', sales: 18000000 },
  { name: 'Thứ 6', sales: 22000000 },
  { name: 'Thứ 7', sales: 25000000 },
  { name: 'Chủ nhật', sales: 21000000 },
];

export default function Dashboard() {
  const { invoices, products, customers, activeTenant } = useApp();
  const navigate = useNavigate();

  const todayRevenue = invoices
    .filter(inv => new Date(inv.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, inv) => sum + inv.finalAmount, 0);

  const totalDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0);
  const lowStockProducts = products.filter(p => p.stock <= p.lowStockThreshold);

  const stats = [
    { 
        title: 'Doanh thu hôm nay', 
        val: formatCurrency(todayRevenue), 
        icon: TrendingUp, 
        color: 'text-emerald-600', 
        bg: 'bg-emerald-50', 
        trend: '+12.5%', 
        trendUp: true,
        desc: 'Tăng so với hôm qua'
    },
    { 
        title: 'Công nợ cần thu', 
        val: formatCurrency(totalDebt), 
        icon: Wallet, 
        color: 'text-orange-600', 
        bg: 'bg-orange-50', 
        trend: '+4.2M', 
        trendUp: false,
        desc: 'Từ 15 khách hàng'
    },
    { 
        title: 'Đơn hàng (Tháng)', 
        val: invoices.length, 
        icon: ShoppingCart, 
        color: 'text-blue-600', 
        bg: 'bg-blue-50', 
        trend: '92%', 
        trendUp: true,
        desc: 'Đã hoàn tất'
    },
    { 
        title: 'Sản phẩm hết hàng', 
        val: lowStockProducts.length, 
        icon: Package, 
        color: 'text-red-600', 
        bg: 'bg-red-50', 
        trend: 'Cảnh báo', 
        trendUp: false,
        desc: 'Cần nhập kho gấp'
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-10 animate-in fade-in duration-700 pb-24 md:pb-12 max-w-[1600px] mx-auto text-slate-900">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1 text-center md:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-display uppercase italic text-gray-500/50">Admin</h2>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display uppercase italic">Bảng điều khiển</h1>
          <p className="text-slate-400 font-bold text-[8px] sm:text-[9px] uppercase tracking-[0.2em] flex items-center justify-center md:justify-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            Hệ thống: {activeTenant?.name}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button variant="outline" className="flex-1 md:flex-none h-10 px-4 rounded-xl font-bold text-[9px] uppercase tracking-widest bg-white border-slate-100 shadow-sm transition-all hover:bg-slate-50">
            Báo cáo <Printer className="ml-2 h-3.5 w-3.5" />
          </Button>
          <Button 
            className="flex-1 md:flex-none h-10 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 font-bold text-[9px] uppercase tracking-widest active:scale-95 transition-all text-white"
            onClick={() => navigate('/app/pos')}
          >
            Lên đơn <Plus className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="group p-5 sm:p-6 rounded-3xl bg-white border border-white shadow-lg shadow-slate-900/5 hover:border-emerald-100 transition-all duration-500 relative overflow-hidden">
            <div className={`h-10 w-10 sm:h-12 sm:w-12 ${stat.bg} ${stat.color} rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-inner transition-transform group-hover:rotate-12 duration-500`}>
              <stat.icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="space-y-1 relative z-10">
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">{stat.title}</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-display tabular-nums tracking-tighter leading-none">{stat.val}</h3>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center justify-between relative z-10">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-tighter ${stat.trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                    {stat.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {stat.trend}
                </div>
                <span className="text-[9px] font-bold text-slate-300 uppercase italic">/ {stat.desc}</span>
            </div>
            <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${stat.bg} opacity-20 blur-3xl`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 p-6 sm:p-8 rounded-3xl bg-white border border-white shadow-xl shadow-slate-900/5 space-y-6 overflow-hidden min-h-[350px] flex flex-col">
          <div className="flex items-center justify-between gap-4 shrink-0">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">Xu hướng doanh thu</h3>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">7 ngày gần nhất (VND)</p>
            </div>
            <div className="h-9 w-9 bg-slate-50 flex items-center justify-center text-slate-300 shrink-0 rounded-lg">
               <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="flex-1 w-full -ml-4 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                   <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}}
                    dy={15}
                />
                <YAxis hide />
                <Tooltip 
                    contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', fontWeight: 900}}
                    itemStyle={{color: '#059669'}}
                />
                <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] bg-slate-900 text-white shadow-2xl space-y-8 lg:space-y-10 relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between relative z-10 gap-3">
                <div className="space-y-1 overflow-hidden">
                    <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight truncate">Cảnh báo tồn kho</h3>
                    <p className="text-emerald-400 font-black text-[9px] sm:text-[10px] uppercase tracking-widest truncate">{lowStockProducts.length} sản phẩm sắp hết</p>
                </div>
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md shrink-0">
                    <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
            </div>

            <div className="space-y-3 sm:space-y-4 relative z-10 flex-1 overflow-y-auto max-h-[400px] pr-2">
                {lowStockProducts.slice(0, 5).map(product => (
                    <div key={product.id} className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center justify-between group">
                        <div className="space-y-0.5 overflow-hidden pr-2">
                            <p className="font-black text-sm tracking-tight truncate">{product.name}</p>
                            <p className="text-[8px] sm:text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">{product.sku}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-orange-400 font-black text-base sm:text-lg leading-none">{product.stock}</div>
                            <div className="text-[7px] sm:text-[8px] font-bold text-white/20 uppercase mt-0.5">{product.unit}</div>
                        </div>
                    </div>
                ))}
                {lowStockProducts.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-white/10 rounded-3xl p-8 min-h-[200px]">
                        <CheckCircle className="h-8 w-8 text-emerald-500 opacity-20" />
                        <p className="text-[9px] sm:text-[10px] font-black text-white/20 uppercase tracking-widest">Kho hàng an toàn</p>
                    </div>
                )}
            </div>

            <Button variant="ghost" className="w-full h-12 rounded-2xl border border-white/10 text-white/60 font-black text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-white/5 hover:text-white relative z-10 shrink-0 mt-4" onClick={() => navigate('/app/inventory')}>
                Xem kho <ChevronRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500 opacity-10 blur-[100px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
          <div className="p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] bg-white border border-slate-100 shadow-xl shadow-slate-900/5 space-y-8 lg:space-y-10 group overflow-hidden">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight italic">Top Sản phẩm</h3>
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                </div>
                <div className="space-y-5">
                    {products.slice(0, 4).map((product, idx) => (
                        <div key={product.id} className="flex items-center justify-between group/item">
                            <div className="flex items-center gap-4 sm:gap-5 overflow-hidden">
                                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 font-bold group-hover/item:bg-emerald-600 group-hover/item:text-white transition-all shrink-0">
                                    {idx + 1}
                                </div>
                                <div className="space-y-0.5 overflow-hidden">
                                    <p className="font-black text-slate-900 tracking-tight truncate text-sm sm:text-base">{product.name}</p>
                                    <p className="text-[8px] sm:text-[9px] font-bold text-slate-300 uppercase tracking-widest">{product.category}</p>
                                </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                                <p className="font-black text-emerald-700 tabular-nums text-sm sm:text-base">{formatCurrency(product.sellingPrice)}</p>
                                <p className="text-[7px] sm:text-[8px] font-black text-slate-300 uppercase tracking-widest truncate">{Math.floor(Math.random() * 100) + 50} {product.unit}</p>
                            </div>
                        </div>
                    ))}
                </div>
          </div>

          <div className="p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] bg-white border border-slate-100 shadow-xl shadow-slate-900/5 space-y-8 lg:space-y-10 group overflow-hidden">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight italic">Khách hàng tiêu biểu</h3>
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                </div>
                <div className="space-y-5">
                    {customers.slice(0, 4).map((customer) => (
                        <div key={customer.id} className="flex items-center justify-between group/item cursor-pointer" onClick={() => navigate(`/app/customers/${customer.id}`)}>
                            <div className="flex items-center gap-4 sm:gap-5 overflow-hidden">
                                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-black text-[10px] sm:text-xs shadow-inner shrink-0 group-hover/item:rotate-6 transition-transform">
                                    {customer.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div className="space-y-0.5 overflow-hidden">
                                    <p className="font-black text-slate-900 tracking-tight group-hover/item:text-blue-600 transition-colors truncate text-sm sm:text-base">{customer.name}</p>
                                    <p className="text-[8px] sm:text-[9px] font-bold text-slate-300 uppercase tracking-widest text-slate-400">{customer.phone}</p>
                                </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                                <p className="font-black text-slate-900 tabular-nums text-sm sm:text-base">{formatCurrency(Math.floor(Math.random() * 50000000) + 10000000)}</p>
                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Tổng mua</p>
                            </div>
                        </div>
                    ))}
                </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
          <div className="lg:col-span-2 p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] bg-white border border-slate-100 shadow-xl shadow-slate-900/5 space-y-8 lg:space-y-10 group overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight italic">Hóa đơn gần đây</h3>
                    <Button variant="ghost" className="h-10 px-4 rounded-xl text-[9px] sm:text-[10px] uppercase font-black tracking-widest bg-slate-100 transition-all hover:bg-emerald-50 hover:text-emerald-700 self-start sm:self-auto" onClick={() => navigate('/app/invoices')}>
                        Xem tất cả <ChevronRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                </div>
                <div className="space-y-3 sm:space-y-4">
                    {invoices.slice(0, 5).map(inv => (
                        <div key={inv.id} className="p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] hover:bg-emerald-50/50 transition-colors flex items-center justify-between group/inv border border-transparent hover:border-emerald-100/50 cursor-pointer" onClick={() => navigate('/app/invoices')}>
                             <div className="flex items-center gap-4 sm:gap-6 overflow-hidden">
                                 <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/inv:bg-emerald-600 group-hover/inv:text-white transition-all shrink-0">
                                    <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
                                 </div>
                                 <div className="space-y-0.5 overflow-hidden">
                                    <p className="font-black text-slate-900 tracking-tight truncate text-sm sm:text-base">#{inv.id}</p>
                                    <p className="text-[8px] sm:text-[9px] font-bold text-slate-300 uppercase tracking-widest truncate">{new Date(inv.createdAt).toLocaleString('vi-VN')}</p>
                                 </div>
                             </div>
                             <div className="text-right shrink-0 ml-2 space-y-1">
                                <p className="text-base sm:text-xl font-black text-emerald-700 tracking-tighter leading-none">{formatCurrency(inv.finalAmount)}</p>
                                <span className={`inline-block text-[7px] sm:text-[8px] font-black uppercase tracking-widest px-1.5 sm:px-2 py-0.5 rounded-lg ${
                                    inv.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                                }`}>
                                    {inv.status === 'completed' ? 'Đã trả' : 'Dư nợ'}
                                </span>
                             </div>
                        </div>
                    ))}
                </div>
          </div>

          <div className="p-8 sm:p-10 rounded-[32px] sm:rounded-[48px] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-2xl relative overflow-hidden group h-fit flex flex-col justify-center min-h-[350px]">
               <div className="relative z-10 space-y-6 sm:space-y-8">
                    <div className="h-12 w-12 sm:h-16 sm:w-16 bg-white/20 rounded-2xl sm:rounded-3xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-xl group-hover:scale-110 transition-transform">
                        <Activity className="h-6 w-6 sm:h-8 sm:w-8" />
                    </div>
                    <div className="space-y-3 sm:space-y-4">
                         <h4 className="text-xl sm:text-3xl font-black font-display tracking-tight leading-none italic uppercase text-white">Insight AI</h4>
                         <p className="text-emerald-100/70 font-medium text-xs sm:text-base leading-relaxed italic border-l-2 border-emerald-400/30 pl-4 py-1">"Bản tin: Nhu cầu phân bón đang có xu hướng tăng tại khu vực phía Tây."</p>
                    </div>
                    <Button className="w-full h-12 sm:h-14 rounded-2xl bg-white text-emerald-700 font-black text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all shadow-xl shadow-emerald-950/20 active:scale-95">
                        Xem chi tiết
                    </Button>
               </div>
               <div className="absolute top-0 right-0 h-40 w-40 bg-white/5 blur-[80px] -mr-10 -mt-10" />
               <div className="absolute bottom-0 left-0 h-40 w-40 bg-black/10 blur-[80px] -ml-10 -mb-10" />
          </div>
      </div>
    </div>
  );
}
