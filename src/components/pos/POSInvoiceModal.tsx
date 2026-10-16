import React, { ForwardedRef, forwardRef } from 'react';
import { Invoice, InvoiceItem, Customer, Tenant } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Button } from '../ui/Button';
import { X, Download, Printer } from 'lucide-react';
import BrandMark from '../BrandMark';

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
  onPrint: () => void;
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
  <div ref={ref} className={`bg-white rounded-lg border border-slate-100 shadow-sm print:border-none print:shadow-none min-h-fit ${activeTenant?.settings?.invoice?.printSize === 'receipt_80mm' ? 'mx-auto w-[302px] p-4' : 'p-8'}`}>
    {(() => {
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
      <p className="text-[11px] text-slate-500 mt-1">{new Date().toLocaleString('vi-VN')}</p>
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
      <div className="grid grid-cols-[minmax(0,1fr)_20px_72px_78px] gap-1 border-b border-slate-200 pb-1 text-left text-[9px] font-semibold leading-tight text-slate-600">
        <div>Sản phẩm</div>
        <div>SL</div>
        <div>Đơn giá</div>
        <div>Thành tiền</div>
      </div>
      {currentInvoiceItems.map(item => (
        <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_20px_72px_78px] items-start gap-1 border-b border-dashed border-slate-100 py-1 text-left text-[9px] leading-tight">
          <div className="min-w-0 pr-1">
            <div className="break-words font-semibold text-slate-900">{item.productName}</div>
          </div>
          <div className="font-semibold tabular-nums text-slate-900">{item.quantity}</div>
          <div className="whitespace-nowrap tabular-nums text-slate-700">{formatCurrency(item.price)}</div>
          <div className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{formatCurrency(item.total)}</div>
        </div>
      ))}
    </div>

    <div className="space-y-2 pt-4 border-t border-slate-200">
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Tạm tính</span>
        <span className="font-semibold text-slate-900">{formatCurrency(currentInvoice?.totalAmount || 0)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">Giảm giá</span>
        <span className="font-semibold text-slate-900">-{formatCurrency(currentInvoice?.discount || 0)}</span>
      </div>
      <div className="flex justify-between items-end border-t border-slate-200 pt-2">
        <span className="text-sm font-semibold text-slate-900">Tổng thanh toán</span>
        <span className="text-2xl font-black text-slate-900 font-display tabular-nums leading-none">{formatCurrency(currentInvoice?.finalAmount || 0)}</span>
      </div>
      {currentInvoice?.debtAmount && currentInvoice.debtAmount > 0 ? (
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs font-semibold text-orange-600">Còn nợ</span>
          <span className="text-sm font-semibold text-orange-600 tabular-nums">{formatCurrency(currentInvoice.debtAmount)}</span>
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
               <Printer className="h-5 w-5" />
             </div>
             <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Hóa đơn số {lastInvoiceId}</h3>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-10" id="printable-invoice">
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

        <div className="p-8 bg-white border-t border-slate-100 flex gap-4">
          <Button variant="outline" className="flex-1 h-14 rounded-lg font-black uppercase tracking-widest bg-slate-50 border-none text-slate-600 hover:bg-slate-100 transition-all" onClick={onExportImage}>
            <Download className="h-5 w-5 mr-2" /> Lưu ảnh
          </Button>
          <Button className="flex-1 h-14 rounded-lg font-black uppercase tracking-widest bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-900/20" onClick={onPrint}>
            <Printer className="h-5 w-5 mr-2" /> In phiếu
          </Button>
        </div>
      </div>
    </div>
  );
});
