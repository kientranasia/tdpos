import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowLeft, Calendar, ClipboardList, Download, MapPin, Phone, Receipt, Truck, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { purchasesApi, suppliersApi } from '../lib/api';
import { formatCurrency } from '../lib/utils';

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  phone?: string;
  taxCode?: string | null;
  address?: string;
  currentPayable?: number;
  email?: string | null;
  region?: string | null;
  ward?: string | null;
  groupName?: string | null;
  companyName?: string | null;
};

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [statementRows, setStatementRows] = useState<any[]>([]);
  const [statementTenant, setStatementTenant] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const [supplierRows, purchaseRows, statement] = await Promise.all([
          suppliersApi.list(),
          purchasesApi.list(),
          suppliersApi.debtStatement(id),
        ]);
        if (cancelled) return;
        const found = supplierRows.find((row) => row.id === id) || null;
        setSupplier(found);
        setPurchases(purchaseRows.filter((row) => row.supplierId === id));
        setStatementRows(statement.rows || []);
        setStatementTenant(statement.tenant || {});
        if (!found) setError('Không tìm thấy nhà cung cấp.');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể tải thông tin nhà cung cấp.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id]);

  const purchaseTotal = useMemo(() => purchases.reduce((sum, purchase) => sum + Number(purchase.finalAmount || 0), 0), [purchases]);
  const creditBalance = useMemo(() => statementRows
    .filter((entry) => entry.rowType === 'supplier_credit')
    .reduce((sum, entry) => sum + Number(entry.credit || 0) - Number(entry.debit || 0), 0), [statementRows]);
  const payableBalance = useMemo(() => Math.max(0, statementRows
    .filter((entry) => entry.rowType !== 'supplier_credit')
    .reduce((sum, entry) => sum + Number(entry.debit || 0) - Number(entry.credit || 0), 0)), [statementRows]);
  const sortedStatementRows = useMemo(() => [...statementRows].sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.rowType === 'opening' ? 1 : -1;
  }), [statementRows]);

  const exportSupplierDebtStatement = () => {
    if (!supplier) return;
    const tenant = statementTenant;
    const dateText = (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { hour12: false });
    };
    const today = new Date().toLocaleDateString('vi-VN');
    const rows: any[][] = [
      [tenant.name || 'HKD Smart'],
      ['Địa chỉ', tenant.address || supplier.address || ''],
      ['Điện thoại', tenant.phone || supplier.phone || ''],
      [`Công nợ chi tiết nhà cung cấp\nĐến ngày ${today}`],
      ['Tên NCC', supplier.name, '', '', '', '', '', '', '', 'Nợ đầu kỳ', 0],
      ['Mã NCC', supplier.code, '', '', '', '', '', '', '', 'Phát sinh trong kỳ', payableBalance, 0],
      ['Điện thoại', supplier.phone || '', '', '', '', '', '', '', '', 'Nợ cuối kỳ', payableBalance],
      [],
      ['Thời gian', 'Mã', 'Diễn giải', 'ĐVT', 'SL', 'Đơn giá', 'Giảm giá', 'VAT', 'Giá nhập/trả', 'Thành tiền', 'Ghi nợ', 'Ghi có'],
    ];

    for (const row of sortedStatementRows) {
      rows.push([
        dateText(row.createdAt), row.documentNo || '', row.description || '', row.unitName || '', row.quantity ?? '', '', '', '', '', '', Number(row.debit || 0) || '', Number(row.credit || 0) || '',
      ]);
      if (row.items?.length) {
        for (const item of row.items) {
          rows.push([
            '', item.sku || item.productId || '', item.productName || '', item.unitName || item.unit || '', item.quantity ?? '', Number(item.price || 0) || '', Number(item.discountValue || 0) || '', Number(item.taxRate || 0) || '', Number(item.price || 0) || '', Number(item.total || 0) || '', '', '',
          ]);
        }
      }
    }

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
      { s: { r: 1, c: 1 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 8 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 11 } },
      { s: { r: 4, c: 1 }, e: { r: 4, c: 8 } },
      { s: { r: 5, c: 1 }, e: { r: 5, c: 8 } },
      { s: { r: 6, c: 1 }, e: { r: 6, c: 6 } },
    ];
    sheet['!cols'] = [
      { wch: 18 }, { wch: 19 }, { wch: 43 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    ];
    const border = { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < 12; columnIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const cell = sheet[address] as any;
        if (!cell) continue;
        cell.s = {
          font: { name: 'Arial', sz: rowIndex === 0 || rowIndex === 3 ? 12 : 10, bold: rowIndex === 0 || rowIndex === 3 || rowIndex === 8, color: { rgb: '1E293B' } },
          alignment: { vertical: 'center', wrapText: true, horizontal: columnIndex >= 4 ? 'right' : 'left' },
          border: rowIndex >= 8 ? border : undefined,
          fill: rowIndex === 8 ? { fgColor: { rgb: 'E2E8F0' } } : undefined,
        };
        if (rowIndex === 0 || rowIndex === 3) cell.s.alignment.horizontal = 'center';
      }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'CNCT');
    const safeSupplierName = String(supplier.name || supplier.id).replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    XLSX.writeFile(workbook, `cong-no-chi-tiet-nha-cung-cap-${safeSupplierName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  if (loading) {
    return <div className="erp-compact flex h-full items-center justify-center bg-slate-50 text-xs text-slate-500">Đang tải thông tin nhà cung cấp...</div>;
  }

  if (!supplier) {
    return <div className="erp-compact flex h-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center"><Truck className="h-10 w-10 text-slate-300" /><p className="text-sm text-slate-500">{error || 'Không tìm thấy nhà cung cấp.'}</p><Button size="sm" onClick={() => navigate('/app/suppliers')}>Quay lại danh sách</Button></div>;
  }

  return <div className="erp-compact flex h-full flex-col overflow-hidden bg-slate-50">
    <header className="sticky top-0 z-40 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/suppliers')} className="h-8 w-8 shrink-0 rounded-md bg-slate-50 p-0 text-slate-500"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-600 text-sm font-semibold uppercase text-white">{supplier.name.charAt(0)}</div>
        <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold text-slate-900">{supplier.name}</h1><span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Nhà cung cấp</span></div><p className="truncate text-[11px] text-slate-500">Mã: {supplier.code}</p></div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={exportSupplierDebtStatement} className="h-8 rounded-md px-3 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Xuất công nợ</Button>
        <Button size="sm" onClick={() => navigate('/app/purchases')} className="h-8 rounded-md px-3 text-xs"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Nhập hàng</Button>
      </div>
    </header>

    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar"><div className="mx-auto max-w-7xl space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-600"><Receipt className="h-4 w-4" /></div><div><p className="text-[11px] text-slate-500">Tổng nhập hàng</p><p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(purchaseTotal)}</p></div></div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70 text-amber-700"><Wallet className="h-4 w-4" /></div><div><p className="text-[11px] text-amber-700">Công nợ phải trả</p><p className="text-sm font-semibold tabular-nums text-amber-800">{formatCurrency(payableBalance)}</p></div></div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70 text-emerald-700"><Wallet className="h-4 w-4" /></div><div><p className="text-[11px] text-emerald-700">Số dư được nhận</p><p className="text-sm font-semibold tabular-nums text-emerald-800">{formatCurrency(Math.max(0, creditBalance))}</p></div></div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-slate-600"><ClipboardList className="h-4 w-4" /></div><div><p className="text-[11px] text-slate-500">Số phiếu nhập</p><p className="text-sm font-semibold tabular-nums text-slate-900">{purchases.length}</p></div></div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-1">
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-1 w-5 rounded-full bg-amber-600" />Thông tin liên hệ</h2><div className="space-y-3">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Số điện thoại</p><p className="truncate text-xs font-medium text-slate-900">{supplier.phone || '-'}</p></div></div>
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Địa chỉ</p><p className="text-xs font-medium leading-5 text-slate-900">{supplier.address || 'Chưa cập nhật'}</p></div></div>
            <div className="flex items-start gap-2"><Receipt className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Mã số thuế</p><p className="truncate text-xs font-medium text-slate-900">{supplier.taxCode || '-'}</p></div></div>
            <div className="flex items-start gap-2"><Receipt className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Email / nhóm</p><p className="truncate text-xs font-medium text-slate-900">{supplier.email || '-'}{supplier.groupName ? ` · ${supplier.groupName}` : ''}</p></div></div>
          </div></section>
          <section className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-1 w-5 rounded-full bg-orange-600" />Công nợ nhà cung cấp</h2><div className="rounded-md bg-amber-50 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-amber-700">Nợ hiện tại</span><span className="text-sm font-semibold tabular-nums text-amber-800">{formatCurrency(payableBalance)}</span></div><Button size="sm" variant="outline" onClick={() => navigate(`/app/debt?type=supplier&supplierId=${supplier.id}`)} className="mt-2 h-8 w-full border-amber-200 bg-white text-xs text-amber-800">Xem sổ công nợ</Button></div></section>
        </div>

        <div className="space-y-3 lg:col-span-3">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-700"><ClipboardList className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-slate-900">Lịch sử nhập hàng</h2><p className="text-[11px] text-slate-500">Các phiếu nhập và trạng thái thanh toán</p></div></div>{purchases.length ? <div className="divide-y divide-slate-100">{purchases.map((purchase) => <div key={purchase.id} className="grid grid-cols-[minmax(0,1fr)_120px_140px] items-center gap-2 px-3 py-2"><div className="min-w-0"><button type="button" className="block max-w-full truncate text-left text-xs font-medium text-sky-700 hover:underline" onClick={() => navigate(`/app/purchases?purchaseId=${encodeURIComponent(purchase.id)}`)}>{purchase.documentNo || purchase.id.slice(0, 8)}</button><p className="truncate text-[11px] text-slate-500">{new Date(purchase.createdAt).toLocaleDateString('vi-VN')} · {purchase.payableAmount > 0 ? 'Còn nợ' : 'Đã thanh toán'}</p></div><span className="text-right text-xs tabular-nums text-slate-700">{formatCurrency(purchase.finalAmount || 0)}</span><span className="text-right text-[11px] text-slate-500">{purchase.paidAmount > 0 ? `Đã trả ${formatCurrency(purchase.paidAmount)}` : 'Chưa trả'}</span></div>)}</div> : <p className="px-3 py-8 text-center text-xs text-slate-500">Chưa có phiếu nhập hàng.</p>}</section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2.5"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Wallet className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-slate-900">Lịch sử công nợ</h2><p className="text-[11px] text-slate-500">Bao gồm dữ liệu phát sinh và dòng công nợ đã import</p></div></div><span className="text-[11px] text-slate-500">{statementRows.length} giao dịch</span></div>{statementRows.length ? <div className="divide-y divide-slate-100">{sortedStatementRows.map((entry) => { const net = Number(entry.debit || 0) - Number(entry.credit || 0); return <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs text-slate-700">{entry.documentNo} · {entry.description}</p><p className="truncate text-[11px] text-slate-500">{entry.note || 'Không có ghi chú'} · {new Date(entry.createdAt).toLocaleDateString('vi-VN')}</p></div><span className={`shrink-0 text-xs font-medium tabular-nums ${net > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{net > 0 ? '+' : ''}{formatCurrency(net)}</span></div>; })}</div> : <p className="px-3 py-8 text-center text-xs text-slate-500">Chưa có giao dịch công nợ.</p>}</section>
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div></div>
  </div>;
}
