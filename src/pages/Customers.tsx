import { FormEvent, useMemo, useState } from 'react';
import { ChevronRight, MapPin, Phone, Plus, Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import AppPageHeader from '../components/layout/AppPageHeader';

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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-4 md:gap-6 md:p-6">
      <AppPageHeader
        title="Khách hàng"
        subtitle={`${customers.length} khách trong hệ thống`}
        actions={(
          <Button className="h-10 text-sm md:w-auto" onClick={() => setIsOpenCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm khách hàng
          </Button>
        )}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-5">
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 pl-10 text-sm"
              placeholder="Tìm theo tên, số điện thoại, địa chỉ"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CustomerTypeFilter)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="all">Tất cả</option>
            <option value="retail">Khách lẻ</option>
            <option value="loyal">Khách thân thiết</option>
          </select>
        </div>
      </section>

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
