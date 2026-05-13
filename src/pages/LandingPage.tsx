import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Boxes, Zap, BarChart3, ChevronRight, Smartphone, Package, Wallet, Users } from 'lucide-react';
import { motion } from 'motion/react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden selection:bg-sky-100 selection:text-sky-900">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-sky-900/20">
              <Boxes className="h-6 w-6" />
            </div>
            <span className="font-black text-xl text-slate-900 tracking-tight">TDPOS</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">Tính năng</a>
            <a href="#pricing" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">Bảng giá</a>
            <a href="#customers" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">Ngành hàng</a>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="font-semibold text-sm text-slate-600 hover:bg-slate-50 px-6 h-11 rounded-lg"
            >
              Đăng nhập
            </Button>
            <Button
              onClick={() => navigate('/register')}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-7 h-11 rounded-lg shadow-xl shadow-slate-900/20"
            >
              Dùng thử miễn phí
            </Button>
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900 min-h-[78vh] flex items-center">
            <img
              src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1920&q=80"
              alt="Nhân viên vận hành quầy POS trong cửa hàng bán lẻ"
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-slate-900/30" />
            <div className="relative z-10 w-full p-8 md:p-14 lg:p-16 space-y-7">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500/20 px-4 py-2 text-sky-100 border border-sky-400/30"
              >
                <div className="w-2 h-2 rounded-full bg-sky-300 animate-pulse"></div>
                <span className="text-xs font-semibold tracking-normal">Nền tảng POS cho cửa hàng vừa và nhỏ</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="max-w-3xl text-4xl md:text-6xl font-black text-white leading-tight tracking-tight"
              >
                Bán hàng nhanh tại quầy, quản lý kho và công nợ trên một hệ thống POS duy nhất.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="max-w-2xl text-base md:text-lg text-slate-100/90 font-medium leading-relaxed"
              >
                TDPOS giúp cửa hàng vận hành ổn định mỗi ngày: lên đơn, in hóa đơn, theo dõi tồn kho, quản lý khách hàng và kiểm soát dòng tiền theo thời gian thực.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-start gap-4 pt-3"
              >
                <Button
                  onClick={() => navigate('/register')}
                  className="h-12 px-8 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm shadow-2xl shadow-sky-900/40 group"
                >
                  Dùng thử 14 ngày
                  <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                  className="h-12 px-8 rounded-lg border-white/40 bg-white/10 text-white hover:bg-white/20 font-semibold text-sm"
                >
                  Đăng nhập hệ thống
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-16 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              { icon: Zap, title: 'Bán nhanh tại quầy', desc: 'Lên đơn mượt, thao tác ít chạm, xử lý tốt giờ cao điểm.', color: 'text-amber-500', bg: 'bg-amber-50' },
              { icon: Package, title: 'Theo dõi tồn kho', desc: 'Kiểm soát nhập - xuất - tồn, cảnh báo mức tồn thấp theo mặt hàng.', color: 'text-sky-500', bg: 'bg-sky-50' },
              { icon: Wallet, title: 'Quản lý công nợ', desc: 'Ghi nhận công nợ, thu nợ từng khách, theo dõi lịch sử thanh toán rõ ràng.', color: 'text-orange-500', bg: 'bg-orange-50' },
              { icon: Users, title: 'Chăm sóc khách hàng', desc: 'Lưu hồ sơ, lịch sử mua, phân loại khách hàng để bán hiệu quả hơn.', color: 'text-blue-500', bg: 'bg-blue-50' }
            ].map((feat, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100 hover:shadow-lg transition-all">
                <div className={`h-12 w-12 ${feat.bg} ${feat.color} rounded-lg flex items-center justify-center mb-5`}>
                  <feat.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-2">{feat.title}</h3>
                <p className="text-slate-500 text-sm leading-6">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Gói năm cho cửa hàng</h3>
            <p className="mt-2 text-slate-500">Dùng thử miễn phí 14 ngày. Sau đó cần kích hoạt gói để tiếp tục thao tác trong hệ thống.</p>
            <div className="mt-6 flex items-end gap-2">
              <span className="text-4xl font-black text-sky-700">150.000đ</span>
              <span className="text-slate-500 mb-1">/ tháng</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">Thanh toán theo chu kỳ năm.</p>
            <Button onClick={() => navigate('/register')} className="mt-7 h-11 px-7 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm">
              Đăng ký dùng thử
            </Button>
          </div>

          <div id="customers" className="rounded-lg border border-slate-200 bg-slate-900 p-8 text-white shadow-sm">
            <h3 className="text-2xl font-bold tracking-tight">Phù hợp cho nhiều mô hình POS</h3>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                { icon: Smartphone, name: 'Cửa hàng bán lẻ', note: 'Tạp hóa, mẹ & bé, mỹ phẩm' },
                { icon: BarChart3, name: 'Shop online + offline', note: 'Quản lý đơn và tồn kho tập trung' },
                { icon: Package, name: 'Đại lý phân phối', note: 'Theo dõi xuất kho và công nợ đại lý' },
                { icon: Boxes, name: 'Chuỗi cửa hàng nhỏ', note: 'Đồng bộ dữ liệu nhiều điểm bán' }
              ].map((item, index) => (
                <div key={index} className="rounded-lg bg-white/10 border border-white/15 p-4">
                  <item.icon className="h-5 w-5 text-sky-300 mb-2" />
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-white/70 mt-1">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="py-20 px-6 border-t border-slate-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <Boxes className="h-6 w-6" />
            </div>
            <span className="font-black text-xl text-slate-900 tracking-tight">TDPOS</span>
          </div>
          <div className="flex items-center gap-10">
            <span className="text-xs font-semibold text-slate-400">© 2026 TDPOS</span>
            <div className="flex gap-6">
              <a href="#" className="text-xs font-semibold text-slate-500 hover:text-slate-900">Hỗ trợ</a>
              <a href="#" className="text-xs font-semibold text-slate-500 hover:text-slate-900">Bảo mật</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
