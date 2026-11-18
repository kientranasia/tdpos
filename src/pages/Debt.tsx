import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { Search, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, ChevronRight, TrendingUp, X, Tags, Download } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { debtLedgerApi, customersApi, invoiceItemsApi, payableLedgerApi, supplierCreditsApi, suppliersApi } from '../lib/api';
import { DebtLedger } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Debt() {
  const { customers, refreshCustomers, activeTenant, invoices } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showDebtExportModal, setShowDebtExportModal] = useState(false);
  const [debtExportCustomerId, setDebtExportCustomerId] = useState('');
  const [debtExportFrom, setDebtExportFrom] = useState('');
  const [debtExportTo, setDebtExportTo] = useState('');
  const [exportingDebt, setExportingDebt] = useState(false);
  const [debtExportError, setDebtExportError] = useState('');
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ledgers, setLedgers] = useState<DebtLedger[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [expandedLedgerId, setExpandedLedgerId] = useState('');
  const [ledgerItems, setLedgerItems] = useState<Record<string, any[]>>({});
  const [formError, setFormError] = useState('');
  const [careFilter, setCareFilter] = useState<'all' | 'debt' | 'due_soon' | 'inactive_7' | 'inactive_30'>('all');
  const [debtTab, setDebtTab] = useState<'customer' | 'supplier'>(() => searchParams.get('type') === 'supplier' ? 'supplier' : 'customer');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierPayables, setSupplierPayables] = useState<any[]>([]);
  const [supplierCredits, setSupplierCredits] = useState<any[]>([]);
  const [loadingSupplierDebt, setLoadingSupplierDebt] = useState(false);
  const [supplierDebtError, setSupplierDebtError] = useState('');
  const [tagEditorCustomerId, setTagEditorCustomerId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [debtForm, setDebtForm] = useState({
    customerId: '',
    amount: 0,
    type: 'decrease' as 'increase' | 'decrease',
    note: '',
    payFull: false,
    sourceAccount: 'Tiền mặt',
  });

  const selectedDebtCustomer = useMemo(
    () => customers.find((customer) => customer.id === debtForm.customerId) || null,
    [customers, debtForm.customerId]
  );

  const customerDebtInvoices = useMemo(() => {
    if (!debtForm.customerId || debtForm.type !== 'decrease') return [];
    return invoices
      .filter((invoice) => invoice.customerId === debtForm.customerId && invoice.debtAmount > 0 && invoice.status !== 'completed')
      .map((invoice) => {
        const paidAgainstInvoice = ledgers
          .filter((entry) => entry.invoiceId === invoice.id && entry.type === 'decrease')
          .reduce((sum, entry) => sum + entry.amount, 0);
        return { invoice, remaining: Math.max(0, invoice.debtAmount - paidAgainstInvoice) };
      })
      .filter(({ remaining }) => remaining > 0)
      .sort((a, b) => new Date(a.invoice.createdAt).getTime() - new Date(b.invoice.createdAt).getTime());
  }, [debtForm.customerId, debtForm.type, invoices, ledgers]);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  const pickerCustomers = useMemo(() => {
    const query = normalizeSearchText(customerPickerSearch);
    return customers
      .filter((customer) => !query || normalizeSearchText(customer.name).includes(query) || normalizeSearchText(customer.phone).includes(query))
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }, [customerPickerSearch, customers]);

  const debtCustomers = useMemo(() => {
    return customers.filter(c => c.totalDebt > 0);
  }, [customers]);

  const supplierCreditBySupplier = useMemo(() => {
    const balances = new Map<string, number>();
    supplierCredits.forEach((entry) => balances.set(entry.supplierId, (balances.get(entry.supplierId) || 0) + (entry.type === 'increase' ? Number(entry.amount || 0) : -Number(entry.amount || 0))));
    return balances;
  }, [supplierCredits]);

  const filteredSupplierRows = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return suppliers
      .filter((supplier) => Number(supplier.currentPayable || 0) > 0)
      .filter((supplier) => !query || normalizeSearchText(`${supplier.code} ${supplier.name} ${supplier.phone || ''} ${supplier.taxCode || ''}`).includes(query))
      .sort((a, b) => Number(b.currentPayable || 0) - Number(a.currentPayable || 0));
  }, [searchTerm, suppliers]);

  const totalSupplierPayable = useMemo(() => suppliers.reduce((sum, supplier) => sum + Math.max(0, Number(supplier.currentPayable || 0)), 0), [suppliers]);
  const totalSupplierCredit = useMemo(() => {
    let total = 0;
    supplierCreditBySupplier.forEach((value) => { total += Math.max(0, Number(value)); });
    return total;
  }, [supplierCreditBySupplier]);
  const supplierLedgerEntries = useMemo(() => [
    ...supplierPayables.map((entry) => ({ ...entry, ledgerType: 'payable' as const })),
    ...supplierCredits.map((entry) => ({ ...entry, ledgerType: 'credit' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [supplierCredits, supplierPayables]);

  const totalDebtAmount = useMemo(() => {
    return debtCustomers.reduce((sum, c) => sum + c.totalDebt, 0);
  }, [debtCustomers]);

  const agingByCustomer = useMemo(() => {
    const decreasesByInvoice = new Map<string, number>();
    ledgers.filter((entry) => entry.type === 'decrease' && entry.invoiceId).forEach((entry) => {
      decreasesByInvoice.set(entry.invoiceId!, (decreasesByInvoice.get(entry.invoiceId!) || 0) + entry.amount);
    });
    const result = new Map<string, { current: number; days1to30: number; days31to60: number; over60: number }>();
    invoices.forEach((invoice) => {
      if (!invoice.customerId || invoice.workflowStatus === 'cancelled' || invoice.status === 'completed') return;
      const outstanding = Math.max(0, invoice.finalAmount - Number(invoice.paidAmount || 0) - (decreasesByInvoice.get(invoice.id) || 0));
      if (!outstanding) return;
      const ageDays = Math.max(0, Math.floor((Date.now() - new Date(invoice.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
      const bucket = result.get(invoice.customerId) || { current: 0, days1to30: 0, days31to60: 0, over60: 0 };
      if (ageDays <= 30) bucket.days1to30 += outstanding;
      else if (ageDays <= 60) bucket.days31to60 += outstanding;
      else bucket.over60 += outstanding;
      result.set(invoice.customerId, bucket);
    });
    return result;
  }, [invoices, ledgers]);

  const agingSummary = useMemo(() => {
    const summary = { days1to30: 0, days31to60: 0, over60: 0 };
    agingByCustomer.forEach((bucket) => {
      summary.days1to30 += bucket.days1to30;
      summary.days31to60 += bucket.days31to60;
      summary.over60 += bucket.over60;
    });
    return summary;
  }, [agingByCustomer]);

  const exportDebtCsv = () => {
    const rows = filteredDebtCustomers.map(({ customer, dueDate }) => {
      const aging = agingByCustomer.get(customer.id) || { days1to30: 0, days31to60: 0, over60: 0 };
      return [customer.name, customer.phone, customer.taxCode || '', customer.totalDebt, aging.days1to30, aging.days31to60, aging.over60, dueDate];
    });
    const csv = [['Khách hàng', 'Số điện thoại', 'MST', 'Còn nợ', '1-30 ngày', '31-60 ngày', 'Trên 60 ngày', 'Hạn thanh toán'], ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cong-no-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openDebtExportModal = () => {
    setDebtExportCustomerId(searchParams.get('customerId') || filteredDebtCustomers[0]?.customer.id || customers[0]?.id || '');
    setDebtExportFrom('');
    setDebtExportTo('');
    setDebtExportError('');
    setShowDebtExportModal(true);
  };

  const exportCustomerDebtExcel = async () => {
    if (!debtExportCustomerId) {
      setDebtExportError('Vui lòng chọn khách hàng.');
      return;
    }
    if (debtExportFrom && debtExportTo && debtExportFrom > debtExportTo) {
      setDebtExportError('Từ ngày không được lớn hơn đến ngày.');
      return;
    }

    setExportingDebt(true);
    setDebtExportError('');
    try {
      const statement = await customersApi.debtStatement(debtExportCustomerId, {
        from: debtExportFrom || undefined,
        to: debtExportTo || undefined,
      });
      const tenant = statement.tenant || activeTenant || {};
      const customer = statement.customer || customers.find((item) => item.id === debtExportCustomerId);
      if (!customer) throw new Error('Không tìm thấy khách hàng để xuất file.');

      const money = (value: unknown) => Number(value || 0);
      const dateText = (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { hour12: false });
      };
      const rangeText = `${debtExportFrom ? new Date(`${debtExportFrom}T00:00:00`).toLocaleDateString('vi-VN') : 'Tất cả'} đến ${debtExportTo ? new Date(`${debtExportTo}T00:00:00`).toLocaleDateString('vi-VN') : 'hiện tại'}`;
      const statementRows: any[][] = [
        [tenant.name || tenant.legalName || 'HKD Smart'],
        ['Chi nhánh', tenant.legalName || tenant.name || ''],
        ['Địa chỉ', tenant.address || ''],
        ['Điện thoại', tenant.phone || ''],
        [`Công nợ chi tiết khách hàng\nTừ ngày ${rangeText}`],
        ['Khách hàng', customer.name || '', '', '', '', '', 'Nợ đầu kỳ', money(statement.openingDebt)],
        ['Mã KH', customer.code || customer.id || '', '', '', '', '', 'Phát sinh trong kỳ', money(statement.periodDebit), money(statement.periodCredit)],
        ['Điện thoại', customer.phone || '', '', '', '', '', 'Nợ cuối kỳ', money(statement.closingDebt)],
        ...(customer.note ? [['Ghi chú khách hàng', customer.note]] : [[]]),
        [],
        ['Thời gian', 'Mã', 'Diễn giải', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền', 'Ghi nợ', 'Ghi có'],
      ];

      for (const row of statement.rows || []) {
        statementRows.push([
          dateText(row.createdAt),
          row.documentNo || '',
          row.description || '',
          row.unitName || '',
          row.quantity ?? '',
          row.unitPrice ?? '',
          '',
          money(row.debit) || '',
          money(row.credit) || '',
        ]);
        if (row.rowType === 'invoice') {
          for (const item of row.items || []) {
            statementRows.push([
              '',
              item.sku || item.productId || '',
              item.productName || '',
              item.unitName || '',
              item.quantity ?? '',
              money(item.price),
              money(item.total),
              '',
              '',
            ]);
          }
        }
      }

      const detailSheet = XLSX.utils.aoa_to_sheet(statementRows);
      detailSheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
        { s: { r: 1, c: 1 }, e: { r: 1, c: 8 } },
        { s: { r: 2, c: 1 }, e: { r: 2, c: 8 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 8 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 8 } },
        { s: { r: 5, c: 1 }, e: { r: 5, c: 5 } },
        { s: { r: 6, c: 1 }, e: { r: 6, c: 5 } },
        { s: { r: 7, c: 1 }, e: { r: 7, c: 5 } },
      ];
      detailSheet['!cols'] = [
        { wch: 20 }, { wch: 19 }, { wch: 43 }, { wch: 13 }, { wch: 8 }, { wch: 14 },
        { wch: 16 }, { wch: 16 }, { wch: 16 },
      ];
      detailSheet['!rows'] = statementRows.map((row, index) => ({ hpt: index === 4 ? 34 : index === 10 ? 26 : row.some((value) => String(value || '').includes('\n')) ? 30 : 20 }));

      const border = { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };
      for (let rowIndex = 0; rowIndex < statementRows.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < 9; columnIndex += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = detailSheet[address] as any;
          if (!cell) continue;
          cell.s = {
            font: { name: 'Arial', sz: rowIndex === 0 || rowIndex === 4 ? 12 : 10, bold: rowIndex === 0 || rowIndex === 4 || rowIndex === 10, color: { rgb: '1E293B' } },
            alignment: { vertical: 'center', wrapText: true, horizontal: columnIndex >= 4 && columnIndex <= 8 ? 'right' : 'left' },
            border: rowIndex >= 10 ? border : undefined,
            fill: rowIndex === 10 ? { fgColor: { rgb: 'E2E8F0' } } : undefined,
          };
          if (rowIndex === 0 || rowIndex === 4) cell.s.alignment.horizontal = 'center';
        }
      }
      for (let rowIndex = 5; rowIndex <= 7; rowIndex += 1) {
        for (const columnIndex of [0, 6]) {
          const cell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as any;
          if (cell) cell.s = { ...(cell.s || {}), font: { ...(cell.s?.font || {}), bold: true, color: { rgb: '334155' } } };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'CNCT');
      const safeCustomerName = String(customer.name || customer.id).replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
      XLSX.writeFile(workbook, `cong-no-chi-tiet-${safeCustomerName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setShowDebtExportModal(false);
    } catch (err) {
      setDebtExportError(err instanceof Error ? err.message : 'Không thể xuất file công nợ chi tiết.');
    } finally {
      setExportingDebt(false);
    }
  };

  const overdueDebtAmount = useMemo(() => {
    const maxDebtDays = activeTenant?.settings?.debtPolicy?.maxDebtDays || 30;
    const cutoff = Date.now() - maxDebtDays * 24 * 60 * 60 * 1000;
    const overIncreaseByCustomer = new Map<string, number>();
    const decreasesByCustomer = new Map<string, number>();

    ledgers.forEach((entry) => {
      const createdAt = new Date(entry.createdAt).getTime();
      if (entry.type === 'increase' && createdAt <= cutoff) {
        overIncreaseByCustomer.set(entry.customerId, (overIncreaseByCustomer.get(entry.customerId) || 0) + entry.amount);
      }
      if (entry.type === 'decrease') {
        decreasesByCustomer.set(entry.customerId, (decreasesByCustomer.get(entry.customerId) || 0) + entry.amount);
      }
    });

    return debtCustomers.reduce((sum, customer) => {
      const overIncrease = overIncreaseByCustomer.get(customer.id) || 0;
      const decreased = decreasesByCustomer.get(customer.id) || 0;
      const estimatedOverdue = Math.max(0, overIncrease - decreased);
      return sum + Math.min(estimatedOverdue, customer.totalDebt);
    }, 0);
  }, [activeTenant?.settings?.debtPolicy?.maxDebtDays, debtCustomers, ledgers]);

  const lastPurchaseByCustomer = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((invoice) => {
      if (!invoice.customerId) return;
      const existing = map.get(invoice.customerId);
      if (!existing || new Date(invoice.createdAt).getTime() > new Date(existing).getTime()) {
        map.set(invoice.customerId, invoice.createdAt);
      }
    });
    return map;
  }, [invoices]);

  const withDerivedFields = useMemo(() => {
    return customers.map((customer) => {
      const dueDate = estimateDueDateForCustomer(customer.id);
      const lastPurchase = lastPurchaseByCustomer.get(customer.id) || null;
      return { customer, dueDate, lastPurchase };
    });
  }, [customers, lastPurchaseByCustomer]);

  const filteredDebtCustomers = withDerivedFields
    .filter(({ customer, dueDate, lastPurchase }) => {
      const matchesSearch =
        normalizeSearchText(customer.name).includes(normalizeSearchText(searchTerm)) ||
        normalizeSearchText(customer.phone).includes(normalizeSearchText(searchTerm));
      if (!matchesSearch) return false;
      if (careFilter === 'all') return customer.totalDebt > 0;
      if (careFilter === 'debt') return customer.totalDebt > 0;
      if (careFilter === 'due_soon') {
        const due = new Date(dueDate).getTime();
        const now = Date.now();
        const in7Days = now + 7 * 24 * 60 * 60 * 1000;
        return customer.totalDebt > 0 && due >= now && due <= in7Days;
      }
      if (careFilter === 'inactive_7') {
        if (!lastPurchase) return true;
        return Date.now() - new Date(lastPurchase).getTime() >= 7 * 24 * 60 * 60 * 1000;
      }
      if (careFilter === 'inactive_30') {
        if (!lastPurchase) return true;
        return Date.now() - new Date(lastPurchase).getTime() >= 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    })
    .sort((a, b) => b.customer.totalDebt - a.customer.totalDebt);

  function estimateDueDateForCustomer(customerId: string) {
    const maxDebtDays = activeTenant?.settings?.debtPolicy?.maxDebtDays || 30;
    const latestIncrease = ledgers
      .filter((entry) => entry.customerId === customerId && entry.type === 'increase')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const base = latestIncrease ? new Date(latestIncrease.createdAt) : new Date();
    const due = new Date(base.getTime() + maxDebtDays * 24 * 60 * 60 * 1000);
    return due.toISOString().slice(0, 10);
  }

  const saveCustomerTags = async (customerId: string) => {
    if (!tagInput.trim()) return;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const existingTags = customer.tags || [];
    const nextTags = Array.from(new Set([...existingTags, ...tagInput.split(',').map((t) => t.trim()).filter(Boolean)]));
    setSavingTags(true);
    try {
      await customersApi.update(customerId, { tags: nextTags });
      await refreshCustomers();
      setTagInput('');
      setTagEditorCustomerId('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không lưu được tags.');
    } finally {
      setSavingTags(false);
    }
  };

  const openDebtModal = (type: 'increase' | 'decrease', customerId?: string) => {
    setDebtForm({
      customerId: customerId || searchParams.get('customerId') || debtCustomers[0]?.id || customers[0]?.id || '',
      amount: 0,
      type,
      note: type === 'decrease' ? 'Thu công nợ' : 'Điều chỉnh tăng công nợ',
      payFull: false,
      sourceAccount: 'Tiền mặt',
    });
    setCustomerPickerSearch('');
    setSelectedInvoiceIds([]);
    setShowDebtModal(true);
  };

  const handleSubmitDebt = async () => {
    setFormError('');
    if (!debtForm.customerId || debtForm.amount <= 0) {
      setFormError('Vui lòng chọn khách hàng và nhập số tiền hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      const amountToCollect = debtForm.payFull && debtForm.type === 'decrease' && selectedDebtCustomer
        ? selectedDebtCustomer.totalDebt
        : debtForm.amount;
      const note = [debtForm.note.trim(), debtForm.sourceAccount ? `Nguồn: ${debtForm.sourceAccount}` : ''].filter(Boolean).join(' · ');
      const allocations: Array<{ invoiceId: string | null; amount: number }> = [];
      let remainingAmount = amountToCollect;
      for (const invoiceId of selectedInvoiceIds) {
        const bill = customerDebtInvoices.find(({ invoice }) => invoice.id === invoiceId);
        if (!bill || remainingAmount <= 0) continue;
        const allocation = Math.min(remainingAmount, bill.remaining);
        if (allocation > 0) allocations.push({ invoiceId, amount: allocation });
        remainingAmount -= allocation;
      }
      if (allocations.length === 0) allocations.push({ invoiceId: null, amount: amountToCollect });
      const createdEntries = await Promise.all(allocations.map(({ invoiceId, amount }) => debtLedgerApi.create({
        customerId: debtForm.customerId,
        amount,
        type: debtForm.type,
        note,
        invoiceId,
      })));
      setLedgers((prev) => [...createdEntries.reverse(), ...prev]);
      await refreshCustomers();
      setShowDebtModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu giao dịch công nợ.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLedgerDetails = async (entry: DebtLedger) => {
    if (!entry.invoiceId) return;
    if (expandedLedgerId === entry.id) {
      setExpandedLedgerId('');
      return;
    }
    setExpandedLedgerId(entry.id);
    if (!ledgerItems[entry.invoiceId]) {
      try {
        const items = await invoiceItemsApi.list(entry.invoiceId);
        setLedgerItems((prev) => ({ ...prev, [entry.invoiceId as string]: items }));
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Không thể tải chi tiết bill.');
      }
    }
  };

  useEffect(() => {
    const targetCustomer = searchParams.get('customerId');
    const queryFilter = searchParams.get('careFilter');
    if (queryFilter && ['all', 'debt', 'due_soon', 'inactive_7', 'inactive_30'].includes(queryFilter)) {
      setCareFilter(queryFilter as typeof careFilter);
    }
    if (targetCustomer) {
      openDebtModal('decrease', targetCustomer);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadLedgers = async () => {
      setLoadingLedgers(true);
      try {
        const data = await debtLedgerApi.list();
        setLedgers(data);
      } catch (err) {
        console.error('Failed to load debt ledger:', err);
      } finally {
        setLoadingLedgers(false);
      }
    };
    loadLedgers();
  }, []);

  useEffect(() => {
    const loadSupplierDebt = async () => {
      setLoadingSupplierDebt(true);
      setSupplierDebtError('');
      try {
        const [supplierRows, payableRows, creditRows] = await Promise.all([
          suppliersApi.list(),
          payableLedgerApi.list(),
          supplierCreditsApi.list(),
        ]);
        setSuppliers(supplierRows);
        setSupplierPayables(payableRows);
        setSupplierCredits(creditRows);
      } catch (err) {
        setSupplierDebtError(err instanceof Error ? err.message : 'Không thể tải công nợ nhà cung cấp.');
      } finally {
        setLoadingSupplierDebt(false);
      }
    };
    void loadSupplierDebt();
  }, []);

  return (
    <div className="erp-compact flex h-full flex-col overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      {showDebtExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl space-y-5 rounded-xl border border-white bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-section-title">Xuất công nợ chi tiết Excel</h3>
                <p className="mt-1 text-xs text-slate-500">Bố cục CNCT theo file mẫu, gồm từng đơn hàng, dòng sản phẩm, ghi chú và người thực hiện.</p>
              </div>
              <button type="button" onClick={() => setShowDebtExportModal(false)} aria-label="Đóng popup" className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                <X className="mx-auto h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Khách hàng</label>
              <select value={debtExportCustomerId} onChange={(event) => setDebtExportCustomerId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
                <option value="">Chọn khách hàng</option>
                {customers.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone || 'Chưa có SĐT'} · Nợ {formatCurrency(customer.totalDebt)}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Từ ngày</label>
                <Input type="date" value={debtExportFrom} onChange={(event) => setDebtExportFrom(event.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Đến ngày</label>
                <Input type="date" value={debtExportTo} onChange={(event) => setDebtExportTo(event.target.value)} className="h-11" />
              </div>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-xs leading-5 text-sky-800">
              File sẽ có 2 sheet: <strong>CNCT</strong> theo mẫu cũ và <strong>Tổng hợp đơn hàng</strong>. Ghi chú chỉ xuất khi có dữ liệu; ghi chú từng sản phẩm được đặt ngay trên dòng sản phẩm tương ứng.
            </div>
            {debtExportError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{debtExportError}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowDebtExportModal(false)} className="h-10 px-4">Hủy</Button>
              <Button type="button" onClick={exportCustomerDebtExcel} disabled={exportingDebt || !debtExportCustomerId} className="h-10 bg-emerald-600 px-4 hover:bg-emerald-700">
                <Download className="mr-2 h-4 w-4" />{exportingDebt ? 'Đang tạo file...' : 'Xuất Excel chi tiết'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDebtModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="my-2 flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white bg-white shadow-2xl sm:my-6 sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex items-center justify-between">
              <h3 className="text-section-title px-6 pt-5">
                {debtForm.type === 'decrease' ? 'Thu công nợ' : 'Tăng công nợ'}
              </h3>
              <button
                onClick={() => setShowDebtModal(false)}
                aria-label="Đóng popup"
                className="mr-5 mt-5 h-9 w-9 rounded-lg bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6 pt-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label>Khách hàng</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input value={customerPickerSearch} onChange={(e) => setCustomerPickerSearch(e.target.value)} className="h-11 pl-9" placeholder="Tìm theo tên hoặc số điện thoại..." />
                  </div>
                  <select
                    value={debtForm.customerId}
                    onChange={(e) => {
                      setDebtForm((prev) => ({ ...prev, customerId: e.target.value, amount: 0, payFull: false }));
                      setSelectedInvoiceIds([]);
                    }}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  >
                    {pickerCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.phone} · Nợ {formatCurrency(customer.totalDebt)}</option>)}
                  </select>
                </div>

                {debtForm.type === 'decrease' && selectedDebtCustomer && (
                  <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">Công nợ hiện tại</p>
                      <p className="text-lg font-bold text-sky-700">{formatCurrency(selectedDebtCustomer.totalDebt)}</p>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={debtForm.payFull} onChange={(e) => setDebtForm((prev) => ({ ...prev, payFull: e.target.checked, amount: e.target.checked ? selectedDebtCustomer.totalDebt : prev.amount, note: e.target.checked ? 'Thanh toán hết công nợ' : prev.note }))} />
                      Thanh toán hết công nợ
                    </label>
                  </div>
                )}

                {debtForm.type === 'decrease' && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div><p className="text-sm font-semibold text-slate-800">Bill còn nợ</p><p className="text-xs text-slate-500">Chọn bill liên quan đến khoản thu</p></div>
                      <button type="button" className="text-xs font-semibold text-sky-700 hover:underline" onClick={() => setSelectedInvoiceIds(customerDebtInvoices.map(({ invoice }) => invoice.id))}>Chọn tất cả</button>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {customerDebtInvoices.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">Chưa có bill nợ chi tiết.</p> : customerDebtInvoices.map(({ invoice, remaining }) => (
                        <label key={invoice.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                          <input type="checkbox" checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => setSelectedInvoiceIds((prev) => prev.includes(invoice.id) ? prev.filter((id) => id !== invoice.id) : [...prev, invoice.id])} />
                          <span className="min-w-0 flex-1"><span role="link" tabIndex={0} className="block text-sm font-semibold text-sky-700 hover:underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(`/app/invoices?invoiceId=${encodeURIComponent(invoice.id)}`); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); navigate(`/app/invoices?invoiceId=${encodeURIComponent(invoice.id)}`); } }}>{invoice.documentNo || invoice.id}</span><span className="block text-xs text-slate-500">{new Date(invoice.createdAt).toLocaleDateString('vi-VN')} · {invoice.status === 'partial' ? 'Thanh toán một phần' : 'Chưa thanh toán'}</span></span>
                          <span className="text-sm font-bold tabular-nums text-orange-700">{formatCurrency(remaining)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="space-y-2"><label>Số tiền thu</label><Input type="number" min={1} value={debtForm.amount || ''} disabled={debtForm.type === 'decrease' && debtForm.payFull} onChange={(e) => setDebtForm((prev) => ({ ...prev, amount: Number(e.target.value) }))} className="h-12 bg-slate-50 text-lg font-bold" placeholder="Nhập số tiền" /></div>
                  <div className="space-y-2"><label>Tài khoản nhận tiền</label><select value={debtForm.sourceAccount} onChange={(e) => setDebtForm((prev) => ({ ...prev, sourceAccount: e.target.value }))} className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><option>Tiền mặt</option><option>Chuyển khoản ngân hàng</option><option>Ví điện tử</option></select></div>
                </div>
                {selectedInvoiceIds.length > 0 && <p className="text-xs text-slate-500">Đã chọn {selectedInvoiceIds.length} bill · Tổng bill: <span className="font-semibold text-slate-700">{formatCurrency(customerDebtInvoices.filter(({ invoice }) => selectedInvoiceIds.includes(invoice.id)).reduce((sum, item) => sum + item.remaining, 0))}</span></p>}
                <div className="space-y-2"><label>Ghi chú</label><textarea value={debtForm.note} onChange={(e) => setDebtForm((prev) => ({ ...prev, note: e.target.value }))} className="min-h-32 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Nội dung giao dịch, người nộp tiền, diễn giải..." /></div>
                {formError && <p className="text-sm text-rose-600">{formError}</p>}
                <Button onClick={handleSubmitDebt} disabled={submitting} className={`h-12 w-full rounded-lg text-sm font-semibold ${debtForm.type === 'decrease' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-orange-600 hover:bg-orange-700'}`}>{submitting ? 'Đang lưu...' : 'Lưu giao dịch'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tagEditorCustomerId && (
        <div className="fixed inset-0 z-[109] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-white bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-section-title">Tag khách hàng</h3>
              <button onClick={() => setTagEditorCustomerId('')} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Nhập tag, ngăn cách bằng dấu phẩy. Ví dụ: VIP, Nợ quá hạn, Lâu chưa mua</p>
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="h-11 rounded-lg bg-slate-50 border-none font-semibold" />
            <Button onClick={() => saveCustomerTags(tagEditorCustomerId)} disabled={savingTags} className="w-full h-11 rounded-lg">
              {savingTags ? 'Đang lưu...' : 'Lưu tag'}
            </Button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 flex shrink-0 flex-col items-start justify-between gap-2 border-b border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-600 text-white">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900">Công nợ</h1>
            <p className="text-[11px] text-slate-500">{debtTab === 'customer' ? `${debtCustomers.length} khách nợ` : `${filteredSupplierRows.length} nhà cung cấp còn nợ`}</p>
          </div>
          <div className="ml-2 flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <button type="button" onClick={() => setDebtTab('customer')} className={`h-7 rounded px-2.5 text-xs font-medium ${debtTab === 'customer' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>Khách hàng</button>
            <button type="button" onClick={() => setDebtTab('supplier')} className={`h-7 rounded px-2.5 text-xs font-medium ${debtTab === 'supplier' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>Nhà cung cấp</button>
          </div>
        </div>
        
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3">
          <div className="relative group w-full flex-1 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-orange-600 transition-colors" />
            <Input 
              className="h-9 lg:h-10 rounded-lg border-none bg-slate-100/70 pl-9 shadow-inner focus:ring-2 focus:ring-orange-500/20 transition-all font-medium text-sm placeholder:text-slate-400"
              placeholder={debtTab === 'customer' ? 'Tìm khách nợ...' : 'Tìm nhà cung cấp...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
            {debtTab === 'customer' && <select value={careFilter} onChange={(e) => setCareFilter(e.target.value as typeof careFilter)} className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option value="all">Còn nợ</option><option value="due_soon">Sắp đến hạn</option><option value="inactive_7">7 ngày chưa mua</option><option value="inactive_30">30 ngày chưa mua</option></select>}
            {debtTab === 'customer' && <Button onClick={() => openDebtModal('decrease')} className="h-8 rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700"><ArrowDownCircle className="mr-1.5 h-3.5 w-3.5" />Thu nợ</Button>}
            {debtTab === 'customer' && <Button variant="outline" onClick={exportDebtCsv} className="h-8 rounded-md px-3 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Xuất CSV tổng hợp</Button>}
          </div>
        </div>
      </div>

      {debtTab === 'customer' ? (
        <div className="flex-1 overflow-y-auto space-y-4 p-4 lg:space-y-5 lg:p-6">
        
        {/* Debt Summary Cards */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70 text-sky-700"><TrendingUp className="h-4 w-4" /></div><div><p className="text-[11px] text-sky-700">Tổng dư nợ khách hàng</p><p className="text-lg font-semibold tabular-nums text-sky-800">{formatCurrency(totalDebtAmount)}</p></div></div></div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70 text-orange-700"><AlertCircle className="h-4 w-4" /></div><div><p className="text-[11px] text-orange-700">Khoản nợ quá hạn</p><p className="text-lg font-semibold tabular-nums text-orange-800">{formatCurrency(overdueDebtAmount)}</p></div></div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] text-slate-500">Thao tác công nợ</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => openDebtModal('decrease')} className="flex h-8 items-center justify-center gap-1 rounded-md border border-sky-100 bg-sky-50 text-xs font-medium text-sky-700 hover:bg-sky-100"><ArrowDownCircle className="h-3.5 w-3.5" />Giảm nợ</button><button type="button" onClick={() => openDebtModal('increase')} className="flex h-8 items-center justify-center gap-1 rounded-md border border-orange-100 bg-orange-50 text-xs font-medium text-orange-700 hover:bg-orange-100"><ArrowUpCircle className="h-3.5 w-3.5" />Tăng nợ</button></div></div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="border-r border-slate-100 px-2">
            <p className="text-[11px] text-slate-500">1–30 ngày</p>
            <p className="mt-1 text-sm font-semibold text-amber-600">{formatCurrency(agingSummary.days1to30)}</p>
          </div>
          <div className="border-r border-slate-100 px-2">
            <p className="text-[11px] text-slate-500">31–60 ngày</p>
            <p className="mt-1 text-sm font-semibold text-orange-600">{formatCurrency(agingSummary.days31to60)}</p>
          </div>
          <div className="px-2">
            <p className="text-[11px] text-slate-500">Trên 60 ngày</p>
            <p className="mt-1 text-sm font-semibold text-rose-600">{formatCurrency(agingSummary.over60)}</p>
          </div>
        </div>

        {/* Debt List */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div><h3 className="text-sm font-semibold text-slate-900">Khách hàng còn nợ</h3><p className="text-[11px] text-slate-500">Sắp xếp theo số dư công nợ cao nhất</p></div>
            </div>

            <div className="divide-y divide-slate-50">
                {filteredDebtCustomers.map(({ customer, dueDate, lastPurchase }) => (
                  <div
                    key={customer.id}
                    className="erp-debt-row cursor-pointer p-2.5 transition-all group hover:bg-orange-50/30"
                    onClick={() => navigate(`/app/customers/${customer.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-300 transition-all duration-300 group-hover:bg-orange-600 group-hover:text-white">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate text-xs font-semibold text-slate-900">{customer.name}</h4>
                            <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">Nợ</span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-500">{customer.phone}</p>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                            <span>Hạn: {new Date(dueDate).toLocaleDateString('vi-VN')}</span>
                            <span>Mua: {lastPurchase ? new Date(lastPurchase).toLocaleDateString('vi-VN') : 'Chưa có'}</span>
                          </div>
                          {!!customer.tags?.length && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {customer.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-500">Dư nợ</p>
                        <div className="text-sm font-semibold tabular-nums text-orange-600">{formatCurrency(customer.totalDebt)}</div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagEditorCustomerId(customer.id);
                          setTagInput((customer.tags || []).join(', '));
                        }}
                        variant="outline"
                        className="h-8 rounded-md border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Tags className="h-3.5 w-3.5 mr-1" /> Tag
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDebtModal('decrease', customer.id);
                        }}
                        className="h-8 rounded-md bg-sky-600 px-3 text-xs font-medium hover:bg-sky-700"
                      >
                        Thu nợ
                      </Button>
                      <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-slate-300 transition-all group-hover:bg-orange-600 group-hover:text-white">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                ))}

                {filteredDebtCustomers.length === 0 && (
                    <div className="space-y-2 p-10 text-center">
                         <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-100">
                            <CheckCircle className="h-6 w-6 opacity-20" />
                         </div>
                         <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">Danh sách công nợ trống</p>
                            <p className="text-[11px] text-slate-400">Tất cả khách hàng đã thanh toán đầy đủ</p>
                         </div>
                    </div>
                )}
            </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center border-b border-slate-100 bg-slate-50/60 px-3 py-2.5"><h3 className="text-sm font-semibold text-slate-900">Lịch sử công nợ khách hàng</h3></div>
          <div className="divide-y divide-slate-50">
            {loadingLedgers && (
              <div className="p-6 text-sm text-slate-500">Đang tải lịch sử...</div>
            )}
            {!loadingLedgers && ledgers.slice(0, 12).map((entry) => {
              const customer = customers.find((c) => c.id === entry.customerId);
              const invoice = entry.invoiceId ? invoices.find((item) => item.id === entry.invoiceId) : null;
              const details = entry.invoiceId ? ledgerItems[entry.invoiceId] : null;
              return (
                <div key={entry.id} className="border-b border-slate-50 last:border-0">
                  <button type="button" onClick={() => toggleLedgerDetails(entry)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-xs font-semibold text-slate-900"><span role="link" tabIndex={0} className="cursor-pointer hover:text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); navigate(`/app/customers/${entry.customerId}`); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); navigate(`/app/customers/${entry.customerId}`); } }}>{customer?.name || entry.customerId}</span></p>
                      <p className="truncate text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleString('vi-VN')} · {entry.note || 'Không có ghi chú'} · {entry.createdByName || entry.createdBy || 'Không rõ người thực hiện'}{invoice ? <> · <span role="link" tabIndex={0} className="cursor-pointer text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); navigate(`/app/invoices?invoiceId=${encodeURIComponent(invoice.id)}`); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); navigate(`/app/invoices?invoiceId=${encodeURIComponent(invoice.id)}`); } }}>{invoice.documentNo || invoice.id}</span></> : null}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className={`text-xs font-semibold ${entry.type === 'increase' ? 'text-orange-600' : 'text-sky-600'}`}>{entry.type === 'increase' ? '+' : '-'} {formatCurrency(entry.amount)}</div>
                      {entry.invoiceId && <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expandedLedgerId === entry.id ? 'rotate-90' : ''}`} />}
                    </div>
                  </button>
                  {expandedLedgerId === entry.id && entry.invoiceId && (
                    <div className="mx-3 mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs">
                      <p className="mb-1 font-semibold text-slate-700">Chi tiết {invoice?.documentNo || 'bill'}</p>
                      {!details ? <p className="text-slate-500">Đang tải chi tiết...</p> : details.length === 0 ? <p className="text-slate-500">Bill chưa có dòng hàng.</p> : details.map((item) => <div key={item.id} className="flex justify-between gap-3 border-t border-slate-200/70 py-1.5"><button type="button" className="truncate text-left text-slate-600 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{item.productName} × {item.quantity}</button><span className="shrink-0 font-medium text-slate-700">{formatCurrency(item.total || item.price * item.quantity)}</span></div>)}
                    </div>
                  )}
                </div>
              );
            })}
            {!loadingLedgers && ledgers.length === 0 && (
              <div className="p-6 text-sm text-slate-500">Chưa có giao dịch công nợ.</div>
            )}
          </div>
        </div>

        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 p-3 lg:p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] text-amber-700">Tổng phải trả NCC</p><p className="mt-1 text-lg font-semibold tabular-nums text-amber-800">{formatCurrency(totalSupplierPayable)}</p><p className="mt-0.5 text-[11px] text-amber-700">{suppliers.filter((supplier) => Number(supplier.currentPayable || 0) > 0).length} nhà cung cấp còn nợ</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] text-slate-500">Tổng giao dịch công nợ</p><p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{supplierLedgerEntries.length}</p><p className="mt-0.5 text-[11px] text-slate-500">Nhập hàng, thanh toán và trả hàng</p></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] text-emerald-700">Số dư được nhận</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800">{formatCurrency(totalSupplierCredit)}</p><p className="mt-0.5 text-[11px] text-emerald-700">Số dư từ phiếu trả nhà cung cấp</p></div>
          </div>

          {supplierDebtError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{supplierDebtError}</p>}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2.5"><div><h2 className="text-sm font-semibold text-slate-900">Nhà cung cấp còn phải trả</h2><p className="text-[11px] text-slate-500">Sắp xếp theo số dư công nợ cao nhất</p></div><Button size="sm" variant="outline" onClick={() => navigate('/app/suppliers')} className="h-8 rounded-md px-2.5 text-xs">Quản lý NCC</Button></div><div className="divide-y divide-slate-100">{loadingSupplierDebt ? <p className="px-3 py-8 text-center text-xs text-slate-500">Đang tải công nợ nhà cung cấp...</p> : filteredSupplierRows.length ? filteredSupplierRows.map((supplier) => <button key={supplier.id} type="button" onClick={() => navigate(`/app/suppliers/${supplier.id}`)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-amber-50/50"><div className="flex min-w-0 items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700"><Wallet className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{supplier.name}</p><p className="truncate text-[11px] text-slate-500">{supplier.code} · {supplier.phone || 'Chưa có SĐT'}</p></div></div><div className="shrink-0 text-right"><p className="text-xs font-semibold tabular-nums text-amber-700">{formatCurrency(supplier.currentPayable || 0)}</p><p className="text-[11px] text-slate-500">{supplierCreditBySupplier.get(supplier.id) > 0 ? `Được nhận ${formatCurrency(supplierCreditBySupplier.get(supplier.id) || 0)}` : 'Công nợ phải trả'}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /></button>) : <div className="px-3 py-10 text-center"><CheckCircle className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-2 text-xs font-medium text-slate-500">Không có nhà cung cấp còn công nợ.</p></div>}</div></section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2.5"><h2 className="text-sm font-semibold text-slate-900">Lịch sử công nợ NCC</h2><span className="text-[11px] text-slate-500">{supplierLedgerEntries.length} giao dịch</span></div><div className="divide-y divide-slate-100">{loadingSupplierDebt ? <p className="px-3 py-8 text-center text-xs text-slate-500">Đang tải lịch sử...</p> : supplierLedgerEntries.length ? supplierLedgerEntries.slice(0, 20).map((entry) => { const supplier = suppliers.find((row) => row.id === entry.supplierId); const increase = entry.type === 'increase'; const credit = entry.ledgerType === 'credit'; return <div key={`${entry.ledgerType}-${entry.id}`} className="flex items-center justify-between gap-2 px-3 py-2"><div className="min-w-0"><button type="button" className="block truncate text-left text-xs font-medium text-slate-700 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/suppliers/${entry.supplierId}`)}>{supplier?.name || entry.supplierId}</button><p className="truncate text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleDateString('vi-VN')} · {entry.note || (credit ? 'Số dư được nhận' : increase ? 'Tăng công nợ' : 'Giảm công nợ')}{entry.purchaseId ? <> · <button type="button" className="text-sky-700 hover:underline" onClick={() => navigate(`/app/purchases?purchaseId=${encodeURIComponent(entry.purchaseId)}`)}>Mở phiếu nhập</button></> : null}</p></div><span className={`shrink-0 text-xs font-medium tabular-nums ${credit ? 'text-emerald-700' : increase ? 'text-amber-700' : 'text-emerald-700'}`}>{increase ? '+' : '-'}{formatCurrency(entry.amount || 0)}</span></div>; }) : <p className="px-3 py-10 text-center text-xs text-slate-500">Chưa có giao dịch công nợ nhà cung cấp.</p>}</div></section>
          </div>
        </div>
      )}
    </div>
  );
}
