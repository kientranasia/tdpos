import React from 'react';
import { InvoiceItem } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Minus, Plus, X } from 'lucide-react';

interface POSCartItemProps {
  key?: React.Key;
  item: InvoiceItem & { maxStock: number; discountPercent?: number };
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onUpdateDiscount?: (productId: string, discountPercent: number) => void;
}

export const POSCartItem = ({ item, onUpdateQuantity, onRemove, onUpdateDiscount }: POSCartItemProps) => {
  return (
    <div className="p-3 rounded-lg bg-white border border-slate-200 hover:border-sky-200 transition-all group relative" id={`cart-item-${item.productId}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="font-medium text-slate-900 flex-1 pr-6 leading-tight text-sm">
          {item.productName}
          <div className="text-xs text-slate-500 mt-1 leading-none">Đơn giá: {formatCurrency(item.price)}</div>
        </div>
        <button 
          onClick={() => onRemove(item.productId)} 
          className="absolute -top-1.5 -right-1.5 h-7 w-7 rounded-md bg-white text-slate-300 border border-slate-100 lg:opacity-0 group-hover:opacity-100 hover:text-red-600 hover:shadow transition-all shadow-sm flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex items-center justify-between gap-3">
        <div className="text-sky-700 font-semibold text-base tabular-nums">{formatCurrency(item.total)}</div>
        <div className="flex items-center bg-slate-50 rounded-lg p-1 ring-1 ring-slate-200 font-sans">
          <button 
           onClick={() => onUpdateQuantity(item.productId, -1)}
           className="h-8 w-8 rounded-lg hover:bg-slate-50 text-slate-400 active:scale-95 transition-all flex items-center justify-center border border-slate-50"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-sm font-semibold text-slate-900 tabular-nums">{item.quantity}</span>
          <button 
           onClick={() => onUpdateQuantity(item.productId, 1)}
           disabled={item.quantity >= item.maxStock}
           className="h-8 w-8 rounded-lg bg-sky-600 text-white shadow-lg shadow-sky-900/20 hover:bg-sky-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-20 disabled:hover:bg-sky-600"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {onUpdateDiscount && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-white/80 ring-1 ring-slate-100 px-2 py-1">
          <span className="text-xs text-slate-500">Giảm giá SP (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={item.discountPercent || 0}
            onChange={(e) => onUpdateDiscount(item.productId, Number(e.target.value))}
            className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs text-right"
          />
        </div>
      )}
    </div>
  );
}
