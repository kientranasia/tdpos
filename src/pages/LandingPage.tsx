import { useNavigate } from 'react-router-dom';
import { BarChart3, BookText, ClipboardList, Package, Plus, Receipt, Settings, ShoppingCart, UserRound, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import BrandMark from '../components/BrandMark';

type LauncherItem = {
  label: string;
  description: string;
  path: string;
  icon: typeof ShoppingCart;
  tone: string;
  surface: string;
};

const quickActions: LauncherItem[] = [
  { label: 'Bán hàng', description: 'Tạo bill mới tại quầy', path: '/app/pos', icon: ShoppingCart, tone: 'bg-sky-50 text-sky-700 border-sky-100', surface: 'bg-white' },
  { label: 'Thêm khách hàng', description: 'Tạo hồ sơ khách mới', path: '/app/customers?create=1', icon: Plus, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100', surface: 'bg-white' },
  { label: 'Đơn nhập hàng', description: 'Tạo phiếu nhập kho', path: '/app/purchases', icon: ClipboardList, tone: 'bg-amber-50 text-amber-700 border-amber-100', surface: 'bg-white' },
  { label: 'Thu nợ', description: 'Ghi nhận khách thanh toán', path: '/app/debt', icon: Wallet, tone: 'bg-rose-50 text-rose-700 border-rose-100', surface: 'bg-white' },
];

const modules: LauncherItem[] = [
  { label: 'Chứng từ bán hàng', description: 'Tra cứu, in và thu nợ theo bill', path: '/app/invoices', icon: Receipt, tone: 'bg-violet-100 text-violet-700 border-violet-200', surface: 'bg-violet-100/48' },
  { label: 'Hàng hóa & kho', description: 'Tồn kho, giá bán và điều chỉnh', path: '/app/inventory', icon: Package, tone: 'bg-indigo-100 text-indigo-700 border-indigo-200', surface: 'bg-indigo-100/48' },
  { label: 'Khách hàng', description: 'Quản lý hồ sơ và công nợ khách', path: '/app/customers', icon: Users, tone: 'bg-cyan-100 text-cyan-700 border-cyan-200', surface: 'bg-cyan-100/48' },
  { label: 'Công nợ', description: 'Phải thu và phải trả', path: '/app/debt', icon: Wallet, tone: 'bg-orange-100 text-orange-700 border-orange-200', surface: 'bg-orange-100/48' },
  { label: 'Thu / Chi', description: 'Theo dõi dòng tiền', path: '/app/cashbook', icon: BookText, tone: 'bg-teal-100 text-teal-700 border-teal-200', surface: 'bg-teal-100/48' },
  { label: 'Báo cáo', description: 'Doanh thu, tồn kho, công nợ', path: '/app/reports', icon: BarChart3, tone: 'bg-blue-100 text-blue-700 border-blue-200', surface: 'bg-blue-100/48' },
  { label: 'Cài đặt', description: 'Hộ kinh doanh, sao lưu, license và LAN', path: '/app/settings', icon: Settings, tone: 'bg-slate-200 text-slate-700 border-slate-300', surface: 'bg-slate-100/58' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { currentUser, loading } = useApp();
  const accountLabel = currentUser?.name || currentUser?.email || 'Tài khoản';

  return (
    <div className="erp-compact relative flex min-h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-75"
        style={{ backgroundImage: "linear-gradient(135deg, rgba(248,250,252,0.34), rgba(224,242,254,0.18)), url('/branding/hkdplus-erp-background.png')" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute left-[12%] top-[20%] h-48 w-48 animate-[pulse_8s_ease-in-out_infinite] rounded-full bg-sky-300/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[18%] right-[14%] h-56 w-56 animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-yellow-200/10 blur-3xl" />
      <header className="relative z-10 sticky top-0 border-b border-white/55 bg-white/45 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-8">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-3">
            <BrandMark />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(currentUser ? '/app/dashboard' : '/login')}
              disabled={loading}
              className="inline-flex h-10 max-w-[220px] items-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              {currentUser && <UserRound className="h-4 w-4 shrink-0" />}
              <span className="truncate">{loading ? 'Đang tải...' : currentUser ? accountLabel : 'Đăng nhập'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 overflow-hidden px-4 pb-10 pt-10 sm:px-6 lg:pb-12 lg:pt-12">
        <div className="relative w-full">
        <section className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Trung Tâm Điều Khiển</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bạn muốn làm gì hôm nay?</h1>
            <p className="mt-1 text-sm text-slate-500">Mở nhanh nghiệp vụ thường dùng từ một màn hình trung tâm.</p>
          </div>
          <button type="button" onClick={() => navigate('/login')} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-700">
            Mở hệ thống <ShoppingCart className="h-3.5 w-3.5" />
          </button>
        </section>

        <section aria-labelledby="quick-actions" className="mb-8">
          <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-sky-600" /><h2 id="quick-actions" className="text-sm font-semibold text-slate-800">Thao tác nhanh</h2></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return <button type="button" key={item.path} onClick={() => navigate(item.path)} className={`group flex min-h-[128px] flex-col items-center justify-center gap-3 rounded-lg border border-white/70 p-4 text-center shadow-sm backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:border-sky-300 hover:bg-white/70 hover:shadow-lg ${item.surface === 'bg-white' ? 'bg-white/38' : item.surface}`}>
                <span className={`flex h-12 w-12 items-center justify-center rounded-lg border ${item.tone}`}><Icon className="h-6 w-6" /></span>
                <span className="w-full"><span className="block text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-0.5 block text-xs text-slate-500">{item.description}</span></span>
              </button>;
            })}
          </div>
        </section>

        <section aria-labelledby="modules">
          <div className="mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-slate-500" /><h2 id="modules" className="text-sm font-semibold text-slate-800">Phân hệ quản lý</h2></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {modules.map((item) => {
              const Icon = item.icon;
              return <button type="button" key={item.path} onClick={() => navigate(item.path)} className={`group flex min-h-[132px] flex-col items-center justify-center gap-3 rounded-lg border border-white/70 p-4 text-center shadow-sm backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:border-sky-300 hover:shadow-lg ${item.surface}`}>
                <span className={`flex h-10 w-10 items-center justify-center rounded-md border ${item.tone}`}><Icon className="h-5 w-5" /></span>
                <span className="w-full min-w-0"><span className="block text-sm font-semibold leading-5 text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-4 text-slate-500">{item.description}</span></span>
              </button>;
            })}
          </div>
        </section>

        </div>
      </main>
      <footer className="relative z-10 mt-auto border-t border-white/55 bg-white/45 backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:px-6">
          <span>HKD Smart · Kinh Doanh Tinh Gọn.</span>
          <a href="https://trandao.vn" target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 transition hover:text-sky-600 hover:underline">© TRANDAO Investment</a>
        </div>
      </footer>
    </div>
  );
}
