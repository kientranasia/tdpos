import React, { ForwardedRef, forwardRef } from 'react';
import { Invoice, InvoiceItem, Customer, Tenant } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Button } from '../ui/Button';
import { X, Download, Printer } from 'lucide-react';

interface POSInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastInvoiceId: string;
  activeTenant: Tenant | null;
  selectedCustomer: Customer | null;
  paymentMethod: string;
  currentInvoiceItems: InvoiceItem[];
  currentInvoice: Invoice | null;
  onExportImage: () => void;
  onPrint: () => void;
}

const InvoiceContent = forwardRef(({ 
  lastInvoiceId, 
  activeTenant, 
  selectedCustomer, 
  paymentMethod, 
  currentInvoiceItems, 
  currentInvoice 
}: Omit<POSInvoiceModalProps, 'isOpen' | 'onClose' | 'onExportImage' | 'onPrint'>, ref: ForwardedRef<HTMLDivElement>) => (
  <div ref={ref} className="bg-white p-8 rounded-lg border border-slate-100 shadow-sm print:border-none print:shadow-none min-h-fit">
    <div className="text-center mb-10">
      <h4 className="text-3xl font-black text-sky-700 font-display uppercase tracking-tighter leading-none mb-2">{activeTenant?.name}</h4>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{activeTenant?.address}</p>
      <p className="text-[10px] text-slate-400 font-black tracking-widest">Hotline: {activeTenant?.phone}</p>
      <div className="h-px bg-slate-100 w-full my-8"></div>
      <h5 className="text-xl font-black text-slate-900 uppercase tracking-tight">Hóa đơn bán hàng</h5>
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{new Date().toLocaleString('vi-VN')}</p>
    </div>

    <div className="space-y-3 mb-10 bg-slate-50 p-6 rounded-lg">
      <div className="flex justify-between items-center">
        <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Khách hàng:</span>
        <span className="text-slate-900 font-black text-sm">{selectedCustomer?.name || 'Khách lẻ'}</span>
      </div>
      {selectedCustomer?.phone && (
        <div className="flex justify-between items-center">
          <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Số điện thoại:</span>
          <span className="text-slate-900 font-black text-sm">{selectedCustomer.phone}</span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Hình thức:</span>
        <span className="text-sky-700 font-black text-[10px] uppercase tracking-widest bg-sky-100 px-2 py-0.5 rounded-lg">
          {paymentMethod === 'cash' ? 'Tiền mặt' : paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ'}
        </span>
      </div>
    </div>

    <div className="space-y-4 mb-10">
      <div className="grid grid-cols-5 text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 border-b border-slate-100">
        <div className="col-span-3">Tên sản phẩm</div>
        <div className="text-center">SL</div>
        <div className="text-right">T.Tiền</div>
      </div>
      {currentInvoiceItems.map(item => (
        <div key={item.id} className="grid grid-cols-5 text-sm items-center py-1">
          <div className="col-span-3">
            <div className="font-bold text-slate-900 leading-tight">{item.productName}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{formatCurrency(item.price)}</div>
          </div>
          <div className="text-center font-black text-slate-900">x{item.quantity}</div>
          <div className="text-right font-black text-slate-900">{formatCurrency(item.total)}</div>
        </div>
      ))}
    </div>

    <div className="space-y-3 pt-8 border-t-2 border-dashed border-slate-100">
      <div className="flex justify-between items-end">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Thành tiền</span>
        <span className="text-3xl font-black text-sky-700 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(currentInvoice?.finalAmount || 0)}</span>
      </div>
      {currentInvoice?.debtAmount && currentInvoice.debtAmount > 0 ? (
        <div className="flex justify-between items-center pt-2">
          <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Chưa thanh toán (Nợ)</span>
          <span className="text-sm font-black text-orange-600 tabular-nums">{formatCurrency(currentInvoice.debtAmount)}</span>
        </div>
      ) : null}
    </div>

    <div className="mt-16 text-center border-t border-slate-50 pt-8">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Cảm ơn quý khách!</p>
      <p className="text-[8px] text-slate-300 font-bold">Vui lòng kiểm tra kỹ hàng hóa trước khi rời khỏi quầy.</p>
    </div>
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
