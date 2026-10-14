import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cashbookApi, purchasesApi, reportsApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';

export default function Reports() {
  const { invoices, products } = useApp();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [cashbook, setCashbook] = useState<any[]>([]);
  const [staffReport, setStaffReport] = useState<any>({ rows: [] });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [staffId, setStaffId] = useState('all');
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [purchaseRows, cashRows, staff] = await Promise.all([purchasesApi.list(), cashbookApi.list(), reportsApi.staff({ from: fromDate || undefined, to: toDate || undefined, userId: staffId === 'all' ? undefined : staffId })]);
      setPurchases(purchaseRows); setCashbook(cashRows); setStaffReport(staff);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tải báo cáo.'); }
  };
  useEffect(() => { void load(); }, [fromDate, toDate, staffId]);

  const metrics = useMemo(() => ({
    revenue: invoices.filter((row) => row.workflowStatus !== 'cancelled').reduce((sum, row) => sum + row.finalAmount, 0),
    collected: invoices.filter((row) => row.workflowStatus !== 'cancelled').reduce((sum, row) => sum + row.paidAmount, 0),
    receivable: invoices.filter((row) => row.workflowStatus !== 'cancelled').reduce((sum, row) => sum + row.debtAmount, 0),
    stockValue: products.reduce((sum, row) => sum + row.stock * row.purchasePrice, 0),
    purchaseValue: purchases.reduce((sum, row) => sum + row.finalAmount, 0),
    cashIn: cashbook.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0),
    cashOut: cashbook.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0),
  }), [cashbook, invoices, products, purchases]);

  const exportExcel = () => {
    const staffSheet = (staffReport.rows || []).map((row: any) => ({ 'Nhân viên': row.userName, 'Số đơn bán': row.salesCount, 'Doanh số bán': row.salesAmount, 'Trả khách': row.salesReturnAmount, 'Giá trị nhập': row.purchaseAmount, 'Trả NCC': row.purchaseReturnAmount, 'Tổng thu': row.cashIncome, 'Tổng chi': row.cashExpense, 'Ròng thu chi': row.netCash, 'Doanh số ròng': row.netSales }));
    const sales = invoices.filter((row) => row.workflowStatus !== 'cancelled').map((row) => ({ Ngày: row.createdAt, 'Số chứng từ': row.documentNo || row.id, 'Tổng tiền': row.finalAmount, 'Đã thu': row.paidAmount, 'Còn nợ': row.debtAmount }));
    const purchasesSheet = purchases.map((row) => ({ Ngày: row.createdAt, 'Số phiếu': row.documentNo || row.id, 'Tổng thanh toán': row.finalAmount, 'Đã trả': row.paidAmount, 'Còn nợ': row.payableAmount }));
    const cashSheet = cashbook.map((row) => ({ Ngày: row.createdAt, Loại: row.type === 'income' ? 'Thu' : 'Chi', Nhóm: row.category, 'Nội dung': row.note, 'Số tiền': row.amount }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(staffSheet), 'Theo nhân viên');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sales), 'Bán ra');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchasesSheet), 'Mua vào');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cashSheet), 'Thu chi');
    XLSX.writeFile(workbook, `hkdplus-bao-cao-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return <div className="flex h-full flex-col overflow-hidden bg-slate-50">
    <header className="sticky top-0 z-40 flex shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm"><BarChart3 className="h-4 w-4" /></div><div className="mr-auto"><h1 className="text-base font-semibold leading-tight text-slate-900">Báo cáo</h1><p className="mt-0.5 text-[11px] leading-tight text-slate-500">Bán, nhập, trả hàng và dòng tiền theo nhân viên</p></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Tải lại</Button><Button size="sm" variant="outline" onClick={exportExcel}><Download className="mr-1 h-3.5 w-3.5" />Xuất Excel</Button></header>
    <main className="flex-1 space-y-4 overflow-auto p-3 md:p-5">
      <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-4"><label className="text-xs text-slate-500">Từ ngày<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm" /></label><label className="text-xs text-slate-500">Đến ngày<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm" /></label><label className="text-xs text-slate-500">Nhân viên<select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm"><option value="all">Tất cả nhân viên</option>{(staffReport.rows || []).map((row: any) => <option key={row.userId} value={row.userId}>{row.userName}</option>)}</select></label><Button variant="outline" className="self-end" onClick={() => { setFromDate(''); setToDate(''); setStaffId('all'); }}>Đặt lại bộ lọc</Button></section>
      <section className="grid grid-cols-2 gap-2 md:grid-cols-7">{[['Doanh thu', metrics.revenue], ['Đã thu', metrics.collected], ['Phải thu', metrics.receivable], ['Giá trị tồn', metrics.stockValue], ['Mua vào', metrics.purchaseValue], ['Tổng thu', metrics.cashIn], ['Tổng chi', metrics.cashOut]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-3 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(Number(value))}</p></div>)}</section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-3"><h2 className="text-sm font-semibold text-slate-800">Tổng hợp theo nhân viên</h2><p className="mt-1 text-xs text-slate-500">Hóa đơn hủy được loại trừ; phiếu trả và hoàn tiền vẫn được phản ánh.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Nhân viên</th><th className="px-3 py-2 text-right">Số đơn</th><th className="px-3 py-2 text-right">Doanh số</th><th className="px-3 py-2 text-right">Trả khách</th><th className="px-3 py-2 text-right">Nhập hàng</th><th className="px-3 py-2 text-right">Trả NCC</th><th className="px-3 py-2 text-right">Tổng thu</th><th className="px-3 py-2 text-right">Tổng chi</th><th className="px-3 py-2 text-right">Ròng</th></tr></thead><tbody>{(staffReport.rows || []).map((row: any) => <tr key={row.userId} className="border-b border-slate-100 hover:bg-sky-50"><td className="px-3 py-2 font-medium text-slate-800">{row.userName}</td><td className="px-3 py-2 text-right tabular-nums">{row.salesCount}</td><td className="px-3 py-2 text-right tabular-nums text-sky-700">{formatCurrency(row.salesAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(row.salesReturnAmount)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.purchaseAmount)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.purchaseReturnAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(row.cashIncome)}</td><td className="px-3 py-2 text-right tabular-nums text-rose-700">{formatCurrency(row.cashExpense)}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(row.netCash)}</td></tr>)}{!(staffReport.rows || []).length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Chưa có dữ liệu theo bộ lọc.</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Chi tiết giao dịch liên quan</div><div className="max-h-80 overflow-auto"><table className="w-full min-w-[760px] text-xs"><thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Loại</th><th className="px-3 py-2">Nhân viên</th><th className="px-3 py-2">Chứng từ / tham chiếu</th><th className="px-3 py-2 text-right">Giá trị</th></tr></thead><tbody>{(staffReport.details || []).slice(0, 100).map((detail: any) => <tr key={`${detail.type}-${detail.id}`} className="border-b border-slate-100"><td className="px-3 py-2 text-slate-500">{new Date(detail.createdAt).toLocaleString('vi-VN')}</td><td className="px-3 py-2">{{ sale: 'Bán hàng', sales_return: 'Trả khách', purchase: 'Nhập hàng', purchase_return: 'Trả NCC', cash_income: 'Thu quỹ', cash_expense: 'Chi quỹ' }[detail.type] || detail.type}</td><td className="px-3 py-2">{detail.userName}</td><td className="px-3 py-2 font-mono">{detail.documentNo || detail.referenceId || detail.id}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(detail.amount)}</td></tr>)}{!(staffReport.details || []).length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Chưa có giao dịch liên quan.</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Chi tiết hóa đơn bán hàng</div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Số CT</th><th className="px-3 py-2">Phương thức</th><th className="px-3 py-2 text-right">Tổng tiền</th><th className="px-3 py-2 text-right">Đã thu</th><th className="px-3 py-2 text-right">Còn nợ</th></tr></thead><tbody>{invoices.filter((row) => row.workflowStatus !== 'cancelled').slice(0, 50).map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-3 py-2">{new Date(row.createdAt).toLocaleDateString('vi-VN')}</td><td className="px-3 py-2 font-mono">{row.documentNo || row.id}</td><td className="px-3 py-2">{row.paymentMethod === 'cash' ? 'Tiền mặt' : row.paymentMethod === 'transfer' ? 'Chuyển khoản' : row.paymentMethod === 'wallet' ? 'Ví điện tử' : 'Công nợ'}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.finalAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(row.paidAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(row.debtAmount)}</td></tr>)}</tbody></table></div></section>
      {message && <p className="text-sm text-rose-600">{message}</p>}
    </main>
  </div>;
}
