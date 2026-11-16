import { useApp } from '../context/AppContext';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, Users, ShoppingCart, Wallet, Package, AlertCircle, ArrowUpRight, ArrowDownRight, Printer, Plus, ChevronRight, Activity } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const salesData = [
  { name: 'Thứ 2', sales: 12000000 },
  { name: 'Thứ 3', sales: 15000000 },
  { name: 'Thứ 4', sales: 8000000 },
  { name: 'Thứ 5', sales: 18000000 },
  { name: 'Thứ 6', sales: 22000000 },
  { name: 'Thứ 7', sales: 25000000 },
  { name: 'Chủ nhật', sales: 21000000 },
];

export default function Overview() {
  const { invoices, products, customers, activeTenant } = useApp();
  const navigate = useNavigate();

  const todayRevenue = invoices
    .filter(inv => new Date(inv.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, inv) => sum + inv.finalAmount, 0);

  const totalDebt = customers.reduce((sum, c) => sum + Math.max(0, Number(c.totalDebt) || 0), 0);
  const lowStockProducts = products.filter(p => p.stock <= p.lowStockThreshold);

  const stats = [
    { 
        title: 'Doanh thu hôm nay', 
        val: formatCurrency(todayRevenue), 
        icon: TrendingUp, 
        color: 'text-sky-600', 
        bg: 'bg-sky-50', 
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
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-10 animate-in fade-in duration-700 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight font-display uppercase italic text-center sm:text-left">Dashboard Tổng quan</h1>
          <p className="text-slate-400 font-black text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center justify-center sm:justify-start gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse"></span>
            Hệ thống: {activeTenant?.name}
          </p>
        </div>
        <div className="flex items-center justify-center sm:justify-end gap-3">
          <Button variant="outline" className="h-10 sm:h-12 px-4 sm:px-6 rounded-lg font-black text-[9px] sm:text-[10px] uppercase tracking-widest bg-white border-slate-100 shadow-sm">
            Tải báo cáo <Printer className="ml-2 h-4 w-4" />
          </Button>
          <Button 
            className="h-10 sm:h-12 px-6 sm:px-8 rounded-lg bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-900/20 font-black text-[9px] sm:text-[10px] uppercase tracking-widest"
            onClick={() => navigate('/app/pos')}
          >
            Lên đơn mới <Plus className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="group p-6 sm:p-8 rounded-lg sm:rounded-lg bg-white border border-white shadow-xl shadow-slate-900/5 hover:border-sky-100 hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
            <div className={`h-12 w-12 sm:h-16 sm:w-16 ${stat.bg} ${stat.color} rounded-lg sm:rounded-lg flex items-center justify-center mb-4 sm:mb-6 shadow-inner transition-transform group-hover:rotate-12 duration-500`}>
              <stat.icon className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div className="space-y-1 relative z-10">
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.title}</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 font-display tabular-nums tracking-tighter leading-none">{stat.val}</h3>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center justify-between relative z-10">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-tighter ${stat.trendUp ? 'bg-sky-50 text-sky-600' : 'bg-orange-50 text-orange-600'}`}>
                    {stat.trendUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {stat.trend}
                </div>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-300 uppercase italic opacity-60">/ {stat.desc}</span>
            </div>
            <div className={`absolute -right-4 -bottom-4 h-20 w-20 rounded-full ${stat.bg} opacity-10 blur-2xl`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Sales Chart Container */}
        <div className="lg:col-span-2 p-6 sm:p-10 rounded-lg sm:rounded-lg bg-white border border-white shadow-xl shadow-slate-900/5 space-y-6 sm:space-y-10">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">Xu hướng doanh thu</h3>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">7 ngày gần nhất (VND)</p>
            </div>
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-lg bg-slate-50 flex items-center justify-center text-slate-300">
               <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>
          <div className="h-[250px] sm:h-[400px] w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height={320}>
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
                    tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 900}}
                    dy={10}
                />
                <YAxis hide />
                <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontWeight: 900, fontSize: '10px'}}
                    itemStyle={{color: '#059669'}}
                />
                <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Widget */}
        <div className="p-6 sm:p-10 rounded-lg sm:rounded-lg bg-slate-900 text-white shadow-2xl space-y-6 sm:space-y-10 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
                <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight">Cảnh báo tồn kho</h3>
                    <p className="text-sky-400 font-black text-[9px] sm:text-[10px] uppercase tracking-widest">{lowStockProducts.length} sản phẩm sắp hết</p>
                </div>
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-lg bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
                    <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
            </div>

            <div className="space-y-3 sm:space-y-4 relative z-10">
                {lowStockProducts.slice(0, 5).map(product => (
                    <div key={product.id} className="p-4 sm:p-5 rounded-lg sm:rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center justify-between group">
                        <div className="space-y-0.5 sm:space-y-1">
                            <p className="font-black text-xs sm:text-sm tracking-tight truncate max-w-[120px] sm:max-w-none">{product.name}</p>
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.1em]">{product.sku}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-orange-400 font-black text-base sm:text-lg leading-none">{product.stock}</div>
                            <div className="text-[8px] font-bold text-white/20 uppercase mt-1">{product.unit}</div>
                        </div>
                    </div>
                ))}
            </div>

            <Button variant="ghost" className="w-full h-12 sm:h-14 rounded-lg sm:rounded-lg border border-white/10 text-white/60 font-black text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-white/5 hover:text-white relative z-10" onClick={() => navigate('/app/inventory')}>
                Xem chi tiết kho <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Invoices */}
          <div className="lg:col-span-2 p-10 rounded-lg bg-white border border-slate-100 shadow-xl shadow-slate-900/5 space-y-10">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Hóa đơn gần đây</h3>
                    <Button variant="ghost" className="font-black text-[10px] uppercase tracking-widest text-sky-600" onClick={() => navigate('/app/invoices')}>Xem tất cả</Button>
                </div>
                <div className="space-y-4">
                    {invoices.slice(0, 5).map(inv => (
                        <div key={inv.id} className="p-6 rounded-lg hover:bg-sky-50/50 transition-colors flex items-center justify-between group border border-transparent hover:border-sky-100">
                             <div className="flex items-center gap-6">
                                 <div className="h-14 w-14 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-sky-600 group-hover:text-white transition-all">
                                    <ShoppingCart className="h-6 w-6" />
                                 </div>
                                 <div className="space-y-1">
                                    <p className="font-black text-slate-900 tracking-tight">{inv.id}</p>
                                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{new Date(inv.createdAt).toLocaleString('vi-VN')}</p>
                                 </div>
                             </div>
                             <div className="text-right space-y-1">
                                <p className="text-xl font-black text-sky-700 tracking-tighter">{formatCurrency(inv.finalAmount)}</p>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                                    inv.status === 'completed' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'
                                }`}>
                                    {inv.status === 'completed' ? 'Đã thanh toán' : 'Còn nợ'}
                                </span>
                             </div>
                        </div>
                    ))}
                </div>
          </div>

          {/* Quick Actions / Tips */}
          <div className="space-y-8">
              <div className="p-10 rounded-lg bg-gradient-to-br from-sky-600 to-sky-800 text-white shadow-2xl shadow-sky-900/30 relative overflow-hidden group">
                   <div className="relative z-10 space-y-6">
                        <div className="h-16 w-16 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-md">
                            <TrendingUp className="h-8 w-8" />
                        </div>
                        <div className="space-y-2">
                             <h4 className="text-3xl font-black font-display tracking-tight leading-none uppercase italic">Phân tích vận hành</h4>
                             <p className="text-sky-100/60 font-medium text-sm leading-relaxed">Dựa trên dữ liệu 7 ngày qua, bạn nên đẩy mạnh nhập **NPK 20-20-15** vì nhu cầu khu vực đang tăng cao.</p>
                        </div>
                        <Button className="w-full h-14 rounded-lg bg-white text-sky-700 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-sky-900/40">Xem phân tích sâu</Button>
                   </div>
                   <div className="absolute -right-10 -top-10 h-64 w-64 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
              </div>

              <div className="bg-white p-8 rounded-lg border border-slate-100 shadow-xl shadow-slate-900/5 space-y-6">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Thao tác nhanh</h3>
                   <div className="grid grid-cols-2 gap-4">
                       {[
                           { label: 'Khách hàng', icon: Users, path: '/app/customers', color: 'text-blue-600', bg: 'bg-blue-50' },
                           { label: 'Hóa đơn', icon: Printer, path: '/app/invoices', color: 'text-purple-600', bg: 'bg-purple-50' }
                       ].map((link, i) => (
                           <button 
                                key={i}
                                onClick={() => navigate(link.path)}
                                className="p-6 rounded-lg bg-slate-50 hover:bg-white hover:shadow-xl hover:shadow-slate-900/5 ring-1 ring-transparent hover:ring-slate-100 transition-all flex flex-col items-center justify-center text-center gap-3 group"
                           >
                               <div className={`h-12 w-12 rounded-lg ${link.bg} ${link.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                   <link.icon className="h-6 w-6" />
                               </div>
                               <span className="font-black text-[9px] uppercase tracking-widest text-slate-600">{link.label}</span>
                           </button>
                       ))}
                   </div>
              </div>
          </div>
      </div>
    </div>
  );
}

function CheckCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
