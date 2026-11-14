import React from 'react';
import { InvoiceItem } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { MessageSquare, Minus, Plus, X } from 'lucide-react';

type DiscountMode = 'percent' | 'amount';

interface POSCartItemProps {
  key?: React.Key;
  item: InvoiceItem & { maxStock: number };
  onUpdateQuantity: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onDuplicate: (lineId: string) => void;
  onUpdateNote: (lineId: string, note: string) => void;
  onUpdateDiscount?: (lineId: string, mode: DiscountMode, value: number) => void;
  units?: Array<{ name: string; factor: number }>;
  onChangeUnit?: (lineId: string, unitName: string) => void;
}

export const POSCartItem = ({ item, onUpdateQuantity, onRemove, onDuplicate, onUpdateNote, onUpdateDiscount, units, onChangeUnit }: POSCartItemProps) => {
  const initialDiscountMode: DiscountMode = item.discountMode === 'amount' ? 'amount' : 'percent';
  const initialDiscountValue = initialDiscountMode === 'amount' ? item.discountAmount : item.discountPercent;
  const [showDiscount, setShowDiscount] = React.useState(Boolean(initialDiscountValue));
  const [discountMode, setDiscountMode] = React.useState<DiscountMode>(initialDiscountMode);
  const [showNote, setShowNote] = React.useState(Boolean(item.note?.trim()));
  const baseUnit = units?.find((unit) => Number(unit.factor) === 1)?.name || 'đơn vị cơ sở';
  const selectedUnit = units?.find((unit) => unit.name === item.unitName);
  const variantLabel = selectedUnit && selectedUnit.name !== baseUnit
    ? ` · ${selectedUnit.name} ${selectedUnit.factor} ${baseUnit}`
    : '';

  return (
    <div className="rounded-md border border-slate-200 bg-white px-1.5 py-1 transition-colors hover:border-sky-200" id={`cart-item-${item.id}`}>
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
              <span className="font-bold tracking-tight">CK</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onDuplicate(item.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-sky-200 hover:bg-white hover:text-sky-700"
            aria-label="Thêm dòng hàng này"
            title="Thêm dòng hàng này"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowNote((visible) => !visible)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] transition-colors ${showNote || item.note?.trim() ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600'}`}
            aria-label="Ghi chú riêng cho dòng hàng"
            aria-expanded={showNote}
            title="Ghi chú riêng cho dòng hàng"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {item.note?.trim() && !showNote && (
        <p className="mt-1 truncate rounded bg-sky-50 px-2 py-1 text-[10px] text-sky-800" title={item.note.trim()}>
          Ghi chú: {item.note.trim()}
        </p>
      )}
      {units && units.length > 1 && onChangeUnit && (
        <select value={item.unitName || units[0].name} onChange={(event) => onChangeUnit(item.id, event.target.value)} aria-label="Đơn vị bán" className="mt-0.5 h-5 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600">
          {units.map((unit) => <option key={unit.name} value={unit.name}>{unit.name} · ×{unit.factor}</option>)}
        </select>
      )}
      {onUpdateDiscount && showDiscount && (
        <div className="mt-0.5 flex items-center justify-end gap-1.5 rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-100">
          <span className="sr-only">Đơn vị giảm giá sản phẩm</span>
          <div className="flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="Đơn vị giảm giá sản phẩm">
            <button
              type="button"
              onClick={() => {
                setDiscountMode('amount');
                onUpdateDiscount(item.id, 'amount', item.discountAmount || 0);
              }}
              aria-label="Giảm giá theo VNĐ"
              aria-pressed={discountMode === 'amount'}
              className={`h-6 min-w-[34px] rounded px-1 text-[10px] font-semibold transition-colors ${discountMode === 'amount' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              VNĐ
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscountMode('percent');
                onUpdateDiscount(item.id, 'percent', item.discountPercent || 0);
              }}
              aria-label="Giảm giá theo phần trăm"
              aria-pressed={discountMode === 'percent'}
              className={`h-6 min-w-[28px] rounded px-1 text-[11px] font-semibold transition-colors ${discountMode === 'percent' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              %
            </button>
          </div>
          <input
            type="number"
            min={0}
            max={discountMode === 'percent' ? 100 : undefined}
            value={discountMode === 'amount' ? item.discountAmount || 0 : item.discountPercent || 0}
            onChange={(e) => onUpdateDiscount(item.id, discountMode, Number(e.target.value))}
            className="h-7 w-24 rounded-md border border-slate-200 bg-white px-2 text-right text-[11px] tabular-nums"
            aria-label={discountMode === 'amount' ? 'Số tiền giảm giá sản phẩm' : 'Phần trăm giảm giá sản phẩm'}
          />
        </div>
      )}
      {showNote && (
        <div className="mt-1 rounded-md bg-sky-50/70 p-1.5 ring-1 ring-sky-100">
          <label className="mb-1 block text-[10px] font-medium text-sky-800">Ghi chú riêng cho dòng hàng</label>
          <textarea
            value={item.note || ''}
            onChange={(event) => onUpdateNote(item.id, event.target.value)}
            placeholder="Ví dụ: Tên trên con dấu..."
            rows={2}
            className="w-full resize-none rounded-md border border-sky-100 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>
      )}
    </div>
  );
}
