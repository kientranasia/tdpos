import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, Plus, Search, Truck, Upload, Users, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { partnerImportApi, suppliersApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency, normalizeSearchText } from '../lib/utils';

type PartnerType = 'customer' | 'supplier';
type ImportEntity = 'customer' | 'supplier' | 'customer_debt' | 'supplier_debt';

type ImportPayload = {
  sourceSystem: string;
  fileName: string;
  entityType: ImportEntity;
  rows: Record<string, unknown>[];
  partnerCode?: string;
  meta?: Record<string, unknown>;
};

type ImportPreview = {
  payload: ImportPayload;
  result: {
    entityType: ImportEntity;
    stats: { totalRows: number; createdCount: number; updatedCount: number; debtAdjustedCount: number; detailCount: number; errorCount: number };
    issues: Array<{ rowNumber: number; code: string; message: string; sourceCode: string; sourceName: string }>;
    sample: Record<string, unknown>[];
    fieldCount: number;
  };
};

const compactHeader = (value: unknown) => normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
const cellText = (value: unknown) => value instanceof Date ? value.toISOString() : String(value ?? '').trim();

const rowToObject = (headers: unknown[], values: unknown[]) => headers.reduce<Record<string, unknown>>((result, header, index) => {
  const key = cellText(header);
  if (key) result[key] = values[index] ?? '';
  return result;
}, {});

const findHeaderRow = (rows: unknown[][]) => {
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const headers = rows[index].map(compactHeader).filter(Boolean);
    if (headers.some((value) => value === 'makhachhang') || headers.some((value) => value === 'manhacungcap') || (headers.includes('ghino') && headers.includes('ghico'))) return index;
  }
  return -1;
};

const findMetaValue = (rows: unknown[][], labels: string[]) => {
  const expected = labels.map(compactHeader);
  for (const row of rows.slice(0, 20)) {
    const labelIndex = row.findIndex((cell) => expected.includes(compactHeader(cell)));
    if (labelIndex >= 0 && cellText(row[labelIndex + 1])) return cellText(row[labelIndex + 1]);
  }
  return '';
};

const entityLabel = (entityType: ImportEntity) => ({
  customer: 'danh sách khách hàng',
  supplier: 'danh sách nhà cung cấp',
  customer_debt: 'công nợ chi tiết khách hàng',
  supplier_debt: 'công nợ chi tiết nhà cung cấp',
}[entityType]);

const parsePartnerWorkbook = async (file: File): Promise<ImportPayload> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File không có sheet dữ liệu.');
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const headerIndex = findHeaderRow(rawRows);
  if (headerIndex < 0) throw new Error('Không nhận diện được bộ tiêu đề khách hàng, nhà cung cấp hoặc công nợ chi tiết.');
  const headers = rawRows[headerIndex];
  const headerKeys = headers.map(compactHeader);
  const isCustomer = headerKeys.includes('makhachhang');
  const isSupplier = headerKeys.includes('manhacungcap');
  const isDebt = headerKeys.includes('ghino') && headerKeys.includes('ghico');
  const partnerCode = isDebt ? findMetaValue(rawRows, ['Mã KH', 'Mã NCC', 'Mã khách hàng', 'Mã nhà cung cấp']) : '';
  const entityType: ImportEntity = isDebt ? (partnerCode.toUpperCase().startsWith('NCC') ? 'supplier_debt' : 'customer_debt') : isSupplier ? 'supplier' : 'customer';
  const rows = rawRows.slice(headerIndex + 1).map((row) => rowToObject(headers, row)).filter((row) => Object.values(row).some((value) => cellText(value)));
  if (!rows.length) throw new Error('File không có dòng dữ liệu để import.');
  return { sourceSystem: 'kiot-viet', fileName: file.name, entityType, rows, ...(partnerCode ? { partnerCode } : {}), meta: { sheetName, headerRow: headerIndex + 1, partnerCode } };
};

export default function Partners() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customers, invoices, activeTenant, currentUser, permissions, addCustomer, refreshCustomers } = useApp();
  const [type, setType] = useState<PartnerType>(location.pathname.includes('supplier') ? 'supplier' : 'customer');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(() => new URLSearchParams(location.search).get('create') === '1');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', taxCode: '', address: '' });
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadSuppliers = useCallback(async () => setSuppliers(await suppliersApi.list()), []);

  useEffect(() => {
    const nextType: PartnerType = location.pathname.includes('supplier') ? 'supplier' : 'customer';
    setType((currentType) => currentType === nextType ? currentType : nextType);
  }, [location.pathname]);

  useEffect(() => {
    Promise.all([refreshCustomers(), loadSuppliers()]).catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu đối tác.'));
  }, [loadSuppliers, location.pathname, refreshCustomers]);

  const isCustomer = type === 'customer';
  const canViewDetails = currentUser?.role === 'owner' || permissions?.includes(isCustomer ? 'customers.view_detail' : 'suppliers.view_detail') === true;
  const canManagePartners = currentUser?.role === 'owner' || permissions?.includes('partners.create') === true;

  const rows = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (!isCustomer) return suppliers.filter((row) => !keyword || normalizeSearchText(`${row.code} ${row.sourceCode || ''} ${row.name}${canViewDetails ? ` ${row.phone || ''} ${row.email || ''} ${row.taxCode || ''}` : ''}`).includes(keyword));
    return customers.filter((row) => !keyword || normalizeSearchText(`${row.code || ''} ${row.sourceCode || ''} ${row.name}${canViewDetails ? ` ${row.phone || ''} ${row.address || ''}` : ''}`).includes(keyword));
  }, [canViewDetails, customers, isCustomer, search, suppliers]);

  const switchType = (next: PartnerType) => {
    setType(next);
    navigate(next === 'customer' ? '/app/customers' : '/app/suppliers', { replace: true });
  };

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

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    setParsing(true);
    try {
      const payload = await parsePartnerWorkbook(file);
      const result = await partnerImportApi.preview(payload);
      setImportPreview({ payload, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đọc file dữ liệu.');
    } finally {
      setParsing(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    setError('');
    try {
      const result = await partnerImportApi.importBatch(importPreview.payload);
      const batch = result.batch;
      const importedLabel = entityLabel(importPreview.payload.entityType);
      setImportPreview(null);
      setSuccess(`Đã import ${importedLabel}: tạo ${batch.createdCount || 0}, cập nhật ${batch.updatedCount || 0}${batch.detailCount ? `, ${batch.detailCount} dòng công nợ` : ''}.`);
      await Promise.all([refreshCustomers(), loadSuppliers()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể import dữ liệu đối tác.');
    } finally {
      setImporting(false);
    }
  };

  return <div className="erp-partners erp-compact flex h-full flex-col overflow-hidden bg-slate-50">
    <header className="sticky top-0 z-40 flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-3">
      <div className="mr-auto flex items-center gap-2.5"><div className={`flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm ${isCustomer ? 'bg-sky-600' : 'bg-amber-600'}`}><HeaderIcon className="h-4 w-4" /></div><div><h1 className="text-base font-semibold leading-tight text-slate-900">{isCustomer ? 'Khách hàng' : 'Nhà cung cấp'}</h1><p className="mt-0.5 text-[11px] leading-tight text-slate-500">{isCustomer ? 'Quản lý hồ sơ, nhóm khách và công nợ' : 'Quản lý thông tin và công nợ phải trả'}</p></div></div>
      <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-0.5"><button className={`h-7 px-3 text-xs ${type === 'customer' ? 'bg-white font-semibold text-sky-700 shadow-sm' : 'text-slate-500'}`} onClick={() => switchType('customer')}><Users className="mr-1 inline h-3.5 w-3.5" />Khách hàng</button><button className={`h-7 px-3 text-xs ${type === 'supplier' ? 'bg-white font-semibold text-sky-700 shadow-sm' : 'text-slate-500'}`} onClick={() => switchType('supplier')}><Truck className="mr-1 inline h-3.5 w-3.5" />Nhà cung cấp</button></div>
      <div className="relative w-48"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input className="h-8 rounded border-slate-200 pl-7 text-xs" placeholder={canViewDetails ? 'Tìm mã, tên, SĐT...' : 'Tìm mã, tên...'} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
      {canManagePartners && <><Button size="sm" variant="outline" className="h-8 rounded px-3 text-xs" disabled={parsing} onClick={() => importInputRef.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />{parsing ? 'Đang đọc...' : 'Nhập dữ liệu'}</Button>
      <Button size="sm" className="h-8 rounded px-3 text-xs" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-3.5 w-3.5" />Thêm {type === 'customer' ? 'khách' : 'NCC'}</Button></>}
    </header>

    <div className="flex-1 overflow-auto p-2">
      {error && <div className="mb-2 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}<button className="ml-auto" onClick={() => setError('')}><X className="h-3.5 w-3.5" /></button></div>}
      {success && <div className="mb-2 flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}<button className="ml-auto" onClick={() => setSuccess('')}><X className="h-3.5 w-3.5" /></button></div>}
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className={`grid ${canViewDetails ? 'grid-cols-[88px_minmax(180px,1.5fr)_110px_130px_minmax(180px,1fr)_120px_32px]' : 'grid-cols-[100px_minmax(180px,1fr)]'} gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-500`}><span>Mã</span><span>{isCustomer ? 'Tên khách hàng' : 'Tên nhà cung cấp'}</span>{canViewDetails && <><span>Điện thoại</span><span>MST</span><span>Địa chỉ</span><span className="text-right">{isCustomer ? 'Dư nợ' : 'Phải trả'}</span><span /></>}</div>
        <div className="divide-y divide-slate-100">{rows.map((row) => {
          const rowIsCustomer = type === 'customer';
          const code = row.code || row.sourceCode || (rowIsCustomer ? `KH-${row.id.slice(0, 6).toUpperCase()}` : '-');
          const balance = rowIsCustomer ? row.totalDebt : row.currentPayable;
          const rowContent = <><span className="truncate font-mono text-[11px] text-slate-500" title={String(code)}>{code}</span>
            <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{row.name}</span>{canViewDetails && <span className="block truncate text-[11px] text-slate-400">{rowIsCustomer ? (row.type === 'loyal' ? 'Khách VIP' : 'Khách lẻ') : (row.groupName || 'Nhà cung cấp')}</span>}</span>
            {canViewDetails && <><span className="truncate text-slate-600">{row.phone || '-'}</span><span className="truncate text-slate-600">{row.taxCode || '-'}</span><span className="truncate text-slate-500">{row.address || '-'}</span><span className={`text-right tabular-nums font-medium ${balance > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{formatCurrency(balance || 0)}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></>}
          </>;
          return canViewDetails
            ? <button key={row.id} className="grid w-full grid-cols-[88px_minmax(180px,1.5fr)_110px_130px_minmax(180px,1fr)_120px_32px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => rowIsCustomer ? navigate(`/app/customers/${row.id}`) : navigate(`/app/suppliers/${row.id}`)} aria-label={`Xem chi tiết ${row.name}`}>{rowContent}</button>
            : <div key={row.id} className="grid grid-cols-[100px_minmax(180px,1fr)] items-center gap-2 px-2 py-1.5 text-left text-xs">{rowContent}</div>;
        })}{!rows.length && <div className="px-3 py-6 text-center text-xs text-slate-500">Chưa có dữ liệu phù hợp.</div>}</div>
      </div>
    </div>

    {showCreate && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 pt-16 sm:p-4 sm:pt-20"><form onSubmit={submit} className="max-h-[calc(100dvh-5rem)] w-full max-w-xl overflow-y-auto rounded border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2"><h2 className="text-sm font-semibold">Thêm {isCustomer ? 'khách hàng' : 'nhà cung cấp'}</h2><button type="button" onClick={() => setShowCreate(false)}><X className="h-4 w-4 text-slate-400" /></button></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label>{isCustomer ? 'Tên khách hàng' : 'Tên nhà cung cấp'}<input autoFocus className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Số điện thoại<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Mã số thuế<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} /></label><label>Địa chỉ<input className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label></div>{error && <p className="mt-2 text-xs text-rose-600">{error}</p>}<div className="mt-3 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button><Button type="submit" size="sm">Lưu</Button></div></form></div>}

    {importPreview && <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 pt-8 sm:p-6"><section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><div className="rounded-lg bg-sky-50 p-2 text-sky-700"><FileSpreadsheet className="h-5 w-5" /></div><div><h2 className="text-base font-semibold text-slate-900">Xem trước nhập dữ liệu</h2><p className="text-xs text-slate-500">{importPreview.payload.fileName} · {entityLabel(importPreview.payload.entityType)}</p></div></div><button type="button" onClick={() => setImportPreview(null)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-3 p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
      ['Dòng đọc', importPreview.result.stats.totalRows], ['Tạo mới', importPreview.result.stats.createdCount], ['Cập nhật', importPreview.result.stats.updatedCount], ['Công nợ lệch', importPreview.result.stats.debtAdjustedCount], ['Lỗi', importPreview.result.stats.errorCount],
    ].map(([label, value]) => <div key={String(label)} className={`rounded border px-3 py-2 ${label === 'Lỗi' && Number(value) > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><div className="text-[11px] text-slate-500">{label}</div><div className="text-lg font-semibold tabular-nums text-slate-900">{value}</div></div>)}</div>{importPreview.payload.entityType.endsWith('_debt') && <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">Các dòng công nợ chi tiết sẽ được lưu vào lịch sử đối tác. Số dư hiện tại chỉ được cập nhật khi import bảng danh sách đối tác, tránh cộng dồn trùng khi chạy lại báo cáo.</div>}{importPreview.result.issues.length > 0 && <div className="max-h-56 overflow-auto rounded border border-rose-200 bg-rose-50"><div className="border-b border-rose-200 px-3 py-2 text-xs font-semibold text-rose-800">Cần xử lý trước khi import</div><div className="divide-y divide-rose-100">{importPreview.result.issues.slice(0, 100).map((issue) => <div key={`${issue.rowNumber}-${issue.code}`} className="px-3 py-2 text-xs text-rose-700">Dòng {issue.rowNumber}: {issue.message}{issue.sourceCode ? ` · ${issue.sourceCode}` : ''}</div>)}{importPreview.result.issues.length > 100 && <div className="px-3 py-2 text-xs text-rose-700">Còn {importPreview.result.issues.length - 100} lỗi khác.</div>}</div></div>}{importPreview.result.issues.length === 0 && <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />Mapping hợp lệ, có thể import an toàn. Mã nguồn được dùng để cập nhật lại dữ liệu khi chạy cùng file.</div>}<details className="rounded border border-slate-200"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">Xem mẫu {Math.min(importPreview.result.sample.length, 5)} dòng đầu</summary><pre className="max-h-48 overflow-auto border-t border-slate-100 bg-slate-50 p-3 text-[10px] text-slate-600">{JSON.stringify(importPreview.result.sample.slice(0, 5), null, 2)}</pre></details></div><div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3"><Button type="button" size="sm" variant="outline" onClick={() => setImportPreview(null)}>Hủy</Button><Button type="button" size="sm" disabled={importing || importPreview.result.issues.length > 0} onClick={confirmImport}>{importing ? 'Đang import...' : 'Xác nhận import'}</Button></div></section></div>}
  </div>;
}
