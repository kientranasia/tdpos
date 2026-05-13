import { FormEvent, useMemo, useState } from 'react';
import { ChevronRight, MapPin, Phone, Plus, Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';

type CustomerTypeFilter = 'all' | 'retail' | 'loyal';

export default function Customers() {
  const navigate = useNavigate();
  const { customers, activeTenant, currentUser, addCustomer } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CustomerTypeFilter>('all');
  const [isOpenCreateModal, setIsOpenCreateModal] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    address: '',
    type: 'retail' as 'retail' | 'loyal',
  });

  const filteredCustomers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchKeyword =
        !keyword ||
        customer.name.toLowerCase().includes(keyword) ||
        customer.phone.toLowerCase().includes(keyword) ||
        customer.address.toLowerCase().includes(keyword);
      const matchType = typeFilter === 'all' || customer.type === typeFilter;
      return matchKeyword && matchType;
    });
  }, [customers, searchTerm, typeFilter]);

  const handleCreateCustomer = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    if (!activeTenant || !currentUser) {
      setSubmitError('Không tìm thấy thông tin tenant hoặc user hiện tại.');
      return;
    }
    if (!createForm.name.trim() || !createForm.phone.trim()) {
      setSubmitError('Vui lòng nhập tên và số điện thoại khách hàng.');
      return;
    }

    try {
      setIsSubmitting(true);
      await addCustomer({
        id: uuid(),
        tenantId: activeTenant.id,
        name: createForm.name.trim(),
        phone: createForm.phone.trim(),
        address: createForm.address.trim(),
        totalDebt: 0,
        type: createForm.type,
      });
      setCreateForm({ name: '', phone: '', address: '', type: 'retail' });
      setIsOpenCreateModal(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể thêm khách hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-3 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <Users className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-section-title">Khách hàng</h1>
            <p className="text-section-subtitle mt-1">{customers.length} khách trong hệ thống</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative group flex-1 lg:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
            <Input
              className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-sky-500/20 transition-all font-semibold text-sm placeholder:text-slate-400 pl-11"
              placeholder="Tìm theo tên, số điện thoại, địa chỉ"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CustomerTypeFilter)}
            className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner px-3 text-sm text-slate-700"
          >
            <option value="all">Tất cả</option>
            <option value="retail">Khách lẻ</option>
            <option value="loyal">Khách thân thiết</option>
          </select>
          <Button className="h-10 lg:h-11 px-4 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-900/20 transition-all text-white shrink-0 text-sm" onClick={() => setIsOpenCreateModal(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm khách hàng</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredCustomers.map((customer) => (
          <button
            key={customer.id}
            className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:bg-slate-50"
            onClick={() => navigate(`/app/customers/${customer.id}`)}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-100 p-2">
                  <Users className="h-4 w-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.type === 'loyal' ? 'Khách thân thiết' : 'Khách lẻ'}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" />
                {customer.phone}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-[2px] h-4 w-4 text-slate-400" />
                <span className="line-clamp-2">{customer.address || 'Chưa cập nhật địa chỉ'}</span>
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">Dư nợ</p>
              <p className={`text-base font-semibold ${customer.totalDebt > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {formatCurrency(customer.totalDebt)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tạo bởi: {customer.createdByName || customer.createdBy || 'N/A'}
              </p>
            </div>
          </button>
        ))}
      </section>

      {filteredCustomers.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Không có khách hàng phù hợp bộ lọc hiện tại.
        </div>
      )}
      </div>

      {isOpenCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={handleCreateCustomer} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Thêm khách hàng</h3>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Tên khách hàng"
                className="h-10 text-sm"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="Số điện thoại"
                className="h-10 text-sm"
                value={createForm.phone}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                placeholder="Địa chỉ"
                className="h-10 text-sm"
                value={createForm.address}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, address: e.target.value }))}
              />
              <select
                value={createForm.type}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, type: e.target.value as 'retail' | 'loyal' }))}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="retail">Khách lẻ</option>
                <option value="loyal">Khách thân thiết</option>
              </select>
            </div>
            {submitError && <p className="mt-3 text-sm text-rose-600">{submitError}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 text-sm" onClick={() => setIsOpenCreateModal(false)}>
                Hủy
              </Button>
              <Button type="submit" className="h-10 text-sm" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu khách hàng'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
