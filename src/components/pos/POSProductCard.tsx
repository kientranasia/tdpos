import React from 'react';
import { Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Package, Plus } from 'lucide-react';

interface POSProductCardProps {
  key?: React.Key;
  product: Product;
  onClick: () => void;
}

export const POSProductCard = ({ product, onClick }: POSProductCardProps) => {
  const isOutOfStock = product.stock <= 0;
  
  return (
    <div 
      onClick={onClick}
      className={`group relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-500 cursor-pointer select-none h-full ${
        !isOutOfStock 
        ? 'bg-white border-white hover:border-emerald-500 shadow-sm hover:shadow-xl hover:shadow-emerald-900/10 active:scale-95' 
        : 'bg-slate-50 border-slate-50 opacity-40 cursor-not-allowed grayscale'
      }`}
      id={`product-${product.id}`}
    >
      <div className={`h-24 w-full rounded-xl mb-4 flex items-center justify-center transition-all duration-500 transform overflow-hidden ${
        !isOutOfStock 
        ? 'bg-emerald-50 text-emerald-600 group-hover:shadow-inner' 
        : 'bg-slate-100 text-slate-300'
      }`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt={product.name} />
        ) : (
          <Package className="h-8 w-8 transform group-hover:rotate-12 transition-transform" />
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">{product.sku}</div>
        <div className="font-black text-slate-900 leading-tight line-clamp-2 min-h-[2.5rem] tracking-tighter text-sm sm:text-base">{product.name}</div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-50 pt-3">
        <div className="space-y-0.5">
          <div className="text-[8px] font-black text-emerald-700/40 uppercase tracking-[0.3em] leading-none mb-1">Giá bán</div>
          <div className="text-lg font-black text-emerald-700 tabular-nums leading-none tracking-tighter">{formatCurrency(product.sellingPrice)}</div>
        </div>
        <div className={`text-[8px] font-black px-2 py-1 rounded-lg tabular-nums tracking-[0.1em] shadow-sm ${
          product.stock <= product.lowStockThreshold ? 'bg-orange-600 text-white ring-2 ring-orange-100' : 'bg-slate-900 text-white ring-2 ring-slate-100'
        }`}>
          {product.stock} {product.unit}
        </div>
      </div>
      
      {!isOutOfStock && (
        <div className="absolute -top-2 -right-2 h-9 w-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-xl shadow-emerald-900/40 group-hover:-translate-y-1 transition-all duration-300 ring-2 ring-white">
          <Plus className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
