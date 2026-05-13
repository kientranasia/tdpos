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
      className={`group relative flex flex-col p-3 rounded-lg border-2 transition-all duration-300 cursor-pointer select-none h-full ${
        !isOutOfStock 
          ? 'bg-white border-white hover:border-sky-500 shadow-sm hover:shadow-xl hover:shadow-sky-900/10 active:scale-95' 
          : 'bg-slate-50 border-slate-50 opacity-40 cursor-not-allowed grayscale'
      } ${isAdded ? 'ring-2 ring-sky-400/60 shadow-xl shadow-sky-900/20' : ''}`}
      id={`product-${product.id}`}
    >
      {isAdded && (
        <div className="absolute inset-0 z-10 rounded-lg border-2 border-sky-400/70 pointer-events-none animate-pulse" />
      )}

      <div className={`h-20 w-full rounded-lg mb-3 flex items-center justify-center transition-all duration-300 transform overflow-hidden ${
        !isOutOfStock 
          ? 'bg-sky-50 text-sky-600 group-hover:shadow-inner' 
        : 'bg-slate-100 text-slate-300'
      }`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt={product.name} />
        ) : (
          <Package className="h-8 w-8 transform group-hover:rotate-12 transition-transform" />
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] truncate">{product.sku}</div>
          <div className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md tabular-nums ${
            isLowStock ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {product.stock} {product.unit}
          </div>
        </div>
        <div className="font-bold text-slate-900 leading-tight line-clamp-2 min-h-[2.25rem] tracking-tight text-sm sm:text-[15px]">
          {product.name}
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2 border-t border-slate-100 pt-2">
        <div className="space-y-0.5">
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.2em] leading-none">Giá</div>
          <div className="text-base font-bold text-sky-700 tabular-nums leading-none tracking-tight">{formatCurrency(product.sellingPrice)}</div>
        </div>
      </div>
      
      {!isOutOfStock && (
        <div className="absolute -top-2 -right-2 h-8 w-8 bg-sky-600 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-xl shadow-sky-900/40 group-hover:-translate-y-1 transition-all duration-300 ring-2 ring-white">
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
