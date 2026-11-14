import React, { ForwardedRef, forwardRef, useEffect } from 'react';
import { Invoice, InvoiceItem, Customer, Tenant } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { getInvoiceReceiptSummary } from '../../lib/invoiceReceipt';
import { Button } from '../ui/Button';
import { X, Download, Printer } from 'lucide-react';
import BrandMark from '../BrandMark';

const invoiceItemDiscountAmount = (item: InvoiceItem) => {
  const subtotal = Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0);
  if (item.discountMode === 'amount') {
    return Math.min(subtotal, Math.max(0, Number(item.discountAmount) || 0));
  }
  if (item.discountMode === 'percent') {
    const percent = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
    return Math.min(subtotal, subtotal * percent / 100);
  }

  // Older invoices only stored the net line total. Keep their printed CK accurate.
  return Math.min(subtotal, Math.max(0, subtotal - (Number(item.total) || 0)));
};

interface POSInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastInvoiceId: string;
  activeTenant: Tenant | null;
  selectedCustomer: Customer | null;
  paymentMethod: string;
  currentInvoiceItems: InvoiceItem[];
  currentInvoice: Invoice | null;
  currentUserName?: string | null;
  onExportImage: () => void;
  onPrint: () => void | Promise<void>;
}

const InvoiceContent = forwardRef(({ 
  lastInvoiceId, 
  activeTenant, 
  selectedCustomer, 
  paymentMethod, 
  currentInvoiceItems, 
  currentInvoice,
  currentUserName
}: Omit<POSInvoiceModalProps, 'isOpen' | 'onClose' | 'onExportImage' | 'onPrint'>, ref: ForwardedRef<HTMLDivElement>) => (
  <div id="printable-invoice" ref={ref} className={`mx-auto min-h-fit max-w-full rounded-lg border border-slate-100 bg-white shadow-sm print:border-none print:shadow-none ${activeTenant?.settings?.invoice?.printSize === 'receipt_80mm' ? 'w-[302px] p-4' : 'p-8'}`}>
    {(() => {
      const receipt = getInvoiceReceiptSummary(currentInvoice || { totalAmount: 0, discount: 0, finalAmount: 0, paidAmount: 0, debtAmount: 0 });
      const invoiceSettings = activeTenant?.settings?.invoice;
      const storeTitle = invoiceSettings?.storeDisplayName || activeTenant?.name || 'Cửa hàng';
      const showAddress = invoiceSettings?.showAddress ?? true;
      const showPhone = invoiceSettings?.showPhone ?? true;
      const showCustomerPhone = invoiceSettings?.showCustomerPhone ?? true;
      const showOperator = invoiceSettings?.showOperator ?? true;
      const showOrderNote = invoiceSettings?.showOrderNote ?? true;
      const footerNote = invoiceSettings?.footerNote || 'Cảm ơn quý khách và hẹn gặp lại.';
      return (
        <>
    <div className="text-center mb-10">
      <BrandMark className="mb-3" />
      <h4 className="text-2xl font-black text-slate-900 font-display tracking-tight leading-none mb-2">{storeTitle}</h4>
      {showAddress && <p className="text-[11px] text-slate-500">{activeTenant?.address}</p>}
      {showPhone && <p className="text-[11px] text-slate-500">Hotline: {activeTenant?.phone}</p>}
      {invoiceSettings?.headerLine1 && <p className="text-[11px] text-slate-500">{invoiceSettings.headerLine1}</p>}
      {invoiceSettings?.headerLine2 && <p className="text-[11px] text-slate-500">{invoiceSettings.headerLine2}</p>}
      <div className="h-px bg-slate-200 w-full my-4"></div>
      <h5 className="text-base font-bold text-slate-900 uppercase tracking-wide">HÓA ĐƠN BÁN HÀNG</h5>
      <p className="text-[11px] text-slate-500 mt-1">{new Date(currentInvoice?.createdAt || Date.now()).toLocaleString('vi-VN')}</p>
      <p className="text-[11px] text-slate-500 mt-1">Mã hóa đơn: {lastInvoiceId}</p>
    </div>

    <div className="space-y-2 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
      <div className="flex justify-between items-center">
        <span className="text-slate-500 text-xs">Khách hàng:</span>
        <span className="text-slate-900 font-semibold text-sm">{selectedCustomer?.name || 'Khách lẻ'}</span>
      </div>
      {showCustomerPhone && selectedCustomer?.phone && (
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-xs">Số điện thoại:</span>
          <span className="text-slate-900 font-semibold text-sm">{selectedCustomer.phone}</span>
        </div>
      )}
      {showOperator && (
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-xs">Thu ngân:</span>
          <span className="text-slate-900 font-semibold text-sm">{currentUserName || currentInvoice?.createdByName || currentInvoice?.createdBy || 'N/A'}</span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <span className="text-slate-500 text-xs">Thanh toán:</span>
        <span className="text-slate-900 font-semibold text-sm">
          {paymentMethod === 'cash' ? 'Tiền mặt' : paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ'}
        </span>
      </div>
    </div>

    <div className="mb-4 space-y-1">
      <div className="grid grid-cols-[minmax(0,1fr)_56px_24px_42px_72px] gap-1 border-b border-slate-200 pb-1 text-left text-[9px] font-semibold leading-tight text-slate-600">
        <div aria-hidden="true" />
        <div>Đơn giá</div>
        <div>SL</div>
        <div>CK</div>
        <div className="text-right">TT</div>
      </div>
      {currentInvoiceItems.map(item => (
        <div key={item.id} className="border-b border-dashed border-slate-100 py-1.5 text-left text-[9px] leading-tight last:border-b-0">
          <div className="break-words font-semibold text-slate-900">
            {item.productName}
            {item.unitName?.trim() && <span className="font-medium text-slate-700"> - ({item.unitName.trim()})</span>}
          </div>
          {item.note?.trim() && <div className="mt-0.5 break-words text-sky-800">Ghi chú: {item.note.trim()}</div>}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_56px_24px_42px_72px] items-baseline gap-1 text-slate-700">
            <div />
            <div className="whitespace-nowrap tabular-nums">{formatCurrency(item.price)}</div>
            <div className="font-semibold tabular-nums text-slate-900">{item.quantity}</div>
            <div className="whitespace-nowrap tabular-nums text-slate-600">{formatCurrency(invoiceItemDiscountAmount(item))}</div>
            <div className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{formatCurrency(item.total)}</div>
          </div>
        </div>
      ))}
    </div>

      <div className="space-y-2 pt-4 border-t border-slate-200">
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Tổng hàng</span>
        <span className="font-semibold text-slate-900">{formatCurrency(receipt.totalAmount)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Giảm giá</span>
        <span className="font-semibold text-slate-900">-{formatCurrency(receipt.discount)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Khách cần trả</span>
        <span className="font-semibold text-sky-700">{formatCurrency(receipt.amountDue)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Toa cũ</span>
        <span className="font-semibold text-orange-700">{formatCurrency(receipt.previousDebt)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Khách đã trả</span>
        <span className="font-semibold text-slate-900">{formatCurrency(receipt.paidAmount)}</span>
      </div>
      <div className="flex justify-between items-end border-t border-slate-200 pt-2">
        <span className="text-sm font-semibold text-slate-900">Tổng cuối toa</span>
        <span className="text-2xl font-black text-slate-900 font-display tabular-nums leading-none">{receipt.grandTotal > 0 ? formatCurrency(receipt.grandTotal) : '--'}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Tiền thừa trả khách</span>
        <span className="font-semibold text-emerald-700">{formatCurrency(receipt.changeAmount)}</span>
      </div>
      {receipt.remainingDebt > 0 ? (
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs font-semibold text-orange-600">Công nợ còn lại</span>
          <span className="text-sm font-semibold text-orange-600 tabular-nums">{formatCurrency(receipt.remainingDebt)}</span>
        </div>
      ) : null}
      {showOrderNote && currentInvoice?.note && (
        <div className="pt-2 border-t border-dashed border-slate-200">
          <p className="text-xs text-slate-500">Ghi chú: <span className="text-slate-700">{currentInvoice.note}</span></p>
        </div>
      )}
    </div>

    <div className="mt-6 text-center border-t border-slate-200 pt-4">
      <p className="text-[11px] font-medium text-slate-700">{footerNote}</p>
    </div>
        </>
      );
    })()}
  </div>
));

export const POSInvoiceModal = forwardRef(({ 
  isOpen, 
  onClose, 
  lastInvoiceId, 
  activeTenant, 
  selectedCustomer, 
  paymentMethod, 
  currentInvoiceItems, 
  currentInvoice,
  currentUserName,
  onExportImage,
  onPrint
}: POSInvoiceModalProps, ref: ForwardedRef<HTMLDivElement>) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center bg-slate-900/60 p-0 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg">
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 sm:h-10 sm:w-10">
               <Printer className="h-5 w-5" />
             </div>
             <h3 className="min-w-0 truncate text-sm font-black uppercase tracking-tight text-slate-900 sm:text-lg">Hóa đơn số {lastInvoiceId}</h3>
          </div>
          <button type="button" aria-label="Đóng hóa đơn" title="Đóng hóa đơn (Esc)" onClick={onClose} className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
            <span className="text-xs font-semibold sm:hidden">Đóng</span>
          </button>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-10">
          <InvoiceContent 
            ref={ref}
            lastInvoiceId={lastInvoiceId}
            activeTenant={activeTenant}
            selectedCustomer={selectedCustomer}
            paymentMethod={paymentMethod}
            currentInvoiceItems={currentInvoiceItems}
            currentInvoice={currentInvoice}
            currentUserName={currentUserName}
          />
        </div>

        <div className="sticky bottom-0 z-20 flex shrink-0 gap-2 border-t border-slate-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4 sm:p-6">
          <Button variant="outline" className="h-12 min-w-0 flex-1 rounded-lg bg-slate-50 px-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-100 sm:h-14 sm:px-4 sm:text-sm" onClick={onExportImage}>
            <Download className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Lưu ảnh
          </Button>
          <Button className="h-12 min-w-0 flex-1 rounded-lg bg-sky-600 px-2 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-sky-900/20 hover:bg-sky-700 sm:h-14 sm:px-4 sm:text-sm" onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> In phiếu
          </Button>
        </div>
      </div>
    </div>
  );
});
