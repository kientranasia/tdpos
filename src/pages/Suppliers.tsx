import { useEffect, useState } from 'react';
import { Plus, Save, Truck } from 'lucide-react';
import { suppliersApi } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';
import AppPageHeader from '../components/layout/AppPageHeader';

export default function Suppliers() {
  const [rows, setRows] = useState<any[]>([]); const [showForm, setShowForm] = useState(false); const [form, setForm] = useState({ name: '', phone: '', taxCode: '', address: '' });
  const load = () => suppliersApi.list().then(setRows).catch(() => undefined);
  useEffect(load, []);
  const save = async () => { if (!form.name.trim()) return; await suppliersApi.create(form); setForm({ name: '', phone: '', taxCode: '', address: '' }); setShowForm(false); await load(); };
  return <div className="min-h-full bg-slate-50 space-y-4"><AppPageHeader icon={Truck} accentClassName="bg-amber-600" title="Nhà cung cấp" subtitle="Theo dõi nhà cung cấp và công nợ phải trả" actions={<Button className="h-9 text-sm" onClick={() => setShowForm((v) => !v)}><Plus className="mr-2 h-4 w-4"/>Thêm NCC</Button>} /><div className="p-4 md:p-6 pt-0 space-y-5">{showForm && <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="grid gap-3 md:grid-cols-4">{(['name','phone','taxCode','address'] as const).map((key) => <input key={key} className="h-9 rounded-md border border-slate-200 px-3 text-sm" placeholder={{name:'Tên nhà cung cấp',phone:'Số điện thoại',taxCode:'Mã số thuế',address:'Địa chỉ'}[key]} value={form[key]} onChange={(e) => setForm({...form, [key]: e.target.value})}/>)}</div><Button className="mt-3 h-9 text-sm" onClick={save}><Save className="mr-2 h-4 w-4"/>Lưu nhà cung cấp</Button></section>}<section className="rounded-lg border border-slate-200 bg-white divide-y">{rows.map((s) => <div className="flex items-center justify-between p-3" key={s.id}><div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-slate-500">{s.code} · {s.phone || 'Chưa có SĐT'}</p></div><div className="text-right"><p className="text-xs text-slate-500">Công nợ phải trả</p><p className="text-sm font-semibold text-amber-700">{formatCurrency(s.currentPayable)}</p></div></div>)}{!rows.length && <p className="p-5 text-sm text-slate-500">Chưa có nhà cung cấp.</p>}</section></div></div>;
}
