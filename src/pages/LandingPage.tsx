import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Store, ShieldCheck, Zap, BarChart3, Users, ChevronRight, Leaf } from 'lucide-react';
import { motion } from 'motion/react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden selection:bg-emerald-100 selection:text-emerald-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/20 transform -rotate-3">
                <Store className="h-6 w-6" />
             </div>
             <span className="font-black text-xl text-slate-900 tracking-tighter uppercase italic">TDPOS</span>
          </div>
          
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-sm font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">Tính năng</a>
            <a href="#pricing" className="text-sm font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">Bảng giá</a>
            <a href="#about" className="text-sm font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">Về chúng tôi</a>
          </div>

          <div className="flex items-center gap-4">
            <Button 
                variant="ghost" 
                onClick={() => navigate('/login')}
                className="font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-50 px-6 h-12 rounded-xl"
            >
              Đăng nhập
            </Button>
            <Button 
                onClick={() => navigate('/login')}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest px-8 h-12 rounded-xl shadow-xl shadow-slate-900/20"
            >
              Dùng thử miễn phí
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center space-y-10">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full text-emerald-700骁"
            >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Giải pháp số 1 cho vật tư nông nghiệp</span>
            </motion.div>

            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-6xl md:text-8xl font-black text-slate-900 font-display tracking-tight leading-[0.9] uppercase italic"
            >
                Quản lý kho <br /> & Bán hàng <br /> <span className="text-emerald-600">tốc độ cao.</span>
            </motion.h1>

            <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="max-w-2xl mx-auto text-xl text-slate-500 font-medium leading-relaxed"
            >
                Hệ thống POS chuyên biệt cho các cửa hàng vật tư, phân bón, thuốc bảo vệ thực vật. Tự động hóa công nợ, kiểm kho chính xác và báo cáo tức thì.
            </motion.p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-10"
            >
                <Button 
                   onClick={() => navigate('/login')}
                   className="w-full sm:w-auto h-16 px-12 rounded-[24px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg uppercase tracking-widest shadow-2xl shadow-emerald-900/40 group transition-all"
                >
                    Bắt đầu ngay
                    <ChevronRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </Button>
                <p className="text-sm font-bold text-slate-400">Không cần thẻ tín dụng. <br className="hidden sm:block" /> Dùng thử 14 ngày không giới hạn.</p>
            </motion.div>
        </div>
      </section>

      {/* Feature Cards */}
      <section id="features" className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    {
                        icon: Zap,
                        title: "Bán hàng POS",
                        desc: "Giao diện tối ưu cho máy tính bảng, điện thoại. Bán hàng xong chỉ trong 10 giây.",
                        color: "text-amber-500",
                        bg: "bg-amber-50"
                    },
                    {
                        icon: BarChart3,
                        title: "Quản lý công nợ",
                        desc: "Theo dõi dư nợ khách hàng chi tiết. Tự động nhắc nợ khi đến hạn hoặc vượt hạn mức.",
                        color: "text-blue-500",
                        bg: "bg-blue-50"
                    },
                    {
                        icon: ShieldCheck,
                        title: "Báo cáo thông minh",
                        desc: "Xem doanh thu, lợi nhuận, hàng tồn kho mọi lúc mọi nơi trên thiết bị di động.",
                        color: "text-emerald-500",
                        bg: "bg-emerald-50"
                    }
                ].map((feat, i) => (
                    <div key={i} className="bg-white p-10 rounded-[40px] shadow-sm border border-white hover:shadow-xl transition-all group">
                        <div className={`h-16 w-16 ${feat.bg} ${feat.color} rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                            <feat.icon className="h-8 w-8" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight mb-4">{feat.title}</h3>
                        <p className="text-slate-500 font-medium leading-relaxed">{feat.desc}</p>
                    </div>
                ))}
             </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-slate-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                    <Store className="h-6 w-6" />
                </div>
                <span className="font-black text-xl text-slate-900 tracking-tighter uppercase italic">TDPOS</span>
            </div>
            <div className="flex items-center gap-10">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">© 2026 TDPOS - TRANDAO Investment</span>
                <div className="flex gap-6">
                    <a href="#" className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">Hỗ trợ</a>
                    <a href="#" className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">Bảo mật</a>
                </div>
            </div>
        </div>
      </footer>
    </div>
  );
}
