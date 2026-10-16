import { ChevronRight, Receipt, Users, Truck, BookText, Settings, ClipboardList, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { isMenuAllowed } from '../lib/permissions';

export default function MoreMenu() {
  const { currentUser } = useApp();
  const navigate = useNavigate();

  const sections = [
    {
      title: 'Giao dịch',
      items: [
        { label: 'Lịch sử đơn', desc: 'Theo dõi hóa đơn bán hàng', path: '/app/invoices', icon: Receipt },
        { label: 'Khách hàng', desc: 'Quản lý hồ sơ và công nợ khách', path: '/app/customers', icon: Users },
        { label: 'Nhà cung cấp', desc: 'Thông tin NCC và công nợ phải trả', path: '/app/suppliers', icon: Truck },
        { label: 'Sổ quỹ', desc: 'Thu chi và đối soát', path: '/app/cashbook', icon: BookText },
        { label: 'Báo cáo', desc: 'Doanh thu, tồn kho, công nợ', path: '/app/reports', icon: BarChart3 },
        { label: 'Đơn nhập hàng', desc: 'Tạo phiếu nhập và trả hàng NCC', path: '/app/purchases', icon: ClipboardList },
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        { label: 'Cài đặt', desc: 'Thiết lập cửa hàng & người dùng', path: '/app/settings', icon: Settings },
      ],
    },
  ];

  return (
    <div className="min-h-full bg-slate-50 p-3 space-y-3">
      {sections.map((section) => {
        const visible = section.items.filter((item) => isMenuAllowed(currentUser?.role, item.path));
        if (!visible.length) return null;
        return (
          <section key={section.title} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {visible.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                      <p className="text-xs text-slate-500 truncate">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
