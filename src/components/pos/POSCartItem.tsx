import React from 'react';
import { InvoiceItem } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Minus, Percent, Plus, X } from 'lucide-react';

interface POSCartItemProps {
  key?: React.Key;
  item: InvoiceItem & { maxStock: number; discountPercent?: number };
  onUpdateQuantity: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onUpdateDiscount?: (lineId: string, discountPercent: number) => void;
  units?: Array<{ name: string; factor: number }>;
  onChangeUnit?: (lineId: string, unitName: string) => void;
}

export const POSCartItem = ({ item, onUpdateQuantity, onRemove, onUpdateDiscount, units, onChangeUnit }: POSCartItemProps) => {
  const [showDiscount, setShowDiscount] = React.useState(Boolean(item.discountPercent));
  const baseUnit = units?.find((unit) => Number(unit.factor) === 1)?.name || 'đơn vị cơ sở';
  const selectedUnit = units?.find((unit) => unit.name === item.unitName);
  const variantLabel = selectedUnit && selectedUnit.name !== baseUnit
    ? ` · ${selectedUnit.name} ${selectedUnit.factor} ${baseUnit}`
    : '';

  return (
    <div className="rounded-md border border-slate-200 bg-white px-1.5 py-1 transition-colors hover:border-sky-200" id={`cart-item-${item.productId}`}>
      <div className="flex items-start gap-1 font-medium leading-tight text-slate-900">
        <p className="min-w-0 flex-1 break-words text-[11px]">{item.productName}{variantLabel}</p>
        <button
          onClick={() => onRemove(item.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-rose-200 hover:text-rose-700"
          aria-label="Xóa sản phẩm"
          title="Xóa sản phẩm"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[10px] text-slate-500">{formatCurrency(item.price)} / {item.unitName || 'đơn vị'}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="flex items-center rounded-md bg-slate-50 p-0.5 font-sans ring-1 ring-slate-200">
            <button
             onClick={() => onUpdateQuantity(item.id, -1)}
             className="flex h-5 w-5 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 active:scale-95"
             aria-label="Giảm số lượng"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-[11px] font-semibold tabular-nums text-slate-900">{item.quantity}</span>
            <button
             onClick={() => onUpdateQuantity(item.id, 1)}
             disabled={item.quantity >= item.maxStock}
             className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-600 text-white transition-colors hover:bg-sky-700 active:scale-95 disabled:opacity-20 disabled:hover:bg-sky-600"
             aria-label="Tăng số lượng"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {onUpdateDiscount && (
            <button
              type="button"
              onClick={() => setShowDiscount((visible) => !visible)}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] transition-colors ${showDiscount ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600'}`}
              aria-label="Giảm giá sản phẩm"
              aria-expanded={showDiscount}
              title="Giảm giá sản phẩm"
            >
              <Percent className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {units && units.length > 1 && onChangeUnit && (
        <select value={item.unitName || units[0].name} onChange={(event) => onChangeUnit(item.id, event.target.value)} aria-label="Đơn vị bán" className="mt-0.5 h-5 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600">
          {units.map((unit) => <option key={unit.name} value={unit.name}>{unit.name} · ×{unit.factor}</option>)}
        </select>
      )}
      {onUpdateDiscount && showDiscount && (
        <div className="mt-0.5 flex items-center justify-between rounded-md bg-slate-50 px-2 py-0.5 ring-1 ring-slate-100">
          <span className="text-[10px] text-slate-500">Giảm sản phẩm (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={item.discountPercent || 0}
            onChange={(e) => onUpdateDiscount(item.id, Number(e.target.value))}
            className="h-6 w-12 rounded-md border border-slate-200 bg-white px-1.5 text-right text-[11px]"
          />
        </div>
      )}
    </div>
  );
}
