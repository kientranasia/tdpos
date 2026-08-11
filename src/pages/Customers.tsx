import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Crown, DollarSign, MapPin, Phone, Plus, Search, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';

type CustomerTypeFilter = 'all' | 'retail' | 'loyal';
type CustomerSortKey = 'vip' | 'spending_desc' | 'debt_desc' | 'name_asc';

const PAGE_SIZE = 12;

export default function Customers() {
  const navigate = useNavigate();
  const { customers, invoices, activeTenant, currentUser, addCustomer } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CustomerTypeFilter>('all');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('vip');
  const [page, setPage] = useState(1);
  const [isOpenCreateModal, setIsOpenCreateModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    address: '',
    type: 'retail' as 'retail' | 'loyal',
  });

  const customerSpendingMap = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((invoice) => {
      if (!invoice.customerId) return;
      map.set(invoice.customerId, (map.get(invoice.customerId) || 0) + (invoice.finalAmount || 0));
    });
    return map;
  }, [invoices]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const filtered = customers.filter((customer) => {
      const matchKeyword =
        !keyword ||
        customer.name.toLowerCase().includes(keyword) ||
        customer.phone.toLowerCase().includes(keyword) ||
        customer.address.toLowerCase().includes(keyword);
      const matchType = typeFilter === 'all' || customer.type === typeFilter;
      return matchKeyword && matchType;
    });

    return filtered.sort((a, b) => {
      const spendingA = customerSpendingMap.get(a.id) || 0;
      const spendingB = customerSpendingMap.get(b.id) || 0;
      if (sortKey === 'spending_desc') return spendingB - spendingA;
      if (sortKey === 'debt_desc') return b.totalDebt - a.totalDebt;
      if (sortKey === 'name_asc') return a.name.localeCompare(b.name, 'vi');

      // default: VIP first, then spending, then debt
      const vipScoreA = a.type === 'loyal' ? 1 : 0;
      const vipScoreB = b.type === 'loyal' ? 1 : 0;
      if (vipScoreA !== vipScoreB) return vipScoreB - vipScoreA;
      if (spendingA !== spendingB) return spendingB - spendingA;
      return b.totalDebt - a.totalDebt;
    });
  }, [customers, customerSpendingMap, searchTerm, typeFilter, sortKey]);

  const overview = useMemo(() => {
    const totalSpending = customers.reduce((sum, customer) => sum + (customerSpendingMap.get(customer.id) || 0), 0);
    const vipCount = customers.filter((customer) => customer.type === 'loyal').length;
    const debtCount = customers.filter((customer) => customer.totalDebt > 0).length;
    return { totalSpending, vipCount, debtCount };
  }, [customers, customerSpendingMap]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const pagedCustomers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredCustomers.slice(start, start + PAGE_SIZE);
  }, [filteredCustomers, page]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, sortKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
      <div className="p-3 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-2 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <Users className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Khách hàng</h1>
            <p className="text-page-subtitle mt-1">{customers.length} khách trong hệ thống</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3 lg:w-auto">
          <div className="relative group w-full lg:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
            <Input
              className="h-10 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-sky-500/20 transition-all font-semibold text-sm placeholder:text-slate-400 pl-11 lg:h-11"
              placeholder="Tìm theo tên, số điện thoại, địa chỉ"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as CustomerTypeFilter)}
              className="h-10 w-full rounded-lg border-none bg-slate-100/70 shadow-inner px-3 text-sm text-slate-700 lg:h-11"
            >
              <option value="all">Tất cả</option>
              <option value="retail">Khách lẻ</option>
              <option value="loyal">Khách thân thiết</option>
            </select>
            <Button className="h-10 px-3 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-900/20 transition-all text-white text-sm lg:h-11 lg:px-4" onClick={() => setIsOpenCreateModal(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Thêm khách</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Tổng khách hàng</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{customers.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Tổng chi tiêu</p>
          <p className="mt-1 text-lg font-semibold text-sky-700 tabular-nums">{formatCurrency(overview.totalSpending)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Khách VIP</p>
          <p className="mt-1 text-lg font-semibold text-amber-700 tabular-nums">{overview.vipCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Khách có công nợ</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{overview.debtCount}</p>
        </div>
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Hiển thị <span className="font-semibold text-slate-900">{pagedCustomers.length}</span> / {filteredCustomers.length} khách phù hợp
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`h-8 rounded-md px-3 text-xs ${viewMode === 'cards' ? 'bg-sky-100 text-sky-700' : 'text-slate-600'}`}
            >
              Dạng thẻ
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`h-8 rounded-md px-3 text-xs ${viewMode === 'table' ? 'bg-sky-100 text-sky-700' : 'text-slate-600'}`}
            >
              Dạng bảng
            </button>
          </div>
          <label className="text-xs text-slate-500">Sắp xếp</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as CustomerSortKey)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="vip">VIP trước (mặc định)</option>
            <option value="spending_desc">Chi tiêu cao nhất</option>
            <option value="debt_desc">Dư nợ cao nhất</option>
            <option value="name_asc">Tên A-Z</option>
          </select>
        </div>
      </section>

      {viewMode === 'cards' ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pagedCustomers.map((customer) => (
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
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {customer.type === 'loyal' ? <Crown className="h-3 w-3 text-amber-600" /> : null}
                      {customer.type === 'loyal' ? 'Khách VIP' : 'Khách lẻ'}
                    </p>
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
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-sky-600" />
                    Tổng chi tiêu
                  </p>
                  <p className="text-sm font-semibold text-sky-700 tabular-nums">
                    {formatCurrency(customerSpendingMap.get(customer.id) || 0)}
                  </p>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5 text-slate-500" />
                  Dư nợ
                </p>
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
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs text-slate-500 md:grid">
            <p>Khách hàng</p>
            <p>Số điện thoại</p>
            <p className="text-right">Tổng chi tiêu</p>
            <p className="text-right">Dư nợ</p>
            <p className="text-right">Chi tiết</p>
          </div>
          <div className="divide-y divide-slate-100">
            {pagedCustomers.map((customer) => (
              <button
                key={customer.id}
                className="w-full p-4 text-left hover:bg-slate-50 md:grid md:grid-cols-[1.6fr_1fr_1fr_1fr_auto] md:items-center md:gap-3"
                onClick={() => navigate(`/app/customers/${customer.id}`)}
              >
                <div className="mb-2 md:mb-0">
                  <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.type === 'loyal' ? 'Khách VIP' : 'Khách lẻ'}</p>
                </div>
                <p className="mb-2 text-sm text-slate-700 md:mb-0">{customer.phone}</p>
                <p className="mb-2 text-sm font-semibold text-sky-700 tabular-nums md:mb-0 md:text-right">
                  {formatCurrency(customerSpendingMap.get(customer.id) || 0)}
                </p>
                <p className={`mb-2 text-sm font-semibold tabular-nums md:mb-0 md:text-right ${customer.totalDebt > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatCurrency(customer.totalDebt)}
                </p>
                <div className="flex justify-end">
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {filteredCustomers.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Không có khách hàng phù hợp bộ lọc hiện tại.
        </div>
      )}

      {filteredCustomers.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            Trang <span className="font-semibold text-slate-900">{page}</span> / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9 px-3 text-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Trước
            </Button>
            <Button variant="outline" className="h-9 px-3 text-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Sau
            </Button>
          </div>
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
