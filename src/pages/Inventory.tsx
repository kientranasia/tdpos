import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, AlertTriangle, Package, ArrowUpDown, X, Save, Edit3, DollarSign, Tag, CheckCircle, Camera, Layers, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { Product } from '../types';
import { v4 as uuid } from 'uuid';
import { productsApi, stockMovementsApi } from '../lib/api';

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, activeTenant, categories, addCategory } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showBulkCheckModal, setShowBulkCheckModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockUpdatingProduct, setStockUpdatingProduct] = useState<Product | null>(null);
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState('');
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [stockCheckActual, setStockCheckActual] = useState<number>(0);
  const [bulkCheckActuals, setBulkCheckActuals] = useState<Record<string, number>>({});
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out' | 'adjust'>('all');

  const unitOptions = useMemo(() => {
    const defaults = ['Cái', 'Chai', 'Thùng', 'Hộp', 'Gói', 'Kg', 'Lít'];
    const dynamicUnits = products.map((p) => p.unit).filter(Boolean);
    return Array.from(new Set([...defaults, ...customUnits, ...dynamicUnits]));
  }, [customUnits, products]);

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
      unit: unitOptions[0] || 'Cái',
      purchasePrice: 0,
      sellingPrice: 0,
      stock: 0,
      lowStockThreshold: 10,
      imageUrl: ''
    });
    setEditingProduct(null);
  };

  const handleSaveProduct = async () => {
    setFormError('');
    if (!productForm.name || !productForm.sku || !activeTenant) {
      setFormError('Vui lòng nhập tên sản phẩm và mã SKU.');
      return;
    }
    if (!productForm.category || !productForm.unit) {
      setFormError('Vui lòng chọn danh mục và đơn vị tính.');
      return;
    }

    setSavingProduct(true);
    const payload = {
      ...productForm,
      category: productForm.category.trim(),
      unit: productForm.unit.trim(),
      purchasePrice: Number(productForm.purchasePrice) || 0,
      sellingPrice: Number(productForm.sellingPrice) || 0,
      stock: Number(productForm.stock) || 0,
      lowStockThreshold: Number(productForm.lowStockThreshold) || 0,
    };
    let success = false;
    if (editingProduct) {
      success = await updateProduct(editingProduct.id, payload);
    } else {
      const product: Product = {
        id: uuid(),
        tenantId: activeTenant.id,
        trackStock: true,
        status: 'active',
        ...payload
      };
      success = await addProduct(product);
    }
    setSavingProduct(false);

    if (success) {
      setShowProductModal(false);
      resetProductForm();
      return;
    }

    setFormError('Không thể lưu sản phẩm. Vui lòng kiểm tra ảnh hoặc kết nối API.');
  };

  const handleUpdateStock = async () => {
    if (!stockUpdatingProduct) return;
    if (!Number.isFinite(stockUpdateForm.quantity) || stockUpdateForm.quantity <= 0) {
      setFormError('Số lượng nhập kho phải lớn hơn 0.');
      return;
    }

    await productsApi.adjustStock(stockUpdatingProduct.id, stockUpdateForm.quantity, 'increase', 'Nhập kho thủ công');
    const success = await updateProduct(stockUpdatingProduct.id, {
      stock: stockUpdatingProduct.stock + stockUpdateForm.quantity,
      purchasePrice: stockUpdateForm.purchasePrice > 0 ? stockUpdateForm.purchasePrice : stockUpdatingProduct.purchasePrice,
      sellingPrice: stockUpdateForm.sellingPrice > 0 ? stockUpdateForm.sellingPrice : stockUpdatingProduct.sellingPrice
    });
    if (success) {
      const movements = await stockMovementsApi.list();
      setStockMovements(movements.slice(0, 40));
    }
    if (!success) {
      setFormError('Không thể cập nhật tồn kho. Vui lòng thử lại.');
      return;
    }

    setShowStockModal(false);
  };

  const handleStockCheck = async (product: Product) => {
    if (!Number.isFinite(stockCheckActual) || stockCheckActual < 0) {
      setFormError('Số lượng kiểm kê không hợp lệ.');
      return;
    }
    await stockMovementsApi.stockCheck(product.id, stockCheckActual, 'Kiểm kê nhanh');
    await updateProduct(product.id, { stock: stockCheckActual });
    const movements = await stockMovementsApi.list();
    setStockMovements(movements.slice(0, 40));
    setStockCheckActual(0);
  };

  const openBulkCheck = () => {
    const defaults: Record<string, number> = {};
    filteredProducts.forEach((p) => { defaults[p.id] = p.stock; });
    setBulkCheckActuals(defaults);
    setShowBulkCheckModal(true);
  };

  const handleBulkCheckApply = async () => {
    setFormError('');
    try {
      for (const product of filteredProducts) {
        const actual = bulkCheckActuals[product.id];
        if (!Number.isFinite(actual) || actual < 0) continue;
        if (actual === product.stock) continue;
        await stockMovementsApi.stockCheck(product.id, actual, 'Kiểm kê hàng loạt');
        await updateProduct(product.id, { stock: actual });
      }
      const movements = await stockMovementsApi.list();
      setStockMovements(movements.slice(0, 40));
      setShowBulkCheckModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể áp dụng kiểm kê hàng loạt.');
    }
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

  const handleDeleteProduct = async (product: Product) => {
    setFormError('');
    const confirmed = window.confirm(`Xóa mặt hàng "${product.name}"?`);
    if (!confirmed) return;
    const success = await deleteProduct(product.id);
    if (!success) {
      setFormError('Không thể xóa mặt hàng. Vui lòng thử lại.');
    }
  };

  const handleAddCategory = async () => {
    setFormError('');
    if (!newCategoryName || !activeTenant) return;
    const success = await addCategory({
      id: uuid(),
      tenantId: activeTenant.id,
      name: newCategoryName
    });
    if (!success) {
      setFormError('Không thể thêm danh mục.');
      return;
    }
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

  const handleAddUnit = () => {
    const normalized = newUnitName.trim();
    if (!normalized) return;
    if (!unitOptions.includes(normalized)) {
      setCustomUnits((prev) => [...prev, normalized]);
    }
    setProductForm((prev) => ({ ...prev, unit: normalized }));
    setNewUnitName('');
    setShowUnitModal(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError('');
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setFormError('Vui lòng chọn đúng tệp ảnh.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new window.Image();
        img.onload = () => {
          const maxSide = 1280;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setFormError('Không thể xử lý ảnh.');
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setProductForm(prev => ({ ...prev, imageUrl: compressed }));
        };

        img.onerror = () => {
          setFormError('Không thể đọc ảnh. Vui lòng thử ảnh khác.');
        };

        img.src = reader.result as string;
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

  const visibleStockMovements = useMemo(() => {
    if (movementTypeFilter === 'all') return stockMovements;
    return stockMovements.filter((m) => m.type === movementTypeFilter);
  }, [movementTypeFilter, stockMovements]);

  useEffect(() => {
    const loadMovements = async () => {
      try {
        const rows = await stockMovementsApi.list();
        setStockMovements(rows.slice(0, 40));
      } catch (err) {
        console.error('Failed to load stock movements', err);
      }
    };
    loadMovements();
  }, []);

  const inventoryStats = useMemo(() => {
    const lowStock = products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).length;
    const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalStockValue = products.reduce((sum, p) => sum + (p.stock || 0) * (p.purchasePrice || 0), 0);
    return { lowStock, totalUnits, totalStockValue };
  }, [products]);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden relative">
      {/* Product Modal */}
      {showBulkCheckModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Kiểm kê hàng loạt</h3>
              <button onClick={() => setShowBulkCheckModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {filteredProducts.map((p) => (
                <div key={p.id} className="px-5 py-3 grid grid-cols-12 items-center gap-3">
                  <div className="col-span-5">
                    <p className="text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.sku} · Hiện tại: {p.stock} {p.unit}</p>
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      value={bulkCheckActuals[p.id] ?? p.stock}
                      onChange={(e) => setBulkCheckActuals((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-3 text-xs text-slate-500">
                    Chênh: {(bulkCheckActuals[p.id] ?? p.stock) - p.stock}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBulkCheckModal(false)}>Hủy</Button>
              <Button onClick={handleBulkCheckApply}>Áp dụng kiểm kê</Button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-white overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
               <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20">
                     <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Thông tin hàng hóa cơ bản</p>
                  </div>
               </div>
               <button onClick={() => setShowProductModal(false)} className="h-10 w-10 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all flex items-center justify-center">
                  <X className="h-6 w-6" />
               </button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
               {formError && (
                 <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                   {formError}
                 </div>
               )}
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hình ảnh sản phẩm</label>
                    <div className="relative group/img">
                      <div className="h-40 w-full rounded-lg bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/img:border-sky-300">
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
                            className="h-12 pl-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                            placeholder="Ví dụ: SP001" 
                        />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên sản phẩm</label>
                        <Input 
                        value={productForm.name}
                        onChange={e => setProductForm({...productForm, name: e.target.value})}
                        className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700 uppercase" 
                        placeholder="Ví dụ: Nước ngọt Coca" 
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
                          className="text-[9px] font-black text-sky-600 hover:text-sky-700 uppercase tracking-widest"
                        >
                          + Thêm mới
                        </button>
                    </div>
                    <select 
                      value={productForm.category}
                      onChange={e => setProductForm({...productForm, category: e.target.value})}
                      className="w-full h-12 px-5 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700 appearance-none"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                      {categories.length === 0 && (
                        <option value="Khác">Khác</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đơn vị tính</label>
                      <button
                        onClick={() => setShowUnitModal(true)}
                        className="text-[9px] font-black text-sky-600 hover:text-sky-700 uppercase tracking-widest"
                      >
                        + Thêm mới
                      </button>
                    </div>
                    <select
                      value={productForm.unit}
                      onChange={e => setProductForm({ ...productForm, unit: e.target.value })}
                      className="w-full h-12 px-5 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700 appearance-none"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giá nhập</label>
                    <div className="relative">
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-600" />
                       <Input 
                         type="number"
                         value={productForm.purchasePrice}
                         onChange={e => setProductForm({...productForm, purchasePrice: Number(e.target.value)})}
                         className="h-12 pl-12 rounded-lg bg-sky-50/30 border-none shadow-inner font-bold text-sky-700 font-mono" 
                       />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giá bán</label>
                    <div className="relative">
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-600" />
                       <Input 
                         type="number"
                         value={productForm.sellingPrice}
                         onChange={e => setProductForm({...productForm, sellingPrice: Number(e.target.value)})}
                         className="h-12 pl-12 rounded-lg bg-sky-50/30 border-none shadow-inner font-bold text-sky-700 font-mono" 
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
                       className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                    />
                 </div>
               )}
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100">
               <Button 
                 onClick={handleSaveProduct}
                 disabled={savingProduct}
                 className="w-full h-14 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black uppercase tracking-widest shadow-xl shadow-sky-900/20 gap-3"
                >
                 <Save className="h-5 w-5" />
                 <span>{savingProduct ? 'Đang lưu...' : 'Lưu sản phẩm'}</span>
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl border border-white overflow-hidden p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-lg bg-sky-600 text-white flex items-center justify-center">
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
                   className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700 uppercase" 
                   placeholder="Ví dụ: Đồ gia dụng" 
                />
              </div>
              <Button 
                onClick={handleAddCategory}
                className="w-full h-12 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black uppercase tracking-widest"
              >
                TẠO DANH MỤC
              </Button>
           </div>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl border border-white overflow-hidden p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="font-black text-slate-900 uppercase italic tracking-tight">Thêm đơn vị tính</h3>
              </div>
              <button onClick={() => setShowUnitModal(false)} className="text-slate-300 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ĐƠN VỊ MỚI</label>
              <Input
                value={newUnitName}
                onChange={e => setNewUnitName(e.target.value)}
                className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700"
                placeholder="VD: Cuộn, Bộ, Mét"
              />
            </div>
            <Button onClick={handleAddUnit} className="w-full h-12 rounded-lg bg-sky-600 hover:bg-sky-700 font-black uppercase tracking-widest">
              Lưu đơn vị
            </Button>
          </div>
        </div>
      )}

      {/* Stock Entry Modal */}
      {showStockModal && stockUpdatingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-white overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
             <div className="p-8 border-b border-slate-50 bg-slate-900">
                <div className="flex justify-between items-start">
                   <div className="space-y-2">
                      <div className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none">Cập nhật kho hàng</div>
                      <h2 className="text-xl font-black text-white uppercase italic tracking-tight leading-none">{stockUpdatingProduct.name}</h2>
                      <div className="text-[10px] font-black text-sky-400 uppercase tracking-widest mt-1">Tồn hiện tại: {stockUpdatingProduct.stock} {stockUpdatingProduct.unit}</div>
                   </div>
                   <button onClick={() => setShowStockModal(false)} className="text-white/20 hover:text-white transition-colors">
                      <X className="h-6 w-6" />
                   </button>
                </div>
             </div>

             <div className="p-8 space-y-6">
                {formError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                )}
                <div className="space-y-4">
                   <div className="p-5 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-4 group">
                      <div className="h-12 w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg transform group-focus-within:rotate-12 transition-transform">
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
                          className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                          value={stockUpdateForm.purchasePrice}
                          onChange={e => setUpdateForm({...stockUpdateForm, purchasePrice: Number(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GIÁ BÁN MỚI</label>
                        <Input 
                          type="number"
                          className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                          value={stockUpdateForm.sellingPrice}
                          onChange={e => setUpdateForm({...stockUpdateForm, sellingPrice: Number(e.target.value)})}
                        />
                      </div>
                   </div>

                   <div className="space-y-2 rounded-lg border border-slate-200 p-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">KIỂM KÊ NHANH (số tồn thực tế)</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="h-11 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700"
                          value={stockCheckActual}
                          onChange={e => setStockCheckActual(Number(e.target.value))}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => handleStockCheck(stockUpdatingProduct)}
                        >
                          Áp dụng
                        </Button>
                      </div>
                   </div>
                </div>

                <Button 
                  onClick={handleUpdateStock}
                  className="w-full h-16 rounded-lg bg-slate-900 hover:bg-sky-600 text-white font-black uppercase tracking-widest shadow-xl transition-all gap-3"
                >
                   <CheckCircle className="h-6 w-6" />
                   <span>Hoàn tất nhập hàng</span>
                </Button>
             </div>
          </div>
        </div>
      )}

      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-3 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <Package className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Kho hàng</h1>
            <p className="text-page-subtitle mt-1">{products.length} mặt hàng trong hệ thống</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative group flex-1 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
            <Input 
              className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-sky-500/20 transition-all font-semibold text-sm placeholder:text-slate-400" 
                placeholder="Tìm theo tên, SKU, danh mục..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            onClick={() => {
                resetProductForm();
                setShowProductModal(true);
            }}
            className="h-10 lg:h-11 px-4 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-900/20 transition-all text-white shrink-0 text-sm"
          >
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Thêm mới</span>
          </Button>
          <Button variant="outline" onClick={openBulkCheck} className="h-10 lg:h-11 px-4 rounded-lg text-sm">
            Kiểm kê
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tổng tồn kho (đơn vị)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{inventoryStats.totalUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Giá trị tồn (giá nhập)</p>
            <p className="mt-1 text-lg font-semibold text-sky-700 tabular-nums">{formatCurrency(inventoryStats.totalStockValue)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Mặt hàng sắp hết</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${inventoryStats.lowStock > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {inventoryStats.lowStock}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl shadow-slate-900/5 border border-white overflow-hidden">
          {/* Mobile View: High-polish Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 lg:hidden">
            {filteredProducts.map(product => (
              <div key={product.id} className="p-4 bg-white space-y-3 relative group active:bg-slate-50 transition-colors" onClick={() => openStockEntry(product)}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500 font-mono leading-none">{product.sku}</div>
                    <div className="font-semibold text-slate-900 text-lg leading-tight tracking-tight">{product.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditProduct(product);
                      }}
                      className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(product);
                      }}
                      className="h-9 w-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shadow-inner transition-transform group-hover:rotate-12 ${
                      product.stock <= product.lowStockThreshold ? 'bg-orange-50 text-orange-600' : 'bg-sky-50 text-sky-600'
                    }`}>
                      <Package className="h-4 w-4" />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg leading-none ring-1 ring-slate-200/50">{product.category}</span>
                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg leading-none ring-1 ring-slate-200/50">{product.unit}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-500">Tồn kho</div>
                    <div className={`text-lg font-semibold tabular-nums leading-none ${
                      product.stock <= product.lowStockThreshold ? 'text-orange-600' : 'text-slate-900'
                    }`}>
                      {product.stock} <span className="text-xs text-slate-400 font-medium ml-0.5">{product.unit}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xs font-medium text-slate-500">Giá nhập</div>
                    <div className="text-base font-semibold text-slate-600 tabular-nums leading-none">{formatCurrency(product.purchasePrice)}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xs font-medium text-slate-500">Giá bán</div>
                    <div className="text-lg font-semibold text-sky-700 tabular-nums leading-none">{formatCurrency(product.sellingPrice)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: Polished Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100">
                    <div className="flex items-center gap-2">Mã SKU <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100">Sản phẩm</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100">Danh mục</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100 text-right">Giá nhập</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100 text-right">Giá bán</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100 text-center">Tồn kho</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 border-b border-slate-100 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="group hover:bg-sky-50/20 transition-all duration-300">
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/50">{product.sku}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-slate-50 group-hover:bg-white group-hover:shadow-lg transition-all flex items-center justify-center text-slate-400 group-hover:text-sky-600 border border-transparent group-hover:border-sky-100">
                           <Package className="h-6 w-6 transform group-hover:rotate-12 transition-transform" />
                        </div>
                        <div className="font-semibold text-slate-900 tracking-tight text-xl leading-tight">{product.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">{product.category}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-500 tabular-nums">
                        {formatCurrency(product.purchasePrice)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <div className="font-semibold text-sky-700 text-2xl tabular-nums">{formatCurrency(product.sellingPrice)}</div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditProduct(product);
                          }}
                          className="text-xs font-medium text-slate-400 hover:text-sky-600 transition-colors"
                        >
                          Sửa giá
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <div className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-3 shadow-sm transition-transform group-hover:scale-105 ${
                          product.stock <= product.lowStockThreshold 
                            ? 'bg-orange-600 text-white ring-4 ring-orange-100' 
                            : 'bg-slate-900 text-white ring-4 ring-slate-100'
                        }`}>
                          <button className="hover:scale-125 transition-transform" onClick={(e) => {
                             e.stopPropagation();
                             openStockEntry(product);
                          }}><Plus className="h-4 w-4" /></button>
                          <span className="text-base font-semibold tabular-nums">{product.stock}</span>
                          <span className="opacity-70">{product.unit}</span>
                          {product.stock <= product.lowStockThreshold && <AlertTriangle className="h-4 w-4" />}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openEditProduct(product)}
                          className="h-10 w-10 rounded-lg bg-slate-50 hover:bg-sky-600 text-slate-400 hover:text-white transition-all shadow-sm ring-1 ring-slate-100 hover:ring-sky-500"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProduct(product)}
                          className="h-10 w-10 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white transition-all shadow-sm ring-1 ring-rose-100 hover:ring-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
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
              <div className="inline-flex h-32 w-32 items-center justify-center rounded-lg bg-slate-50 text-slate-200 shadow-inner">
                <Search className="h-16 w-16 opacity-10" />
              </div>
              <p className="text-slate-300 font-black uppercase tracking-[0.5em] text-xs">Dữ liệu hàng hóa trống</p>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Lịch sử kho gần đây</h3>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value as any)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">Tất cả</option>
              <option value="in">Nhập kho</option>
              <option value="out">Xuất kho</option>
              <option value="adjust">Kiểm kê</option>
            </select>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleStockMovements.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Chưa có biến động kho.</p>
            ) : (
              visibleStockMovements.slice(0, 12).map((m) => (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{m.note || 'Biến động kho'}</p>
                    <p className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  <p className="text-sm text-slate-700 tabular-nums">
                    {m.beforeStock} → {m.afterStock} ({m.type === 'in' ? '+' : m.type === 'out' ? '-' : '±'}{m.quantity})
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
