import {
  ArrowLeftRight,
  BarChart3,
  BookText,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  Package,
  PackageX,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { isMenuAllowed } from '../lib/permissions';

type MenuItem = {
  label: string;
  desc: string;
  path: string;
  icon: typeof Package;
  status?: 'new' | 'ready';
};

const sections: Array<{ title: string; items: MenuItem[] }> = [
  {
    title: 'Giao dịch',
    items: [
      { label: 'Bán hàng', desc: 'Tạo bill và thanh toán tại quầy', path: '/app/pos', icon: ShoppingCart, status: 'ready' },
      { label: 'Hóa đơn', desc: 'Tra cứu, in và theo dõi công nợ', path: '/app/invoices', icon: Receipt, status: 'ready' },
      { label: 'Trả hàng', desc: 'Tìm bill và lập phiếu trả khách', path: '/app/returns', icon: RotateCcw, status: 'ready' },
      { label: 'Sổ quỹ', desc: 'Theo dõi tiền mặt và chuyển khoản', path: '/app/cashbook', icon: BookText, status: 'ready' },
    ],
  },
  {
    title: 'Hàng hóa',
    items: [
      { label: 'Hàng hóa', desc: 'Sản phẩm, giá bán và thẻ kho', path: '/app/inventory', icon: Package, status: 'ready' },
      { label: 'Kiểm kho', desc: 'Quét mã, nhập thực tế và xem lệch kho', path: '/app/stock-check', icon: ClipboardCheck, status: 'ready' },
      { label: 'Nhập hàng', desc: 'Tạo phiếu nhập từ nhà cung cấp', path: '/app/purchases', icon: ClipboardList, status: 'ready' },
      { label: 'Trả hàng nhập', desc: 'Trả lại hàng đã nhập cho nhà cung cấp', path: '/app/purchase-returns', icon: RotateCcw, status: 'ready' },
      { label: 'Xuất hủy', desc: 'Ghi nhận hàng hỏng, mất hoặc hết hạn', path: '/app/inventory-operations?mode=dispose', icon: PackageX, status: 'ready' },
      { label: 'Chuyển hàng', desc: 'Chuẩn bị luồng chuyển giữa các kho', path: '/app/inventory-operations?mode=transfer', icon: ArrowLeftRight, status: 'new' },
      { label: 'Xuất dùng nội bộ', desc: 'Ghi nhận hàng lấy dùng trong cửa hàng', path: '/app/inventory-operations?mode=internal', icon: HandCoins, status: 'ready' },
    ],
  },
  {
    title: 'Đối tác',
    items: [
      { label: 'Khách hàng', desc: 'Hồ sơ, lịch sử mua và công nợ', path: '/app/customers', icon: Users, status: 'ready' },
      { label: 'Nhà cung cấp', desc: 'Thông tin nhập hàng và phải trả', path: '/app/suppliers', icon: Truck, status: 'ready' },
    ],
  },
  {
    title: 'Báo cáo',
    items: [
      { label: 'Cuối ngày', desc: 'Thu chi, bán hàng và phương thức thanh toán', path: '/app/reports?view=daily', icon: BarChart3, status: 'ready' },
      { label: 'Bán hàng', desc: 'Doanh thu, hóa đơn và thực thu', path: '/app/reports?view=sales', icon: BarChart3, status: 'ready' },
      { label: 'Hàng hóa', desc: 'Nhập, xuất, tồn và lịch sử điều chỉnh', path: '/app/reports?view=inventory', icon: Package, status: 'ready' },
    ],
  },
];

export default function MoreMenu() {
  const { currentUser } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    const [pathname, search] = path.split('?');
    return location.pathname === pathname && (!search || location.search === `?${search}`);
  };

  return (
    <div className="min-h-full space-y-3 bg-slate-50 p-3 pb-mobile-nav">
      <header className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-slate-900">Nghiệp vụ</h1>
        <p className="mt-1 text-xs text-slate-500">Chọn nhanh chức năng theo nhóm công việc.</p>
      </header>

      {sections.map((section) => {
        const visible = section.items.filter((item) => isMenuAllowed(currentUser?.role, item.path));
        if (!visible.length) return null;
        return (
          <section key={section.title} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{section.title}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {visible.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm font-medium ${active ? 'text-sky-800' : 'text-slate-900'}`}>{item.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{item.desc}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {item.status === 'new' && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Đang hoàn thiện</span>}
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {isMenuAllowed(currentUser?.role, '/app/debt') && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Tài chính</h2></div>
          <button type="button" onClick={() => navigate('/app/debt')} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Wallet className="h-4 w-4" /></span><span><span className="block text-sm font-medium text-slate-900">Công nợ</span><span className="mt-0.5 block text-xs text-slate-500">Phải thu khách hàng</span></span></span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>
        </section>
      )}

      {isMenuAllowed(currentUser?.role, '/app/settings') && (
        <button type="button" onClick={() => navigate('/app/settings')} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Settings className="h-4 w-4" /></span>
          <span><span className="block text-sm font-medium text-slate-900">Cài đặt</span><span className="mt-0.5 block text-xs text-slate-500">Thiết lập cửa hàng và người dùng</span></span>
          <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
        </button>
      )}
    </div>
  );
}
