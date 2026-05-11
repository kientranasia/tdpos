import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, ExternalLink, AlertTriangle, Package, Filter, Download, ArrowUpDown, X, Save, Edit3, DollarSign, Tag, CheckCircle, Camera, Image, Layers } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { Product } from '../types';

export default function Inventory() {
  const { products, updateProductStock, addProduct, updateProduct, activeTenant, categories, addCategory } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockUpdatingProduct, setStockUpdatingProduct] = useState<Product | null>(null);
  
  const [newCategoryName, setNewCategoryName] = useState('');

  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category: '',
    unit: '',
    purchasePrice: 0,
    sellingPrice: 0,
    stock: 0,
    lowStockThreshold: 10,
    imageUrl: ''
  });

  const [stockUpdateForm, setUpdateForm] = useState({
    quantity: 0,
    purchasePrice: 0,
    sellingPrice: 0
  });

  const resetProductForm = () => {
    setProductForm({
      name: '',
      sku: '',
      category: categories[0]?.name || 'Tạp hóa',
      unit: 'Cái',
      purchasePrice: 0,
      sellingPrice: 0,
      stock: 0,
      lowStockThreshold: 10,
      imageUrl: ''
    });
    setEditingProduct(null);
  };

  const handleSaveProduct = () => {
    if (!productForm.name || !productForm.sku || !activeTenant) {
      alert("Vui lòng nhập tên và mã SKU");
      return;
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, productForm);
    } else {
      const product: Product = {
        id: `P${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        tenantId: activeTenant.id,
        ...productForm
      };
      addProduct(product);
    }
    setShowProductModal(false);
    resetProductForm();
  };

  const handleUpdateStock = () => {
    if (!stockUpdatingProduct) return;
    
    // updateStock quantity is added to current stock
    updateProduct(stockUpdatingProduct.id, {
      stock: stockUpdatingProduct.stock + stockUpdateForm.quantity,
      purchasePrice: stockUpdateForm.purchasePrice > 0 ? stockUpdateForm.purchasePrice : stockUpdatingProduct.purchasePrice,
      sellingPrice: stockUpdateForm.sellingPrice > 0 ? stockUpdateForm.sellingPrice : stockUpdatingProduct.sellingPrice
    });
    
    setShowStockModal(false);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      imageUrl: product.imageUrl || ''
    });
    setShowProductModal(true);
  };

  const openStockEntry = (product: Product) => {
    setStockUpdatingProduct(product);
    setUpdateForm({
      quantity: 0,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice
    });
    setShowStockModal(true);
  };

  const handleAddCategory = () => {
    if (!newCategoryName || !activeTenant) return;
    addCategory({
      id: `CAT${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      tenantId: activeTenant.id,
      name: newCategoryName
    });
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductForm({ ...productForm, imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden relative">
      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-white overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
               <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20">
                     <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Thông tin hàng hóa cơ bản</p>
                  </div>
               </div>
               <button onClick={() => setShowProductModal(false)} className="h-10 w-10 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all flex items-center justify-center">
                  <X className="h-6 w-6" />
               </button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hình ảnh sản phẩm</label>
                    <div className="relative group/img">
                      <div className="h-40 w-full rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/img:border-emerald-300">
                        {productForm.imageUrl ? (
                          <img src={productForm.imageUrl} className="h-full w-full object-cover" alt="Preview" />
                        ) : (
                          <>
                            <Camera className="h-8 w-8 text-slate-300 group-hover/img:scale-110 transition-transform" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2">Tải ảnh lên</span>
                          </>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleImageUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                        />
                      </div>
                      {productForm.imageUrl && (
                        <button 
                          onClick={() => setProductForm({...productForm, imageUrl: ''})}
                          className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white shadow-lg border border-slate-100 text-red-500 flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mã SKU</label>
                        <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <Input 
                            value={productForm.sku}
                            onChange={e => setProductForm({...productForm, sku: e.target.value})}
                            className="h-12 pl-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                            placeholder="VD: SP001" 
                        />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên sản phẩm</label>
                        <Input 
                        value={productForm.name}
                        onChange={e => setProductForm({...productForm, name: e.target.value})}
                        className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700 uppercase" 
                        placeholder="VD: NƯỚC NGỌT COCA..." 
                        />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Danh mục</label>
                        <button 
                          onClick={() => setShowCategoryModal(true)}
                          className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest"
                        >
                          + Thêm mới
                        </button>
                    </div>
                    <select 
                      value={productForm.category}
                      onChange={e => setProductForm({...productForm, category: e.target.value})}
                      className="w-full h-12 px-5 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700 appearance-none"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Đơn vị tính</label>
                    <Input 
                       value={productForm.unit}
                       onChange={e => setProductForm({...productForm, unit: e.target.value})}
                       className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                       placeholder="VD: Cái, Chai, Thùng" 
                    />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giá nhập</label>
                    <div className="relative">
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                       <Input 
                         type="number"
                         value={productForm.purchasePrice}
                         onChange={e => setProductForm({...productForm, purchasePrice: Number(e.target.value)})}
                         className="h-12 pl-12 rounded-2xl bg-emerald-50/30 border-none shadow-inner font-bold text-emerald-700 font-mono" 
                       />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giá bán</label>
                    <div className="relative">
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                       <Input 
                         type="number"
                         value={productForm.sellingPrice}
                         onChange={e => setProductForm({...productForm, sellingPrice: Number(e.target.value)})}
                         className="h-12 pl-12 rounded-2xl bg-emerald-50/30 border-none shadow-inner font-bold text-emerald-700 font-mono" 
                       />
                    </div>
                  </div>
               </div>

               {!editingProduct && (
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số lượng tồn kho ban đầu</label>
                    <Input 
                       type="number"
                       value={productForm.stock}
                       onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})}
                       className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                    />
                 </div>
               )}
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100">
               <Button 
                 onClick={handleSaveProduct}
                 className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 gap-3"
                >
                 <Save className="h-5 w-5" />
                 <span>Lưu sản phẩm</span>
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl border border-white overflow-hidden p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <Layers className="h-5 w-5" />
                   </div>
                   <h3 className="font-black text-slate-900 uppercase italic tracking-tight">Thêm danh mục</h3>
                </div>
                <button onClick={() => setShowCategoryModal(false)} className="text-slate-300 hover:text-red-500">
                   <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN DANH MỤC MỚI</label>
                <Input 
                   value={newCategoryName}
                   onChange={e => setNewCategoryName(e.target.value)}
                   className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700 uppercase" 
                   placeholder="VD: ĐỒ GIA DỤNG..." 
                />
              </div>
              <Button 
                onClick={handleAddCategory}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest"
              >
                TẠO DANH MỤC
              </Button>
           </div>
        </div>
      )}

      {/* Stock Entry Modal */}
      {showStockModal && stockUpdatingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl border border-white overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
             <div className="p-8 border-b border-slate-50 bg-slate-900">
                <div className="flex justify-between items-start">
                   <div className="space-y-2">
                      <div className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none">Cập nhật kho hàng</div>
                      <h2 className="text-xl font-black text-white uppercase italic tracking-tight leading-none">{stockUpdatingProduct.name}</h2>
                      <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">Tồn hiện tại: {stockUpdatingProduct.stock} {stockUpdatingProduct.unit}</div>
                   </div>
                   <button onClick={() => setShowStockModal(false)} className="text-white/20 hover:text-white transition-colors">
                      <X className="h-6 w-6" />
                   </button>
                </div>
             </div>

             <div className="p-8 space-y-6">
                <div className="space-y-4">
                   <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex items-center gap-4 group">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg transform group-focus-within:rotate-12 transition-transform">
                         <Plus className="h-6 w-6" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SỐ LƯỢNG NHẬP THÊM</label>
                        <Input 
                          type="number"
                          autoFocus
                          className="border-none bg-transparent shadow-none p-0 text-2xl font-black text-slate-900 tabular-nums focus:ring-0"
                          value={stockUpdateForm.quantity}
                          onChange={e => setUpdateForm({...stockUpdateForm, quantity: Number(e.target.value)})}
                        />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GIÁ NHẬP MỚI</label>
                        <Input 
                          type="number"
                          className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                          value={stockUpdateForm.purchasePrice}
                          onChange={e => setUpdateForm({...stockUpdateForm, purchasePrice: Number(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GIÁ BÁN MỚI</label>
                        <Input 
                          type="number"
                          className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                          value={stockUpdateForm.sellingPrice}
                          onChange={e => setUpdateForm({...stockUpdateForm, sellingPrice: Number(e.target.value)})}
                        />
                      </div>
                   </div>
                </div>

                <Button 
                  onClick={handleUpdateStock}
                  className="w-full h-16 rounded-[24px] bg-slate-900 hover:bg-emerald-600 text-white font-black uppercase tracking-widest shadow-xl transition-all gap-3"
                >
                   <CheckCircle className="h-6 w-6" />
                   <span>Hoàn tất nhập hàng</span>
                </Button>
             </div>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-8 bg-white border-b sticky top-0 z-40 flex flex-col md:flex-row gap-4 sm:gap-6 items-start md:items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20 transform -rotate-3 shrink-0">
            <Package className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black text-slate-900 font-display tracking-tight uppercase italic">Kho hàng</h1>
            <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] mt-0.5">{products.length} mặt hàng</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative group flex-1 md:w-56 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
            <Input 
              className="h-9 sm:h-11 rounded-xl border-none bg-slate-100/50 shadow-inner focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-xs sm:text-sm placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
              placeholder="TÌM KIẾM..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            onClick={() => {
                resetProductForm();
                setShowProductModal(true);
            }}
            className="h-9 sm:h-11 px-4 rounded-xl gap-2 font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all text-white uppercase tracking-widest shrink-0 text-[10px] sm:text-xs"
          >
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Thêm mới</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 pb-40">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-white overflow-hidden">
          {/* Mobile View: High-polish Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 md:hidden">
            {filteredProducts.map(product => (
              <div key={product.id} className="p-4 bg-white space-y-3 relative group active:bg-slate-50 transition-colors" onClick={() => openStockEntry(product)}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-[7px] font-black text-slate-300 uppercase tracking-widest font-mono leading-none">{product.sku}</div>
                    <div className="font-black text-slate-900 text-base leading-tight tracking-tight uppercase italic">{product.name}</div>
                  </div>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shadow-inner transition-transform group-hover:rotate-12 ${
                    product.stock <= product.lowStockThreshold ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Package className="h-4 w-4" />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-widest leading-none ring-1 ring-slate-200/50">{product.category}</span>
                  <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-widest leading-none ring-1 ring-slate-200/50">{product.unit}</span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="space-y-1">
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tồn kho</div>
                    <div className={`text-xl font-black font-display tabular-nums tracking-tighter leading-none ${
                      product.stock <= product.lowStockThreshold ? 'text-orange-600' : 'text-slate-900'
                    }`}>
                      {product.stock} <span className="text-[10px] text-slate-300 font-bold uppercase ml-0.5">{product.unit}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Giá bán</div>
                    <div className="text-xl font-black text-emerald-700 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(product.sellingPrice)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: Polished Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">
                    <div className="flex items-center gap-2">Mã SKU <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Sản phẩm</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">Danh mục</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-right">Giá nhập</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-right">Giá bán</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-center">Tồn kho</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="group hover:bg-emerald-50/20 transition-all duration-300">
                    <td className="px-8 py-6">
                      <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/50 uppercase tracking-widest">{product.sku}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-slate-50 group-hover:bg-white group-hover:shadow-lg transition-all flex items-center justify-center text-slate-400 group-hover:text-emerald-600 border border-transparent group-hover:border-emerald-100">
                           <Package className="h-6 w-6 transform group-hover:rotate-12 transition-transform" />
                        </div>
                        <div className="font-black text-slate-900 tracking-tight text-lg">{product.name}</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[10px] font-black text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-slate-100">{product.category}</span>
                    </td>
                    <td className="px-8 py-6 text-right font-black text-slate-400 tabular-nums">
                        {formatCurrency(product.purchasePrice)}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex flex-col items-end">
                        <div className="font-black text-emerald-700 font-display text-xl tabular-nums tracking-tighter">{formatCurrency(product.sellingPrice)}</div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditProduct(product);
                          }}
                          className="text-[8px] font-black uppercase text-slate-300 hover:text-emerald-600 transition-colors"
                        >
                          Sửa giá
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-center">
                        <div className={`px-5 py-2 rounded-2xl text-[10px] font-black flex items-center gap-3 shadow-sm transition-transform group-hover:scale-105 ${
                          product.stock <= product.lowStockThreshold 
                          ? 'bg-orange-600 text-white ring-4 ring-orange-100' 
                          : 'bg-slate-900 text-white ring-4 ring-slate-100'
                        }`}>
                          <button className="hover:scale-125 transition-transform" onClick={(e) => {
                             e.stopPropagation();
                             openStockEntry(product);
                          }}><Plus className="h-4 w-4" /></button>
                          <span className="text-sm font-display">{product.stock}</span>
                          <span className="opacity-50 uppercase tracking-widest">{product.unit}</span>
                          {product.stock <= product.lowStockThreshold && <AlertTriangle className="h-4 w-4" />}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openEditProduct(product)}
                          className="h-12 w-12 rounded-2xl bg-slate-50 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all shadow-sm ring-1 ring-slate-100 hover:ring-emerald-500 transform hover:-translate-y-1"
                        >
                          <Edit3 className="h-5 w-5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="p-32 text-center space-y-8 animate-pulse">
              <div className="inline-flex h-32 w-32 items-center justify-center rounded-[56px] bg-slate-50 text-slate-200 shadow-inner">
                <Search className="h-16 w-16 opacity-10" />
              </div>
              <p className="text-slate-300 font-black uppercase tracking-[0.5em] text-xs">Dữ liệu hàng hóa trống</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
