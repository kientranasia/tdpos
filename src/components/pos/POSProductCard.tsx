import React from 'react';
import { Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Package, Plus } from 'lucide-react';

interface POSProductCardProps {
  key?: React.Key;
  product: Product;
  onClick: () => void;
  isAdded?: boolean;
}

export const POSProductCard = ({ product, onClick, isAdded = false }: POSProductCardProps) => {
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock <= product.lowStockThreshold;
  
  return (
    <div 
      onClick={onClick}
      className={`group relative flex flex-col p-2 rounded border transition-all duration-200 cursor-pointer select-none h-full ${
        !isOutOfStock 
          ? 'bg-white border-slate-200 hover:border-sky-400 shadow-sm hover:shadow-md active:scale-[0.99]' 
          : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed grayscale'
      } ${isAdded ? 'ring-2 ring-sky-400/60 shadow-xl shadow-sky-900/20' : ''}`}
      id={`product-${product.id}`}
    >
      {isAdded && (
        <div className="absolute inset-0 z-10 rounded-lg border-2 border-sky-400/70 pointer-events-none animate-pulse" />
      )}

        <div className={`h-14 w-full rounded mb-2 flex items-center justify-center transition-all duration-300 overflow-hidden ${
        !isOutOfStock 
          ? 'bg-slate-50 text-sky-600' 
        : 'bg-slate-100 text-slate-300'
      }`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt={product.name} />
        ) : (
          <Package className="h-5 w-5 transform group-hover:rotate-12 transition-transform" />
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-400 truncate">{product.sku}</div>
          <div className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md tabular-nums ${
            isOutOfStock ? 'bg-rose-100 text-rose-700' : isLowStock ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {isOutOfStock ? 'Hết hàng' : `${product.stock} ${product.unit}`}
          </div>
        </div>
        <div className="font-medium text-slate-900 leading-tight line-clamp-2 min-h-[2rem] text-xs">
          {product.name}
        </div>
      </div>

      <div className="mt-1 flex items-end justify-between gap-2 border-t border-slate-100 pt-1.5">
        <div className="space-y-0.5">
          <div className="text-xs font-medium text-slate-500 leading-none">Giá bán</div>
          <div className="text-sm font-semibold text-sky-700 tabular-nums leading-none">{formatCurrency(product.sellingPrice)}</div>
        </div>
      </div>
      
      {!isOutOfStock && (
        <div className="absolute -top-2 -right-2 h-8 w-8 bg-sky-600 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-lg group-hover:-translate-y-0.5 transition-all duration-200 ring-2 ring-white">
          <Plus className="h-4 w-4" />
        </div>
      )}

      {isAdded && (
        <div className="absolute top-3 right-3 z-20 rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
          +1
        </div>
      )}
    </div>
  );
}
