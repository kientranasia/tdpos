import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Plus, Search, Truck, Users, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { suppliersApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency, normalizeSearchText } from '../lib/utils';

type PartnerType = 'customer' | 'supplier';

export default function Partners() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customers, invoices, activeTenant, addCustomer, refreshCustomers } = useApp();
  const [type, setType] = useState<PartnerType>(location.pathname.includes('supplier') ? 'supplier' : 'customer');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(() => new URLSearchParams(location.search).get('create') === '1');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', taxCode: '', address: '' });

  const loadSuppliers = useCallback(async () => {
    setSuppliers(await suppliersApi.list());
  }, []);

  useEffect(() => {
    const nextType: PartnerType = location.pathname.includes('supplier') ? 'supplier' : 'customer';
    setType((currentType) => currentType === nextType ? currentType : nextType);
  }, [location.pathname]);

  useEffect(() => {
    Promise.all([refreshCustomers(), loadSuppliers()]).catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu đối tác.'));
  }, [loadSuppliers, location.pathname, refreshCustomers]);

  const customerSpend = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((invoice) => { if (invoice.customerId) map.set(invoice.customerId, (map.get(invoice.customerId) || 0) + invoice.finalAmount); });
    return map;
  }, [invoices]);

  const rows = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (type === 'supplier') return suppliers.filter((row) => !keyword || normalizeSearchText(`${row.code} ${row.name} ${row.phone} ${row.taxCode || ''}`).includes(keyword));
    return customers.filter((row) => !keyword || normalizeSearchText(`${row.name} ${row.phone} ${row.address}`).includes(keyword));
  }, [customers, search, suppliers, type]);

  const switchType = (next: PartnerType) => {
    setType(next);
    navigate(next === 'customer' ? '/app/customers' : '/app/suppliers', { replace: true });
  };

  const isCustomer = type === 'customer';
  const HeaderIcon = isCustomer ? Users : Truck;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) return setError(`Vui lòng nhập tên ${isCustomer ? 'khách hàng' : 'nhà cung cấp'}.`);
    try {
      if (type === 'supplier') {
        await suppliersApi.create(form);
        await loadSuppliers();
      } else if (activeTenant) {
        const saved = await addCustomer({ id: uuid(), tenantId: activeTenant.id, name: form.name.trim(), phone: form.phone.trim(), taxCode: form.taxCode.trim() || null, address: form.address.trim(), totalDebt: 0, type: 'retail' });
        if (!saved) throw new Error('Không thể lưu khách hàng.');
        await refreshCustomers();
      }
      setForm({ name: '', phone: '', taxCode: '', address: '' });
      setShowCreate(false);
    } catch (err) { setError(err instanceof Error ? err.message : `Không thể tạo ${isCustomer ? 'khách hàng' : 'nhà cung cấp'}.`); }
  };

  return <div className="erp-partners erp-compact flex h-full flex-col bg-slate-50 overflow-hidden">
    <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white px-3 py-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2.5 mr-auto"><div className={`flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm ${isCustomer ? 'bg-sky-600' : 'bg-amber-600'}`}><HeaderIcon className="h-4 w-4" /></div><div><h1 className="text-base font-semibold leading-tight text-slate-900">{isCustomer ? 'Khách hàng' : 'Nhà cung cấp'}</h1><p className="mt-0.5 text-[11px] leading-tight text-slate-500">{isCustomer ? 'Quản lý hồ sơ, nhóm khách và công nợ' : 'Quản lý thông tin và công nợ phải trả'}</p></div></div>
      <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-0.5"><button className={`h-7 px-3 text-xs ${type === 'customer' ? 'bg-white text-sky-700 shadow-sm font-semibold' : 'text-slate-500'}`} onClick={() => switchType('customer')}><Users className="mr-1 inline h-3.5 w-3.5"/>Khách hàng</button><button className={`h-7 px-3 text-xs ${type === 'supplier' ? 'bg-white text-sky-700 shadow-sm font-semibold' : 'text-slate-500'}`} onClick={() => switchType('supplier')}><Truck className="mr-1 inline h-3.5 w-3.5"/>Nhà cung cấp</button></div>
      <div className="relative w-48"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/><Input className="h-8 rounded border-slate-200 pl-7 text-xs" placeholder="Tìm mã, tên, SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Button size="sm" className="h-8 rounded px-3 text-xs" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-3.5 w-3.5"/>Thêm {type === 'customer' ? 'khách' : 'NCC'}</Button>
    </header>

    <div className="flex-1 overflow-auto p-2">
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="grid grid-cols-[72px_minmax(180px,1.5fr)_110px_130px_minmax(180px,1fr)_120px_32px] gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-500"><span>Mã</span><span>{isCustomer ? 'Tên khách hàng' : 'Tên nhà cung cấp'}</span><span>Điện thoại</span><span>MST</span><span>Địa chỉ</span><span className="text-right">{isCustomer ? 'Dư nợ' : 'Phải trả'}</span><span/></div>
        <div className="divide-y divide-slate-100">{rows.map((row) => {
          const isCustomer = type === 'customer';
          const code = isCustomer ? `KH-${row.id.slice(0, 6).toUpperCase()}` : row.code;
          const balance = isCustomer ? row.totalDebt : row.currentPayable;
          return <button key={row.id} className="grid w-full grid-cols-[72px_minmax(180px,1.5fr)_110px_130px_minmax(180px,1fr)_120px_32px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => isCustomer ? navigate(`/app/customers/${row.id}`) : navigate(`/app/suppliers/${row.id}`)} aria-label={`Xem chi tiết ${row.name}`}>
            <span className="font-mono text-[11px] text-slate-500">{code}</span>
            <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{row.name}</span><span className="block truncate text-[11px] text-slate-400">{isCustomer ? (row.type === 'loyal' ? 'Khách VIP' : 'Khách lẻ') : 'Nhà cung cấp'}</span></span>
            <span className="truncate text-slate-600">{row.phone || '-'}</span><span className="truncate text-slate-600">{row.taxCode || '-'}</span><span className="truncate text-slate-500">{row.address || '-'}</span><span className={`text-right tabular-nums font-medium ${balance > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{formatCurrency(balance || 0)}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          </button>;
        })}{!rows.length && <div className="px-3 py-6 text-center text-xs text-slate-500">Chưa có dữ liệu phù hợp.</div>}</div>
      </div>
    </div>

    {showCreate && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-20"><form onSubmit={submit} className="w-full max-w-xl rounded border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2"><h2 className="text-sm font-semibold">Thêm {isCustomer ? 'khách hàng' : 'nhà cung cấp'}</h2><button type="button" onClick={() => setShowCreate(false)}><X className="h-4 w-4 text-slate-400"/></button></div><div className="grid grid-cols-2 gap-2"><label>{isCustomer ? 'Tên khách hàng' : 'Tên nhà cung cấp'}<input autoFocus className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}/></label><label>Số điện thoại<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}/></label><label>Mã số thuế<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.taxCode} onChange={(e) => setForm({...form, taxCode: e.target.value})}/></label><label>Địa chỉ<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.address} onChange={(e) => setForm({...form, address: e.target.value})}/></label></div>{error && <p className="mt-2 text-xs text-rose-600">{error}</p>}<div className="mt-3 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button><Button type="submit" size="sm">Lưu</Button></div></form></div>}

  </div>;
}
