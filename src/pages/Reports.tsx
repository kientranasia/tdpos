import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Download, Package, RefreshCw, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cashAccountsApi, cashbookApi, invoicesApi, purchasesApi, reportsApi, stockMovementsApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';

export default function Reports() {
  const { invoices, productSummary } = useApp();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [cashbook, setCashbook] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [staffReport, setStaffReport] = useState<any>({ rows: [] });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [staffId, setStaffId] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'transfer'>('all');
  const [message, setMessage] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const effectiveDebt = (row: any) => Math.max(
    0,
    Number(row.debtAmount) || 0,
    (Number(row.finalAmount) || 0) - (Number(row.paidAmount) || 0),
  );

  const paymentLabel = (paymentMethod?: string) => paymentMethod === 'transfer'
    ? 'Chuyển khoản'
    : paymentMethod === 'wallet'
      ? 'Ví điện tử'
      : paymentMethod === 'debt'
        ? 'Công nợ'
        : 'Tiền mặt';

  const invoiceDisplayNo = (invoiceId?: string | null) => {
    if (!invoiceId) return 'Không có hóa đơn';
    const invoice = invoices.find((row) => row.id === invoiceId);
    return invoice?.documentNo || `HD-${invoiceId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  };

  const load = async () => {
    try {
      const [purchaseRows, cashRows, accounts, staff, movementRows, returnRows] = await Promise.all([purchasesApi.list(), cashbookApi.list({ from: fromDate || undefined, to: toDate || undefined }), cashAccountsApi.list(), reportsApi.staff({ from: fromDate || undefined, to: toDate || undefined, userId: staffId === 'all' ? undefined : staffId, paymentMethod: paymentFilter === 'all' ? undefined : paymentFilter }), stockMovementsApi.list(undefined, { all: true }), invoicesApi.returns()]);
      setPurchases(purchaseRows); setCashbook(cashRows); setCashAccounts(accounts); setStaffReport(staff); setStockMovements(movementRows); setSalesReturns(returnRows);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tải báo cáo.'); }
  };
  useEffect(() => { void load(); }, [fromDate, paymentFilter, staffId, toDate]);

  const inDateRange = (value: string) => {
    const timestamp = new Date(value).getTime();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return timestamp >= from && timestamp <= to;
  };

  const reportSales = useMemo(() => {
    if (!Array.isArray(staffReport.details)) return null;
    return staffReport.details.filter((row: any) => row.type === 'sale');
  }, [staffReport]);

  const accountMatchesPayment = (accountId?: string | null) => {
    if (paymentFilter === 'all') return true;
    const account = cashAccounts.find((item) => item.id === accountId);
    return paymentFilter === 'transfer' ? account?.type === 'bank' : account?.type === 'cash' || !accountId;
  };

  const filteredCashbook = useMemo(() => cashbook.filter((row) => inDateRange(row.createdAt)
    && (staffId === 'all' || (row.actorId || row.createdBy) === staffId)
    && accountMatchesPayment(row.accountId)), [cashAccounts, cashbook, fromDate, paymentFilter, staffId, toDate]);

  const filteredReturns = useMemo(() => salesReturns.filter((row) => {
    if (!inDateRange(row.createdAt) || (staffId !== 'all' && row.createdBy !== staffId)) return false;
    if (paymentFilter === 'all') return true;
    const invoice = row.invoiceId ? invoices.find((item) => item.id === row.invoiceId) : null;
    if (invoice?.paymentMethod === paymentFilter) return true;
    const refundEntry = cashbook.find((entry) => entry.referenceId === row.id);
    return Boolean(refundEntry && accountMatchesPayment(refundEntry.accountId));
  }), [cashAccounts, cashbook, fromDate, invoices, paymentFilter, salesReturns, staffId, toDate]);

  const filteredSales = useMemo(() => (reportSales ?? invoices.filter((row) => row.workflowStatus !== 'cancelled' && row.workflowStatus === 'closed' && inDateRange(row.createdAt) && (staffId === 'all' || row.createdBy === staffId)))
    .filter((row: any) => paymentFilter === 'all' || row.paymentMethod === paymentFilter), [fromDate, invoices, paymentFilter, reportSales, staffId, toDate]);

  const openReference = (detail: any) => {
    if (detail.type === 'sale') {
      navigate(`/app/invoices?invoiceId=${encodeURIComponent(detail.id)}`);
      return;
    }
    if (detail.type === 'purchase') {
      navigate(`/app/purchases?purchaseId=${encodeURIComponent(detail.id)}`);
      return;
    }
    if (detail.type === 'cash_income' || detail.type === 'cash_expense') {
      if (detail.category === 'Bán hàng' && detail.referenceId) navigate(`/app/invoices?invoiceId=${encodeURIComponent(detail.referenceId)}`);
      else if (detail.category === 'Hoàn tiền khách hàng' && detail.referenceId) navigate(`/app/returns?returnId=${encodeURIComponent(detail.referenceId)}`);
      else navigate('/app/cashbook');
      return;
    }
    navigate(detail.type === 'sales_return' ? `/app/returns?returnId=${encodeURIComponent(detail.id)}` : '/app/purchases');
  };

  const reportView = (searchParams.get('view') || 'daily') as 'daily' | 'sales' | 'inventory';
  const metrics = useMemo(() => {
    const reportSummary = staffReport.summary || {};
    const revenue = filteredSales.reduce((sum, row) => sum + Number(row.finalAmount || row.amount || 0), 0) - filteredReturns.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const collected = filteredSales.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0) - filteredReturns.reduce((sum, row) => sum + Number(row.refundAmount || 0), 0);
    return {
    revenue,
    collected,
    receivable: reportView === 'daily' && staffId === 'all' && typeof reportSummary.currentCustomerDebt === 'number'
      ? reportSummary.currentCustomerDebt
      : filteredSales.reduce((sum, row) => sum + effectiveDebt(row), 0),
    stockValue: productSummary.stockValue,
    purchaseValue: purchases.filter((row) => inDateRange(row.createdAt) && (!staffId || staffId === 'all' || row.createdBy === staffId)).reduce((sum, row) => sum + row.finalAmount, 0),
    cashIn: filteredCashbook.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0),
    cashOut: filteredCashbook.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  }, [filteredCashbook, filteredReturns, filteredSales, productSummary, purchases, reportView, staffId, staffReport]);

  const filteredMovements = useMemo(() => stockMovements.filter((row) => inDateRange(row.createdAt) && (staffId === 'all' || row.createdBy === staffId)), [fromDate, staffId, stockMovements, toDate]);
  const paymentSummary = useMemo(() => filteredSales.reduce<Record<string, number>>((result, row) => {
    const method = paymentLabel(row.paymentMethod);
    const amount = row.paymentMethod === 'debt' ? effectiveDebt(row) : Number(row.paidAmount || 0);
    result[method] = (result[method] || 0) + amount;
    return result;
  }, {}), [filteredSales]);
  const movementSummary = useMemo(() => filteredMovements.reduce((result, row) => {
    if (row.type === 'in') result.in += Number(row.quantity || 0);
    else if (row.type === 'out') result.out += Number(row.quantity || 0);
    else result.adjust += Number(row.quantity || 0);
    return result;
  }, { in: 0, out: 0, adjust: 0 }), [filteredMovements]);

  const changeReportView = (view: 'daily' | 'sales' | 'inventory') => {
    setSearchParams({ view });
  };

  const exportExcel = () => {
    const staffSheet = (staffReport.rows || []).map((row: any) => ({ 'Nhân viên': row.userName, 'Số đơn bán': row.salesCount, 'Doanh số bán': row.salesAmount, 'Trả khách': row.salesReturnAmount, 'Giá trị nhập': row.purchaseAmount, 'Trả NCC': row.purchaseReturnAmount, 'Tổng thu': row.cashIncome, 'Tổng chi': row.cashExpense, 'Ròng thu chi': row.netCash, 'Doanh số ròng': row.netSales }));
    const sales = filteredSales.map((row) => ({ Ngày: row.createdAt, 'Số chứng từ': row.documentNo || row.id, 'Người thực hiện': row.createdByName || 'Chưa xác định', 'Tổng tiền': row.finalAmount, 'Đã thu': row.paidAmount, 'Còn nợ': row.debtAmount }));
    const returnsSheet = filteredReturns.map((row) => ({ Ngày: row.createdAt, 'Số phiếu trả': row.documentNo || row.id, 'Hóa đơn liên quan': invoiceDisplayNo(row.invoiceId), 'Người thực hiện': row.createdByName || 'Chưa xác định', 'Tổng trả': row.totalAmount, 'Giảm công nợ': row.debtReduction, 'Đã hoàn tiền': row.refundAmount }));
    const purchasesSheet = purchases.filter((row) => inDateRange(row.createdAt) && (staffId === 'all' || row.createdBy === staffId)).map((row) => ({ Ngày: row.createdAt, 'Số phiếu': row.documentNo || row.id, 'Người thực hiện': row.createdByName || 'Chưa xác định', 'Tổng thanh toán': row.finalAmount, 'Đã trả': row.paidAmount, 'Còn nợ': row.payableAmount }));
    const cashSheet = filteredCashbook.map((row) => ({ Ngày: row.createdAt, Loại: row.type === 'income' ? 'Thu' : 'Chi', Nhóm: row.category, 'Chứng từ': row.referenceLabel || '', 'Nội dung': row.note, 'Người thu/chi': row.actorName || row.createdByName || 'Chưa xác định', 'Người tạo giao dịch': row.createdByName || 'Chưa xác định', 'Số tiền': row.amount }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(staffSheet), 'Theo nhân viên');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sales), 'Bán ra');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(returnsSheet), 'Trả hàng');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchasesSheet), 'Mua vào');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cashSheet), 'Thu chi');
    XLSX.writeFile(workbook, `hkdplus-bao-cao-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const reportTabs = [
    { id: 'daily' as const, label: 'Cuối ngày', icon: Wallet, description: 'Thu chi và tổng kết trong ngày' },
    { id: 'sales' as const, label: 'Bán hàng', icon: BarChart3, description: 'Hóa đơn, doanh thu và thực thu' },
    { id: 'inventory' as const, label: 'Hàng hóa', icon: Package, description: 'Nhập, xuất, tồn và điều chỉnh' },
  ];
  const metricCards = reportView === 'inventory'
    ? [['Giá trị tồn', metrics.stockValue], ['Mặt hàng', productSummary.total], ['Sắp hết', productSummary.lowStock], ['Nhập', movementSummary.in], ['Xuất', movementSummary.out], ['Điều chỉnh', movementSummary.adjust]]
    : reportView === 'sales'
      ? [['Doanh thu ròng', metrics.revenue], ['Trả khách', filteredReturns.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)], ['Thực thu ròng', metrics.collected], ['Phải thu trong kỳ', metrics.receivable], ['Số hóa đơn', filteredSales.length]]
      : [['Tổng thu', metrics.cashIn], ['Tổng chi', metrics.cashOut], ['Thu - chi', metrics.cashIn - metrics.cashOut], ['Doanh thu ròng', metrics.revenue], ['Công nợ hiện tại', metrics.receivable], ['Trả khách', filteredReturns.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)], ['Thực thu ròng', metrics.collected], ['Số hóa đơn', filteredSales.length]];

  return <div className="flex h-full flex-col overflow-hidden bg-slate-50">
    <header className="sticky top-0 z-40 flex shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm"><BarChart3 className="h-4 w-4" /></div><div className="mr-auto"><h1 className="text-base font-semibold leading-tight text-slate-900">Báo cáo</h1><p className="mt-0.5 text-[11px] leading-tight text-slate-500">{reportTabs.find((tab) => tab.id === reportView)?.description}</p></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Tải lại</Button><Button size="sm" variant="outline" onClick={exportExcel}><Download className="mr-1 h-3.5 w-3.5" />Xuất Excel</Button></header>
    <main className="flex-1 space-y-2 overflow-auto p-2 md:space-y-3 md:p-3">
      <nav className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1" aria-label="Loại báo cáo">{reportTabs.map((tab) => <button key={tab.id} type="button" onClick={() => changeReportView(tab.id)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium ${reportView === tab.id ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><tab.icon className="h-3.5 w-3.5" /><span className="truncate">{tab.label}</span></button>)}</nav>
      <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-5 md:p-3"><label className="text-xs text-slate-500">Từ ngày<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm" /></label><label className="text-xs text-slate-500">Đến ngày<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm" /></label><label className="text-xs text-slate-500">Nhân viên<select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm"><option value="all">Tất cả nhân viên</option>{(staffReport.rows || []).map((row: any) => <option key={row.userId} value={row.userId}>{row.userName}</option>)}</select></label><label className="text-xs text-slate-500">Phương thức<select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'cash' | 'transfer')} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm"><option value="all">Tất cả phương thức</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></label><Button variant="outline" className="self-end" onClick={() => { setFromDate(''); setToDate(''); setStaffId('all'); setPaymentFilter('all'); }}>Đặt lại bộ lọc</Button></section>
      <section className="grid grid-cols-2 gap-2 md:grid-cols-6">{metricCards.map(([label, value]) => { const isCount = (reportView === 'inventory' && String(label) !== 'Giá trị tồn') || String(label).includes('Số') || String(label) === 'Mặt hàng'; return <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{isCount ? value : formatCurrency(Number(value))}</p></div>; })}</section>

      {reportView === 'daily' && <>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Phương thức thanh toán</h2><p className="mt-1 text-xs text-slate-500">Đã thu theo phương thức; công nợ hiển thị số tiền khách còn phải trả.</p></div><div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">{Object.entries(paymentSummary).map(([label, value]) => <div key={label} className="rounded-md border border-slate-100 px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(Number(value))}</p></div>)}{!Object.keys(paymentSummary).length && <p className="col-span-full text-xs text-slate-500">Chưa có dữ liệu thanh toán.</p>}</div></section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Chứng từ bán trong kỳ</h2><p className="mt-1 text-xs text-slate-500">Đối chiếu trực tiếp từng hóa đơn với tổng hợp theo nhân viên.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Số hóa đơn</th><th className="px-3 py-2">Người thực hiện</th><th className="px-3 py-2">Phương thức</th><th className="px-3 py-2 text-right">Tổng tiền</th><th className="px-3 py-2 text-right">Đã thu</th><th className="px-3 py-2 text-right">Còn nợ</th></tr></thead><tbody>{filteredSales.slice(0, 200).map((row: any) => <tr key={row.id} className="border-b border-slate-100 hover:bg-sky-50"><td className="px-3 py-2 text-slate-500">{new Date(row.createdAt).toLocaleString('vi-VN')}</td><td className="px-3 py-2 font-mono"><button type="button" className="text-sky-700 hover:underline" onClick={() => openReference(row)}>{row.documentNo || row.id}</button></td><td className="px-3 py-2">{row.userName || row.createdByName || 'Chưa xác định'}</td><td className="px-3 py-2">{paymentLabel(row.paymentMethod)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.finalAmount ?? row.amount)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(row.paidAmount || 0)}</td><td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(effectiveDebt(row))}</td></tr>)}{!filteredSales.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Chưa có hóa đơn theo bộ lọc.</td></tr>}</tbody></table>{filteredSales.length > 200 && <p className="px-3 py-2 text-xs text-slate-500">Đang hiển thị 200 hóa đơn gần nhất; hãy xuất Excel để lấy đầy đủ dữ liệu.</p>}</div></section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Chứng từ trả hàng trong kỳ</h2><p className="mt-1 text-xs text-slate-500">Đối chiếu từng phiếu trả với hóa đơn liên quan và khoản hoàn tiền.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Số phiếu trả</th><th className="px-3 py-2">Hóa đơn liên quan</th><th className="px-3 py-2">Người thực hiện</th><th className="px-3 py-2 text-right">Tổng trả</th><th className="px-3 py-2 text-right">Giảm công nợ</th><th className="px-3 py-2 text-right">Đã hoàn tiền</th></tr></thead><tbody>{filteredReturns.slice(0, 200).map((row: any) => <tr key={row.id} className="border-b border-slate-100 hover:bg-orange-50"><td className="px-3 py-2 text-slate-500">{new Date(row.createdAt).toLocaleString('vi-VN')}</td><td className="px-3 py-2 font-mono"><button type="button" className="text-orange-700 hover:underline" onClick={() => openReference({ type: 'sales_return', id: row.id })}>{row.documentNo || row.id}</button></td><td className="px-3 py-2">{row.invoiceId ? <button type="button" className="text-sky-700 hover:underline" onClick={() => openReference({ type: 'sale', id: row.invoiceId })}>{invoiceDisplayNo(row.invoiceId)}</button> : <span className="text-slate-500">Không có hóa đơn</span>}</td><td className="px-3 py-2">{row.createdByName || 'Chưa xác định'}</td><td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-700">{formatCurrency(Number(row.totalAmount || 0))}</td><td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(Number(row.debtReduction || 0))}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(Number(row.refundAmount || 0))}</td></tr>)}{!filteredReturns.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Chưa có phiếu trả hàng theo bộ lọc.</td></tr>}</tbody></table>{filteredReturns.length > 200 && <p className="px-3 py-2 text-xs text-slate-500">Đang hiển thị 200 phiếu trả gần nhất; hãy xuất Excel để lấy đầy đủ dữ liệu.</p>}</div></section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Chứng từ thu / chi trong kỳ</h2><p className="mt-1 text-xs text-slate-500">Bao gồm giao dịch Sổ quỹ, tiền bán hàng, hoàn tiền và các khoản thu chi thủ công.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Loại</th><th className="px-3 py-2">Nội dung / chứng từ</th><th className="px-3 py-2">Tài khoản</th><th className="px-3 py-2">Người thu/chi</th><th className="px-3 py-2 text-right">Số tiền</th></tr></thead><tbody>{filteredCashbook.slice(0, 200).map((row: any) => <tr key={row.id} className="border-b border-slate-100 hover:bg-emerald-50"><td className="px-3 py-2 text-slate-500">{new Date(row.createdAt).toLocaleString('vi-VN')}</td><td className={`px-3 py-2 font-medium ${row.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{row.type === 'income' ? 'Thu' : 'Chi'}</td><td className="px-3 py-2"><p className="font-medium text-slate-800">{row.category || 'Khác'}</p>{row.referenceId && row.referenceLabel ? <button type="button" className="text-sky-700 hover:underline" onClick={() => openReference({ type: row.type === 'income' ? 'cash_income' : 'cash_expense', category: row.category, referenceId: row.referenceId, id: row.id })}>{row.referenceLabel}</button> : <p className="text-[11px] text-slate-500">{row.note || 'Không ghi chú'}</p>}</td><td className="px-3 py-2">{cashAccounts.find((account) => account.id === row.accountId)?.name || 'Chưa phân bổ'}</td><td className="px-3 py-2">{row.actorName || row.createdByName || 'Chưa xác định'}</td><td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{row.type === 'income' ? '+' : '-'}{formatCurrency(Number(row.amount || 0))}</td></tr>)}{!filteredCashbook.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Chưa có chứng từ thu/chi theo bộ lọc.</td></tr>}</tbody></table>{filteredCashbook.length > 200 && <p className="px-3 py-2 text-xs text-slate-500">Đang hiển thị 200 chứng từ gần nhất; hãy xuất Excel để lấy đầy đủ dữ liệu.</p>}</div></section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Tổng kết theo nhân viên</h2><p className="mt-1 text-xs text-slate-500">Hóa đơn hủy được loại trừ; phiếu trả và hoàn tiền vẫn được phản ánh.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Nhân viên</th><th className="px-3 py-2 text-right">Số đơn</th><th className="px-3 py-2 text-right">Doanh số</th><th className="px-3 py-2 text-right">Trả khách</th><th className="px-3 py-2 text-right">Nhập hàng</th><th className="px-3 py-2 text-right">Trả NCC</th><th className="px-3 py-2 text-right">Tổng thu</th><th className="px-3 py-2 text-right">Tổng chi</th><th className="px-3 py-2 text-right">Ròng</th></tr></thead><tbody>{(staffReport.rows || []).map((row: any) => <tr key={row.userId} className="border-b border-slate-100 hover:bg-sky-50"><td className="px-3 py-2 font-medium text-slate-800">{row.userName}</td><td className="px-3 py-2 text-right tabular-nums">{row.salesCount}</td><td className="px-3 py-2 text-right tabular-nums text-sky-700">{formatCurrency(row.salesAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(row.salesReturnAmount)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.purchaseAmount)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.purchaseReturnAmount)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(row.cashIncome)}</td><td className="px-3 py-2 text-right tabular-nums text-rose-700">{formatCurrency(row.cashExpense)}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(row.netCash)}</td></tr>)}{!(staffReport.rows || []).length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Chưa có dữ liệu theo bộ lọc.</td></tr>}</tbody></table></div></section>
      </>}

      {reportView === 'sales' && <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Tổng kết bán hàng</h2><p className="mt-1 text-xs text-slate-500">Hóa đơn đã chốt, phiếu trả và số liệu ròng theo bộ lọc.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Số hóa đơn</th><th className="px-3 py-2">Người thực hiện</th><th className="px-3 py-2">Phương thức</th><th className="px-3 py-2 text-right">Tổng tiền</th><th className="px-3 py-2 text-right">Đã thu</th><th className="px-3 py-2 text-right">Còn nợ</th></tr></thead><tbody>{filteredSales.slice(0, 100).map((row: any) => <tr key={row.id} className="border-b border-slate-100"><td className="px-3 py-2">{new Date(row.createdAt).toLocaleDateString('vi-VN')}</td><td className="px-3 py-2 font-mono"><button type="button" className="text-sky-700 hover:underline" onClick={() => openReference(row)}>{row.documentNo || row.id}</button></td><td className="px-3 py-2">{row.userName || row.createdByName || 'Chưa xác định'}</td><td className="px-3 py-2">{paymentLabel(row.paymentMethod)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.finalAmount ?? row.amount)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatCurrency(row.paidAmount || 0)}</td><td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(effectiveDebt(row))}</td></tr>)}{!filteredSales.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Chưa có hóa đơn theo bộ lọc.</td></tr>}</tbody></table></div></section>}

      {reportView === 'inventory' && <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-semibold text-slate-800">Lịch sử nhập, xuất, tồn</h2><p className="mt-1 text-xs text-slate-500">Theo dõi từng giao dịch kho và người thực hiện.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Sản phẩm</th><th className="px-3 py-2">Loại giao dịch</th><th className="px-3 py-2 text-right">Trước</th><th className="px-3 py-2 text-right">Sau</th><th className="px-3 py-2 text-right">Thay đổi</th><th className="px-3 py-2">Người thực hiện</th></tr></thead><tbody>{filteredMovements.slice(0, 100).map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-3 py-2 text-slate-500">{new Date(row.createdAt).toLocaleString('vi-VN')}</td><td className="px-3 py-2"><span className="block font-medium text-slate-800">{row.productName}</span><span className="text-[11px] text-slate-400">{row.productSku}</span></td><td className="px-3 py-2">{row.transactionType || row.note || 'Điều chỉnh kho'}</td><td className="px-3 py-2 text-right tabular-nums">{row.beforeStock}</td><td className="px-3 py-2 text-right tabular-nums">{row.afterStock}</td><td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.afterStock - row.beforeStock < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{row.afterStock - row.beforeStock > 0 ? '+' : ''}{row.afterStock - row.beforeStock}</td><td className="px-3 py-2">{row.actorName}</td></tr>)}{!filteredMovements.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Chưa có giao dịch kho theo bộ lọc.</td></tr>}</tbody></table></div></section>}

      {message && <p className="text-sm text-rose-600">{message}</p>}
    </main>
  </div>;
}
