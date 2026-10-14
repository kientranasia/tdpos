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
  units?: Array<{ name: string; factor: number }>;
  onChangeUnit?: (productId: string, unitName: string) => void;
}

export const POSCartItem = ({ item, onUpdateQuantity, onRemove, onUpdateDiscount, units, onChangeUnit }: POSCartItemProps) => {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 hover:border-sky-200 transition-all group" id={`cart-item-${item.productId}`}>
      <div className="flex items-center gap-2">
        <div className="font-medium text-slate-900 flex-1 min-w-0 leading-tight text-xs">
          <p className="truncate">{item.productName}</p>
          <div className="text-[11px] text-slate-500 mt-1 leading-none">{formatCurrency(item.price)} / {item.unitName || 'đơn vị'}</div>
        </div>
        <button 
          onClick={() => onRemove(item.productId)} 
          className="h-6 w-6 shrink-0 rounded-md bg-white text-slate-400 border border-slate-200 hover:text-red-600 hover:border-rose-200 transition-all flex items-center justify-center"
          aria-label="Xóa sản phẩm"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {units && units.length > 1 && onChangeUnit && (
        <select value={item.unitName || units[0].name} onChange={(event) => onChangeUnit(item.productId, event.target.value)} className="mt-2 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600">
          {units.map((unit) => <option key={unit.name} value={unit.name}>{unit.name} · ×{unit.factor}</option>)}
        </select>
      )}
      
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-sky-700 font-semibold text-sm leading-none tabular-nums">{formatCurrency(item.total)}</div>
        <div className="flex items-center bg-slate-50 rounded-md p-0.5 ring-1 ring-slate-200 font-sans shrink-0">
          <button 
           onClick={() => onUpdateQuantity(item.productId, -1)}
           className="h-6 w-6 rounded-md hover:bg-slate-100 text-slate-500 active:scale-95 transition-all flex items-center justify-center"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-7 text-center text-xs font-semibold text-slate-900 tabular-nums">{item.quantity}</span>
          <button 
           onClick={() => onUpdateQuantity(item.productId, 1)}
           disabled={item.quantity >= item.maxStock}
           className="h-6 w-6 rounded-md bg-sky-600 text-white hover:bg-sky-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-20 disabled:hover:bg-sky-600"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {onUpdateDiscount && (
        <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 ring-1 ring-slate-100 px-2 py-1">
          <span className="text-[11px] text-slate-500">Giảm SP (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={item.discountPercent || 0}
            onChange={(e) => onUpdateDiscount(item.productId, Number(e.target.value))}
            className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-right"
          />
        </div>
      )}
    </div>
  );
}
