import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Search, Plus, AlertTriangle, Package, ArrowUpDown, X, Save, Edit3, Tag, CheckCircle, Camera, Layers, Trash2, Upload, Download, ScanLine, Barcode, SlidersHorizontal, ListFilter, Ellipsis, Settings2 } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Product } from '../types';
import { v4 as uuid } from 'uuid';
import { productsApi, stockMovementsApi, priceListsApi, productUnitsApi, productComponentsApi, unitsApi } from '../lib/api';
import * as XLSX from 'xlsx';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';

type ImportPreviewRow = {
  rowNumber: number;
  mode: 'create' | 'update' | 'skip';
  errors: string[];
  payload: Partial<Product>;
  existingId?: string;
};

type NumericDraft = number | string;

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  purchasePrice: NumericDraft;
  sellingPrice: NumericDraft;
  taxRate: NumericDraft;
  stock: NumericDraft;
  lowStockThreshold: NumericDraft;
  imageUrl: string;
  productType: 'standard' | 'combo';
};

type StockUpdateFormState = {
  quantity: NumericDraft;
  purchasePrice: NumericDraft;
  sellingPrice: NumericDraft;
};

const parseNumericDraft = (value: string): NumericDraft => value;

const formatCompactCurrency = (amount: number) => {
  const value = Number(amount) || 0;
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}tr`;
  }
  if (absolute >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return `${value}đ`;
};

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, activeTenant, categories, addCategory, updateCategory, deleteCategory, refreshProducts } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showBulkCheckModal, setShowBulkCheckModal] = useState(false);
  const [showMobileActionSheet, setShowMobileActionSheet] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockUpdatingProduct, setStockUpdatingProduct] = useState<Product | null>(null);
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState('');
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [stockCardProduct, setStockCardProduct] = useState<Product | null>(null);
  const [stockCardRows, setStockCardRows] = useState<any[]>([]);
  const [stockCardLoading, setStockCardLoading] = useState(false);
  const [stockCardError, setStockCardError] = useState('');
  const [stockCheckActual, setStockCheckActual] = useState<NumericDraft>(0);
  const [bulkCheckActuals, setBulkCheckActuals] = useState<Record<string, NumericDraft>>({});
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated_desc' | 'name_asc' | 'stock_asc' | 'stock_desc' | 'price_desc'>('updated_desc');
  const [importing, setImporting] = useState(false);
  const [showImportPreviewModal, setShowImportPreviewModal] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [selectedImportRows, setSelectedImportRows] = useState<number[]>([]);
  const [showBarcodeScannerModal, setShowBarcodeScannerModal] = useState(false);
  const [variantBarcodeIndex, setVariantBarcodeIndex] = useState<number | null>(null);
  const [componentBarcodeIndex, setComponentBarcodeIndex] = useState<number | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showInlinePriceListForm, setShowInlinePriceListForm] = useState(false);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [editingPriceListId, setEditingPriceListId] = useState<string | null>(null);
  const [editingPriceListDraft, setEditingPriceListDraft] = useState({ name: '', customerType: 'all' });
  const [productVariantDrafts, setProductVariantDrafts] = useState<Array<{ name: string; factor: NumericDraft; barcode: string }>>([]);
  const [productComponentDrafts, setProductComponentDrafts] = useState<Array<{ componentProductId: string; quantity: NumericDraft }>>([]);
  const [productPriceDrafts, setProductPriceDrafts] = useState<Record<string, NumericDraft>>({});
  const [newPriceList, setNewPriceList] = useState({ name: '', customerType: 'all' });
  const [pricingMessage, setPricingMessage] = useState('');
  const [catalogUnits, setCatalogUnits] = useState<any[]>([]);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingUnitName, setEditingUnitName] = useState('');
  const [unitMessage, setUnitMessage] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const unitOptions = useMemo(() => {
    const defaults = ['Cái', 'Chai', 'Thùng', 'Hộp', 'Gói', 'Bộ', 'Kg', 'Lít'];
    const dynamicUnits = products.map((p) => p.unit).filter(Boolean);
    return Array.from(new Set([...defaults, ...customUnits, ...catalogUnits.map((unit) => unit.name), ...dynamicUnits, ...products.flatMap((product) => (product.units || []).map((unit: any) => unit.name))]));
  }, [catalogUnits, customUnits, products]);

  useEffect(() => {
    if (!activeTenant) return;
    void unitsApi.list()
      .then((units) => setCatalogUnits(units))
      .catch(() => setCatalogUnits([]));
  }, [activeTenant]);

  const [productForm, setProductForm] = useState<ProductFormState>({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    unit: '',
    purchasePrice: 0,
    sellingPrice: 0,
    taxRate: 0,
    stock: 0,
    lowStockThreshold: 10,
    imageUrl: '',
    productType: 'standard' as 'standard' | 'combo'
  });

  const generateNextSku = () => {
    const usedSkus = new Set(products.map((product) => product.sku.trim().toUpperCase()).filter(Boolean));
    const highestSequence = products.reduce((highest, product) => {
      const match = product.sku.trim().match(/(?:SKU|SP)?(\d+)$/i);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    let sequence = highestSequence + 1;
    let candidate = `SKU${String(sequence).padStart(3, '0')}`;
    while (usedSkus.has(candidate)) {
      sequence += 1;
      candidate = `SKU${String(sequence).padStart(3, '0')}`;
    }
    return candidate;
  };

  const [stockUpdateForm, setUpdateForm] = useState<StockUpdateFormState>({
    quantity: 0,
    purchasePrice: 0,
    sellingPrice: 0
  });

  const resetProductForm = () => {
    setProductForm({
      name: '',
      sku: '',
      barcode: '',
      category: categories[0]?.name || 'Tạp hóa',
      unit: unitOptions[0] || 'Cái',
      purchasePrice: 0,
      sellingPrice: 0,
      taxRate: 0,
      stock: 0,
      lowStockThreshold: 10,
      imageUrl: '',
      productType: 'standard'
    });
    setEditingProduct(null);
    setProductVariantDrafts([]);
    setProductComponentDrafts([]);
    setProductPriceDrafts({});
  };

  const comboBasePriceForList = (list: any, components = productComponentDrafts) => components.reduce((total, component) => {
    const componentProduct = products.find((item) => item.id === component.componentProductId);
    if (!componentProduct) return total;
    const savedPrice = list?.items?.find((item: any) => item.productId === componentProduct.id && item.unitName === componentProduct.unit);
    return total + (Number(component.quantity) || 0) * Number(savedPrice?.price ?? componentProduct.sellingPrice ?? 0);
  }, 0);

  const productFormBasePrice = (list: any, components = productComponentDrafts) => {
    const draft = list?.id ? productPriceDrafts[list.id] : undefined;
    if (draft !== undefined && draft !== '') return Number(draft) || 0;
    return productForm.productType === 'combo'
      ? comboBasePriceForList(list, components)
      : Number(productForm.sellingPrice || 0);
  };

  const loadProductPriceDrafts = (lists: any[], product: Product | null = null) => {
    setProductPriceDrafts(Object.fromEntries(lists.map((list: any) => {
      const saved = product ? list.items?.find((item: any) => item.productId === product.id && item.unitName === product.unit) : undefined;
      return [list.id, product ? Number(saved?.price ?? product.sellingPrice ?? 0) : undefined];
    })));
  };

  const openCreateProduct = async () => {
    resetProductForm();
    setProductForm((previous) => ({ ...previous, sku: generateNextSku() }));
    setFormError('');
    try {
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      loadProductPriceDrafts(lists);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể tải bảng giá.');
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    setFormError('');
    if (!productForm.name || !productForm.sku || !activeTenant) {
      setFormError('Vui lòng nhập tên sản phẩm và mã SKU.');
      return;
    }
    const normalizedSku = productForm.sku.trim().toLowerCase();
    const duplicateSku = products.find((product) =>
      product.id !== editingProduct?.id && product.sku.trim().toLowerCase() === normalizedSku
    );
    if (duplicateSku) {
      setFormError(`SKU ${productForm.sku.trim()} đã tồn tại ở sản phẩm "${duplicateSku.name}".`);
      return;
    }
    if (!productForm.category || !productForm.unit) {
      setFormError('Vui lòng chọn danh mục và đơn vị tính.');
      return;
    }

    const variants = productVariantDrafts
      .map((variant) => ({ name: variant.name.trim(), factor: Number(variant.factor), barcode: variant.barcode.trim() }))
      .filter((variant) => variant.name);
    if (productForm.productType === 'standard') {
      if (variants.some((variant) => variant.name === productForm.unit.trim())) {
        setFormError('Tên biến thể phải khác đơn vị cơ sở.');
        return;
      }
      if (variants.some((variant) => !Number.isFinite(variant.factor) || variant.factor <= 0)) {
        setFormError('Tỷ suất quy đổi của biến thể phải lớn hơn 0.');
        return;
      }
      if (new Set(variants.map((variant) => variant.name.toLowerCase())).size !== variants.length) {
        setFormError('Tên các biến thể không được trùng nhau.');
        return;
      }
    }

    const components = productComponentDrafts
      .map((component) => ({ componentProductId: component.componentProductId, quantity: Number(component.quantity) }))
      .filter((component) => component.componentProductId);
    if (productForm.productType === 'combo') {
      if (!components.length) {
        setFormError('Combo cần có ít nhất một sản phẩm thành phần.');
        return;
      }
      if (components.some((component) => !Number.isFinite(component.quantity) || component.quantity <= 0)) {
        setFormError('Số lượng sản phẩm thành phần phải lớn hơn 0.');
        return;
      }
      if (new Set(components.map((component) => component.componentProductId)).size !== components.length) {
        setFormError('Mỗi sản phẩm chỉ được thêm một lần vào combo.');
        return;
      }
    }

    setSavingProduct(true);
    const productId = editingProduct?.id || uuid();
    let currentPriceLists = priceLists;
    if (!currentPriceLists.length) {
      try {
        currentPriceLists = await priceListsApi.list(true);
      } catch (err) {
        setSavingProduct(false);
        setFormError(err instanceof Error ? err.message : 'Không thể tải bảng giá.');
        return;
      }
    }
    if (!priceLists.length) setPriceLists(currentPriceLists);
    const defaultList = currentPriceLists.find((list: any) => list.isDefault) || currentPriceLists[0];
    const defaultSellingPrice = productFormBasePrice(defaultList, components);
    const payload = {
      ...productForm,
      category: productForm.category.trim(),
      unit: productForm.unit.trim(),
      purchasePrice: productForm.productType === 'combo' ? 0 : Number(productForm.purchasePrice) || 0,
      sellingPrice: defaultSellingPrice,
      taxRate: Number(productForm.taxRate) || 0,
      stock: productForm.productType === 'combo' ? 0 : Number(productForm.stock) || 0,
      lowStockThreshold: Number(productForm.lowStockThreshold) || 0,
      productType: productForm.productType,
    };
    let success = false;
    if (editingProduct) {
      success = await updateProduct(productId, payload);
    } else {
      const product: Product = {
        id: productId,
        tenantId: activeTenant.id,
        trackStock: true,
        status: 'active',
        ...payload
      };
      success = await addProduct(product);
    }
    if (!success) {
      setSavingProduct(false);
      setFormError('Không thể lưu sản phẩm. Vui lòng kiểm tra ảnh hoặc kết nối API.');
      return;
    }

    try {
      await productUnitsApi.save(productId, productForm.productType === 'standard' ? variants : []);
      await productComponentsApi.save(productId, productForm.productType === 'combo' ? components : []);

      for (const list of currentPriceLists) {
        const basePrice = productFormBasePrice(list, components);
        const rows = [
          { productId, unitName: productForm.unit.trim(), unitFactor: 1, price: basePrice },
          ...(productForm.productType === 'standard'
            ? variants.map((variant) => ({ productId, unitName: variant.name, unitFactor: variant.factor, price: basePrice * Number(variant.factor) }))
            : []),
        ];
        const existingItems = (list.items || []).filter((item: any) => item.productId !== productId);
        await priceListsApi.saveItems(list.id, [...existingItems, ...rows]);
      }
      await refreshProducts();
      setSavingProduct(false);
      setShowProductModal(false);
      resetProductForm();
    } catch (err) {
      setSavingProduct(false);
      setFormError(err instanceof Error ? err.message : 'Sản phẩm đã lưu nhưng chưa lưu được biến thể, combo hoặc bảng giá.');
    }
  };

  const handleUpdateStock = async () => {
    if (!stockUpdatingProduct) return;
    const quantity = stockUpdateForm.quantity === '' ? NaN : Number(stockUpdateForm.quantity);
    const purchasePrice = Number(stockUpdateForm.purchasePrice || 0);
    const sellingPrice = Number(stockUpdateForm.sellingPrice || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError('Số lượng nhập kho phải lớn hơn 0.');
      return;
    }

    await productsApi.adjustStock(stockUpdatingProduct.id, quantity, 'increase', 'Nhập kho thủ công');
    const success = await updateProduct(stockUpdatingProduct.id, {
      stock: stockUpdatingProduct.stock + quantity,
      purchasePrice: purchasePrice > 0 ? purchasePrice : stockUpdatingProduct.purchasePrice,
      sellingPrice: sellingPrice > 0 ? sellingPrice : stockUpdatingProduct.sellingPrice
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
    const actual = stockCheckActual === '' ? NaN : Number(stockCheckActual);
    if (!Number.isFinite(actual) || actual < 0) {
      setFormError('Số lượng kiểm kê không hợp lệ.');
      return;
    }
    await stockMovementsApi.stockCheck(product.id, actual, 'Kiểm kê nhanh');
    await updateProduct(product.id, { stock: actual });
    const movements = await stockMovementsApi.list();
    setStockMovements(movements.slice(0, 40));
    setStockCheckActual(0);
  };

  const openBulkCheck = () => {
    const defaults: Record<string, NumericDraft> = {};
    visibleProducts.forEach((p) => { defaults[p.id] = p.stock; });
    setBulkCheckActuals(defaults);
    setShowBulkCheckModal(true);
  };

  const handleBulkCheckApply = async () => {
    setFormError('');
    try {
      for (const product of visibleProducts) {
        const draftActual = bulkCheckActuals[product.id];
        const actual = draftActual === '' || draftActual === undefined ? NaN : Number(draftActual);
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

  const openEditProduct = async (product: Product) => {
    setEditingProduct(product);
    setFormError('');
    setProductForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: product.category,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      taxRate: product.taxRate || 0,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      imageUrl: product.imageUrl || '',
      productType: product.productType || 'standard'
    });
    try {
      const [lists, units, components] = await Promise.all([
        priceListsApi.list(true),
        productUnitsApi.list(product.id),
        productComponentsApi.list(product.id),
      ]);
      setPriceLists(lists);
      loadProductPriceDrafts(lists, product);
      setProductVariantDrafts(units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).map((unit: any) => ({ name: unit.name, factor: Number(unit.factor) || 1, barcode: unit.barcode || '' })));
      setProductComponentDrafts(components.map((component: any) => ({ componentProductId: component.componentProductId, quantity: Number(component.quantity) })));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể tải cấu hình sản phẩm.');
      setProductVariantDrafts([]);
      setProductComponentDrafts([]);
    }
    setShowProductModal(true);
  };

  const openPricing = async () => {
    setPricingMessage('');
    try {
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setShowPricingModal(true);
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tải cấu hình bán hàng.');
    }
  };

  const createPriceList = async () => {
    if (!newPriceList.name.trim()) return;
    try {
      await priceListsApi.create({ name: newPriceList.name.trim(), customerType: newPriceList.customerType, active: true });
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setProductPriceDrafts((previous) => Object.fromEntries(lists.map((list: any) => [list.id, previous[list.id] ?? 0])));
      setNewPriceList({ name: '', customerType: 'all' });
      setPricingMessage('Đã tạo bảng giá mới.');
      setShowInlinePriceListForm(false);
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tạo bảng giá.');
    }
  };

  const beginEditPriceList = (list: any) => {
    setEditingPriceListId(list.id);
    setEditingPriceListDraft({ name: list.name, customerType: list.customerType || 'all' });
    setPricingMessage('');
  };

  const savePriceList = async () => {
    if (!editingPriceListId || !editingPriceListDraft.name.trim()) return;
    try {
      await priceListsApi.update(editingPriceListId, {
        name: editingPriceListDraft.name.trim(),
        customerType: editingPriceListDraft.customerType,
      });
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setEditingPriceListId(null);
      setPricingMessage('Đã cập nhật bảng giá.');
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể cập nhật bảng giá.');
    }
  };

  const deletePriceList = async (list: any) => {
    if (list.isDefault) {
      setPricingMessage('Không thể xóa bảng giá mặc định.');
      return;
    }
    if (!window.confirm(`Xóa bảng giá "${list.name}"? Các giá đã nhập trong bảng này cũng sẽ bị xóa.`)) return;
    try {
      await priceListsApi.remove(list.id);
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setPricingMessage('Đã xóa bảng giá.');
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể xóa bảng giá.');
    }
  };

  const refreshUnitCatalog = async () => {
    try {
      const units = await unitsApi.list();
      setCatalogUnits(units);
      return units;
    } catch (err) {
      setUnitMessage(err instanceof Error ? err.message : 'Không thể tải đơn vị tính.');
      return [];
    }
  };

  const openUnitManager = async () => {
    setUnitMessage('');
    setEditingUnitId(null);
    setEditingUnitName('');
    await refreshUnitCatalog();
    setShowUnitModal(true);
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

  const openStockCard = async (product: Product) => {
    setStockCardProduct(product);
    setStockCardRows([]);
    setStockCardError('');
    setStockCardLoading(true);
    try {
      const rows = await stockMovementsApi.list(product.id);
      setStockCardRows(rows);
    } catch (err) {
      setStockCardError(err instanceof Error ? err.message : 'Không thể tải thẻ kho.');
    } finally {
      setStockCardLoading(false);
    }
  };

  const closeStockCard = () => {
    setStockCardProduct(null);
    setStockCardRows([]);
    setStockCardError('');
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

  const handleRenameCategory = async (categoryId: string) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    const success = await updateCategory(categoryId, name);
    if (!success) {
      setFormError('Không thể đổi tên danh mục. Tên có thể đã tồn tại hoặc bạn chưa có quyền.');
      return;
    }
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setFormError('');
  };

  const handleDeleteCategory = async (category: { id: string; name: string }) => {
    if (!window.confirm(`Xóa danh mục "${category.name}"?`)) return;
    const success = await deleteCategory(category.id);
    if (!success) setFormError('Không thể xóa danh mục đang được sử dụng hoặc bạn chưa có quyền.');
    else if (productForm.category === category.name) setProductForm((previous) => ({ ...previous, category: categories.find((item) => item.id !== category.id)?.name || '' }));
  };

  const handleAddUnit = async () => {
    const normalized = newUnitName.trim();
    if (!normalized) return;
    try {
      const unit = await unitsApi.create({ name: normalized });
      setCatalogUnits((previous) => [...previous, unit]);
      if (!unitOptions.includes(normalized)) {
        setCustomUnits((prev) => [...prev, normalized]);
      }
      setProductForm((prev) => ({ ...prev, unit: normalized }));
      setNewUnitName('');
      setUnitMessage('Đã thêm đơn vị tính.');
    } catch (err) {
      setUnitMessage(err instanceof Error ? err.message : 'Không thể thêm đơn vị tính.');
    }
  };

  const saveUnitName = async () => {
    if (!editingUnitId || !editingUnitName.trim()) return;
    try {
      const currentUnit = catalogUnits.find((unit) => unit.id === editingUnitId);
      const updated = await unitsApi.update(editingUnitId, { name: editingUnitName.trim() });
      setCatalogUnits((previous) => previous.map((unit) => unit.id === editingUnitId ? { ...unit, ...updated } : unit));
      if (currentUnit?.name === productForm.unit) setProductForm((previous) => ({ ...previous, unit: updated.name }));
      setEditingUnitId(null);
      setEditingUnitName('');
      await refreshProducts();
      setUnitMessage('Đã đổi tên đơn vị tính.');
    } catch (err) {
      setUnitMessage(err instanceof Error ? err.message : 'Không thể đổi tên đơn vị tính.');
    }
  };

  const deleteUnit = async (unit: any) => {
    if (Number(unit.inUseCount) > 0) {
      setUnitMessage('Đơn vị đang được dùng bởi sản phẩm hoặc biến thể. Hãy đổi đơn vị trước khi xóa.');
      return;
    }
    if (!window.confirm(`Xóa đơn vị tính "${unit.name}"?`)) return;
    try {
      await unitsApi.remove(unit.id);
      setCatalogUnits((previous) => previous.filter((item) => item.id !== unit.id));
      setUnitMessage('Đã xóa đơn vị tính.');
    } catch (err) {
      setUnitMessage(err instanceof Error ? err.message : 'Không thể xóa đơn vị tính.');
    }
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

  const normalizeHeader = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ_]/g, '');

  const parseNumber = (value: unknown, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const parseBoolean = (value: unknown, fallback = true) => {
    if (value === null || value === undefined || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'có', 'co'].includes(text);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeTenant) return;

    setFormError('');
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('File không có sheet dữ liệu.');
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) throw new Error('File rỗng, chưa có dòng dữ liệu.');

      const existingBySku = new Map<string, Product>(products.map((p) => [p.sku.trim().toLowerCase(), p]));
      const preview: ImportPreviewRow[] = [];

      for (const [index, rawRow] of rows.entries()) {
        const mapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawRow)) {
          const k = normalizeHeader(key);
          if (['sku', 'mãsku', 'masanpham', 'ma'].includes(k)) mapped.sku = value;
          else if (['name', 'ten', 'tensanpham', 'sanpham'].includes(k)) mapped.name = value;
          else if (['barcode', 'mavach', 'ean', 'upc'].includes(k)) mapped.barcode = value;
          else if (['category', 'danhmuc'].includes(k)) mapped.category = value;
          else if (['unit', 'donvitinh', 'donvi'].includes(k)) mapped.unit = value;
          else if (['purchaseprice', 'gianhap'].includes(k)) mapped.purchasePrice = value;
          else if (['sellingprice', 'giaban'].includes(k)) mapped.sellingPrice = value;
          else if (['stock', 'tonkho'].includes(k)) mapped.stock = value;
          else if (['lowstockthreshold', 'muctoncanhbao', 'canhbao'].includes(k)) mapped.lowStockThreshold = value;
          else if (['status', 'trangthai'].includes(k)) mapped.status = value;
          else if (['trackstock', 'theodoitonkho'].includes(k)) mapped.trackStock = value;
        }

        const sku = String(mapped.sku || '').trim();
        const name = String(mapped.name || '').trim();
        const errors: string[] = [];
        if (!sku) errors.push('Thiếu SKU');
        if (!name) errors.push('Thiếu tên sản phẩm');

        const payload: Partial<Product> = {
          sku,
          name,
          barcode: String(mapped.barcode || '').trim(),
          category: String(mapped.category || '').trim() || categories[0]?.name || 'Khác',
          unit: String(mapped.unit || '').trim() || 'Cái',
          purchasePrice: parseNumber(mapped.purchasePrice, 0),
          sellingPrice: parseNumber(mapped.sellingPrice, 0),
          stock: parseNumber(mapped.stock, 0),
          lowStockThreshold: parseNumber(mapped.lowStockThreshold, 10),
          status: String(mapped.status || '').trim() === 'inactive' ? 'inactive' : 'active',
          trackStock: parseBoolean(mapped.trackStock, true),
        };

        const existing = existingBySku.get(sku.toLowerCase());
        preview.push({
          rowNumber: index + 2,
          mode: errors.length ? 'skip' : existing ? 'update' : 'create',
          errors,
          payload,
          existingId: existing?.id,
        });
      }

      setImportPreviewRows(preview);
      setSelectedImportRows(preview.map((row, idx) => (!row.errors.length ? idx : -1)).filter((idx) => idx >= 0));
      setShowImportPreviewModal(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể import file CSV/Excel.');
    } finally {
      setImporting(false);
    }
  };

  const applyImportPreview = async () => {
    if (!activeTenant) return;
    setFormError('');
    setImporting(true);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      for (const [idx, row] of importPreviewRows.entries()) {
        if (!selectedImportRows.includes(idx)) {
          skipped += 1;
          continue;
        }
        if (row.mode === 'skip' || row.errors.length) {
          skipped += 1;
          continue;
        }

        if (row.mode === 'update' && row.existingId) {
          const ok = await updateProduct(row.existingId, row.payload);
          if (ok) updated += 1;
          else skipped += 1;
          continue;
        }

        const product: Product = {
          id: uuid(),
          tenantId: activeTenant.id,
          sku: row.payload.sku || '',
          name: row.payload.name || '',
          barcode: row.payload.barcode,
          category: row.payload.category || 'Khác',
          unit: row.payload.unit || 'Cái',
          purchasePrice: row.payload.purchasePrice || 0,
          sellingPrice: row.payload.sellingPrice || 0,
          taxRate: row.payload.taxRate || 0,
          stock: row.payload.stock || 0,
          trackStock: row.payload.trackStock ?? true,
          lowStockThreshold: row.payload.lowStockThreshold || 10,
          status: row.payload.status || 'active',
        };
        const ok = await addProduct(product);
        if (ok) created += 1;
        else skipped += 1;
      }

      setShowImportPreviewModal(false);
      setImportPreviewRows([]);
      setSelectedImportRows([]);
      window.alert(`Import hoàn tất.\nTạo mới: ${created}\nCập nhật: ${updated}\nBỏ qua: ${skipped}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể áp dụng import.');
    } finally {
      setImporting(false);
    }
  };

  const togglePreviewRowSelection = (idx: number) => {
    setSelectedImportRows((prev) =>
      prev.includes(idx) ? prev.filter((item) => item !== idx) : [...prev, idx]
    );
  };

  const selectAllValidPreviewRows = () => {
    setSelectedImportRows(
      importPreviewRows
        .map((row, idx) => (!row.errors.length ? idx : -1))
        .filter((idx) => idx >= 0)
    );
  };

  const clearAllPreviewRows = () => {
    setSelectedImportRows([]);
  };

  const closeBarcodeScannerModal = () => {
    setShowBarcodeScannerModal(false);
    setVariantBarcodeIndex(null);
    setComponentBarcodeIndex(null);
  };

  const downloadTemplates = () => {
    const templateRows = [
      {
        sku: 'SKU001',
        name: 'Bút bi xanh',
        barcode: '8931234567890',
        category: 'Văn phòng phẩm',
        unit: 'Cây',
        purchasePrice: 3000,
        sellingPrice: 5000,
        stock: 120,
        lowStockThreshold: 20,
        status: 'active',
        trackStock: true,
      },
      {
        sku: 'SKU002',
        name: 'Sổ tay A5',
        barcode: '8939876543210',
        category: 'Văn phòng phẩm',
        unit: 'Quyển',
        purchasePrice: 12000,
        sellingPrice: 18000,
        stock: 50,
        lowStockThreshold: 10,
        status: 'active',
        trackStock: true,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'hkdplus-product-import-template.xlsx');

    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'hkdplus-product-import-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const filteredProducts = useMemo(() => {
    const keyword = normalizeSearchText(searchTerm);
    return products.filter((p) => {
      const matchesKeyword =
        !keyword ||
        normalizeSearchText(p.name).includes(keyword) ||
        normalizeSearchText(p.sku).includes(keyword) ||
        normalizeSearchText(p.barcode).includes(keyword) ||
        normalizeSearchText(p.category).includes(keyword);
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const availableStock = Number(p.availableStock ?? p.stock);
      const matchesStockStatus =
        stockStatusFilter === 'all' ||
        (stockStatusFilter === 'in_stock' && availableStock > p.lowStockThreshold) ||
        (stockStatusFilter === 'low_stock' && availableStock > 0 && availableStock <= p.lowStockThreshold) ||
        (stockStatusFilter === 'out_of_stock' && availableStock <= 0);
      return matchesKeyword && matchesCategory && matchesStockStatus;
    });
  }, [products, searchTerm, categoryFilter, stockStatusFilter]);

  const visibleProducts = useMemo(() => {
    const rows = [...filteredProducts];
    switch (sortBy) {
      case 'name_asc':
        rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        break;
      case 'stock_asc':
        rows.sort((a, b) => Number(a.availableStock ?? a.stock) - Number(b.availableStock ?? b.stock));
        break;
      case 'stock_desc':
        rows.sort((a, b) => Number(b.availableStock ?? b.stock) - Number(a.availableStock ?? a.stock));
        break;
      case 'price_desc':
        rows.sort((a, b) => b.sellingPrice - a.sellingPrice);
        break;
      default:
        rows.sort((a, b) => b.id.localeCompare(a.id));
        break;
    }
    return rows;
  }, [filteredProducts, sortBy]);

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

  useEffect(() => {
    const productId = searchParams.get('productId');
    if (!productId || !products.length || showProductModal) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    void openEditProduct(product).finally(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('productId');
      setSearchParams(nextParams, { replace: true });
    });
  }, [products, searchParams, setSearchParams, showProductModal]);

  const inventoryStats = useMemo(() => {
    const lowStock = products.filter((p) => p.trackStock && Number(p.availableStock ?? p.stock) <= p.lowStockThreshold).length;
    const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const availableUnits = products.reduce((sum, p) => sum + Number(p.availableStock ?? p.stock ?? 0), 0);
    const totalStockValue = products.reduce((sum, p) => sum + (p.stock || 0) * (p.purchasePrice || 0), 0);
    return { lowStock, totalUnits, availableUnits, totalStockValue };
  }, [products]);

  const uniqueCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'vi')),
    [products]
  );

  const movementMeta = (type: 'in' | 'out' | 'adjust') => {
    if (type === 'in') return { label: 'Nhập kho', tone: 'bg-emerald-50 text-emerald-700' };
    if (type === 'out') return { label: 'Xuất kho', tone: 'bg-rose-50 text-rose-700' };
    return { label: 'Kiểm kê', tone: 'bg-amber-50 text-amber-700' };
  };

  const stockCardSummary = useMemo(() => stockCardRows.reduce((summary, row) => {
    const quantity = Number(row.quantity) || 0;
    if (row.type === 'in') summary.in += quantity;
    else if (row.type === 'out') summary.out += quantity;
    else summary.adjust += quantity;
    return summary;
  }, { in: 0, out: 0, adjust: 0 }), [stockCardRows]);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden relative">
      <BarcodeScannerModal
        open={showBarcodeScannerModal}
        title="Quét mã sản phẩm"
        onClose={closeBarcodeScannerModal}
        onDetected={(code) => {
          if (variantBarcodeIndex !== null) {
            setProductVariantDrafts((previous) => previous.map((row, index) => index === variantBarcodeIndex ? { ...row, barcode: code } : row));
          } else if (componentBarcodeIndex !== null) {
            const normalizedCode = normalizeSearchText(code);
            const matched = products.find((product) => normalizeSearchText(product.barcode) === normalizedCode || product.units?.some((unit) => normalizeSearchText(unit.barcode) === normalizedCode));
            if (matched && matched.productType !== 'combo') {
              setProductComponentDrafts((previous) => previous.map((row, index) => index === componentBarcodeIndex ? { ...row, componentProductId: matched.id } : row));
              setFormError('');
            } else {
              setFormError(`Không tìm thấy sản phẩm thường với mã ${code}.`);
            }
          } else {
            setProductForm((prev) => ({ ...prev, barcode: code }));
          }
          closeBarcodeScannerModal();
        }}
      />

      {showImportPreviewModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Preview Import Sản phẩm</h3>
              <button onClick={() => setShowImportPreviewModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-3 text-xs text-slate-600 border-b border-slate-100">
              Hợp lệ: {importPreviewRows.filter((r) => !r.errors.length).length} dòng ·
              Đã chọn: {selectedImportRows.length} dòng ·
              Có lỗi: {importPreviewRows.filter((r) => r.errors.length).length} dòng
              <div className="mt-2 flex gap-2">
                <button onClick={selectAllValidPreviewRows} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                  Chọn tất cả hợp lệ
                </button>
                <button onClick={clearAllPreviewRows} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-10">Chọn</th>
                    <th className="px-3 py-2">Dòng</th>
                    <th className="px-3 py-2">Hành động</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Tên</th>
                    <th className="px-3 py-2">Danh mục</th>
                    <th className="px-3 py-2">Giá bán</th>
                    <th className="px-3 py-2">Lỗi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importPreviewRows.map((r, idx) => (
                    <tr key={`${r.rowNumber}-${idx}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedImportRows.includes(idx)}
                          onChange={() => togglePreviewRowSelection(idx)}
                          disabled={r.errors.length > 0}
                        />
                      </td>
                      <td className="px-3 py-2">{r.rowNumber}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-1 text-xs ${
                          r.mode === 'create' ? 'bg-emerald-50 text-emerald-700' :
                          r.mode === 'update' ? 'bg-sky-50 text-sky-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {r.mode === 'create' ? 'Tạo mới' : r.mode === 'update' ? 'Cập nhật' : 'Bỏ qua'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{r.payload.sku || '-'}</td>
                      <td className="px-3 py-2">{r.payload.name || '-'}</td>
                      <td className="px-3 py-2">{r.payload.category || '-'}</td>
                      <td className="px-3 py-2">{typeof r.payload.sellingPrice === 'number' ? formatCurrency(r.payload.sellingPrice) : '-'}</td>
                      <td className="px-3 py-2 text-rose-700">{r.errors.join(', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button variant="outline" onClick={() => setShowImportPreviewModal(false)}>Hủy</Button>
              <Button onClick={applyImportPreview} disabled={importing}>
                {importing ? 'Đang import...' : 'Xác nhận import'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showMobileActionSheet && (
        <div className="fixed inset-0 z-[125] flex items-end bg-slate-900/40 lg:hidden" onClick={() => setShowMobileActionSheet(false)}>
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="space-y-2">
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Đang import...' : 'Import CSV/Excel'}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  downloadTemplates();
                }}
              >
                <Download className="h-4 w-4" />
                Tải mẫu
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  openBulkCheck();
                }}
              >
                <ListFilter className="h-4 w-4" />
                Kiểm kê
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  setShowCategoryModal(true);
                }}
              >
                <Layers className="h-4 w-4" />
                Quản lý danh mục
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  void openUnitManager();
                }}
              >
                <Tag className="h-4 w-4" />
                Quản lý đơn vị tính
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  void openPricing();
                }}
              >
                <Settings2 className="h-4 w-4" />
                Quản lý bảng giá
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {showBulkCheckModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Kiểm kê hàng loạt</h3>
              <button onClick={() => setShowBulkCheckModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
              {visibleProducts.map((p) => (
                <div key={p.id} className="px-5 py-3 grid grid-cols-12 items-center gap-3">
                  <div className="col-span-5">
                    <p className="text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.sku} · Hiện tại: {p.stock} {p.unit}</p>
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      value={bulkCheckActuals[p.id] ?? p.stock}
                      onChange={(e) => setBulkCheckActuals((prev) => ({ ...prev, [p.id]: parseNumericDraft(e.target.value) }))}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-3 text-xs text-slate-500">
                    Chênh: {bulkCheckActuals[p.id] === '' ? '—' : Number(bulkCheckActuals[p.id] ?? p.stock) - p.stock}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button variant="outline" onClick={() => setShowBulkCheckModal(false)}>Hủy</Button>
              <Button onClick={handleBulkCheckApply}>Áp dụng kiểm kê</Button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm animate-in fade-in duration-300 sm:p-4">
          <div className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white bg-white shadow-2xl animate-in zoom-in-95 duration-500 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2 sm:px-4 sm:py-3">
               <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shadow-sky-900/20 sm:h-8 sm:w-8">
                     <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm md:text-base font-semibold leading-5 text-slate-900">{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                    <p className="text-[11px] text-slate-500">Thông tin hàng hóa cơ bản</p>
                  </div>
               </div>
               <button onClick={() => setShowProductModal(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-red-600 transition-all flex items-center justify-center">
                  <X className="h-4 w-4" />
               </button>
            </div>
            
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 custom-scrollbar sm:space-y-3 sm:px-4 sm:py-3 md:px-5">
               {formError && (
                 <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                   {formError}
                 </div>
               )}
               <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Hình ảnh sản phẩm</label>
                    <div className="relative group/img">
                      <div className="h-20 w-full rounded-lg border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/img:border-sky-300 sm:h-24 md:h-32">
                        {productForm.imageUrl ? (
                          <img src={productForm.imageUrl} className="h-full w-full object-cover" alt="Preview" />
                        ) : (
                          <>
                            <Camera className="h-6 w-6 text-slate-300 group-hover/img:scale-110 transition-transform" />
                            <span className="text-[11px] font-medium text-slate-500 mt-1.5">Tải ảnh lên</span>
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
                          className="absolute -top-1.5 -right-1.5 h-7 w-7 rounded-full bg-white shadow-md border border-slate-100 text-red-500 flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500">Tên sản phẩm</label>
                      <Input
                        value={productForm.name}
                        onChange={e => setProductForm({...productForm, name: e.target.value})}
                        className="h-8 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm sm:h-9"
                        placeholder="Ví dụ: Nước ngọt Coca"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500">Mã SKU</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                        <Input
                          value={productForm.sku}
                          onChange={e => setProductForm({...productForm, sku: e.target.value})}
                          className="h-8 pl-9 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm sm:h-9"
                          placeholder="Ví dụ: SP001"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500">Mã vạch</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                        <Input
                          value={productForm.barcode}
                          onChange={e => setProductForm({...productForm, barcode: e.target.value})}
                          className="h-8 pl-9 pr-24 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm sm:h-9"
                          placeholder="EAN/UPC/Code128 (không bắt buộc)"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBarcodeScannerModal(true)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-2 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1 text-[11px] font-medium"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <ScanLine className="h-3.5 w-3.5" />
                          Quét
                        </button>
                      </div>
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[11px] font-semibold text-slate-500">Danh mục</label>
                        <button 
                          onClick={() => setShowCategoryModal(true)}
                          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Quản lý
                        </button>
                    </div>
                    <select 
                      value={productForm.category}
                      onChange={e => setProductForm({...productForm, category: e.target.value})}
                      className="w-full h-8 px-3 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm appearance-none sm:h-9"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                      {categories.length === 0 && (
                        <option value="Khác">Khác</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Loại hàng hóa</label>
                    <select
                      value={productForm.productType}
                      onChange={e => {
                        const productType = e.target.value as 'standard' | 'combo';
                        setProductForm({ ...productForm, productType, ...(productType === 'combo' ? { purchasePrice: 0, stock: 0, unit: 'Bộ' } : {}) });
                        if (productType === 'combo') setProductVariantDrafts([]);
                      }}
                      className="w-full h-8 px-3 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm sm:h-9"
                    >
                      <option value="standard">Sản phẩm thường</option>
                      <option value="combo">Combo bán hàng</option>
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[11px] font-semibold text-slate-500">Đơn vị tính</label>
                      <button
                        onClick={() => void openUnitManager()}
                        className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Quản lý
                      </button>
                    </div>
                    <select
                      value={productForm.unit}
                      onChange={e => setProductForm({ ...productForm, unit: e.target.value })}
                      className="w-full h-8 px-3 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm appearance-none sm:h-9"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Giá nhập</label>
                    <div className="relative">
                       <Input 
                         type="number"
                         value={productForm.purchasePrice}
                         onChange={e => setProductForm((previous) => ({ ...previous, purchasePrice: parseNumericDraft(e.target.value) }))}
                         disabled={productForm.productType === 'combo'}
                         className="h-8 pr-9 rounded-lg bg-sky-50/30 border-none shadow-inner font-semibold text-sky-700 tabular-nums sm:h-9"
                       />
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-sky-700">đ</span>
                    </div>
                    {productForm.productType === 'combo' && <p className="text-[11px] text-slate-500">Combo không nhập kho trực tiếp nên không có giá nhập.</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Thuế suất (%)</label>
                    <Input type="number" min="0" max="100" value={productForm.taxRate} onChange={e => setProductForm((previous) => ({ ...previous, taxRate: parseNumericDraft(e.target.value) }))} className="h-8 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 tabular-nums sm:h-9" />
                  </div>
               </div>

               <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3 space-y-2">
                 <div className="flex items-start justify-between gap-3">
                   <div>
                     <h3 className="text-sm font-semibold text-slate-900">Giá bán theo bảng giá</h3>
                     <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                       Nhập giá tại đơn vị cơ sở <b>{productForm.unit || '—'}</b>. Giá biến thể sẽ tự tính theo tỷ suất quy đổi.
                     </p>
                   </div>
                   <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                     <button
                       type="button"
                       onClick={() => setShowInlinePriceListForm((visible) => !visible)}
                       className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
                     >
                       {showInlinePriceListForm ? 'Đóng' : '+ Tạo bảng giá'}
                     </button>
                     <button type="button" onClick={openPricing} className="text-[11px] font-medium text-slate-500 hover:text-sky-700">Quản lý</button>
                     <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-sky-700">Đơn vị cơ sở</span>
                   </div>
                 </div>
                 {priceLists.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Chưa có bảng giá. Hệ thống sẽ dùng giá cơ bản hiện có và tạo bảng giá mặc định khi lưu.</p>}
                 {showInlinePriceListForm && (
                   <div className="rounded-md border border-sky-200 bg-white p-2">
                     <div className="mb-1.5 flex items-center justify-between gap-2">
                       <span className="text-xs font-semibold text-slate-800">Tạo bảng giá mới</span>
                       <span className="text-[11px] text-slate-500">Giá áp dụng theo nhóm khách</span>
                     </div>
                     <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                       <Input
                         autoFocus
                         value={newPriceList.name}
                         onChange={(e) => setNewPriceList({ ...newPriceList, name: e.target.value })}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') {
                             e.preventDefault();
                             void createPriceList();
                           }
                         }}
                         placeholder="Ví dụ: Giá cơ quan"
                         className="h-9 text-xs"
                       />
                       <select
                         value={newPriceList.customerType}
                         onChange={(e) => setNewPriceList({ ...newPriceList, customerType: e.target.value })}
                         className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                       >
                         <option value="all">Mọi nhóm khách</option>
                         <option value="retail">Bán lẻ</option>
                         <option value="loyal">Khách thân thiết</option>
                       </select>
                       <Button type="button" onClick={createPriceList} disabled={!newPriceList.name.trim()} className="h-9 px-3 text-xs">Tạo bảng</Button>
                     </div>
                     {pricingMessage && <p className="mt-1.5 text-[11px] text-emerald-700">{pricingMessage}</p>}
                   </div>
                 )}
                 <div className="grid gap-2 md:grid-cols-2">
                   {priceLists.map((list: any) => {
                     const calculated = productForm.productType === 'combo' ? comboBasePriceForList(list) : undefined;
                     return <div key={list.id} className="rounded-md border border-white bg-white p-2">
                       <div className="mb-1 flex items-center justify-between gap-2">
                         <span className="text-xs font-semibold text-slate-700">{list.name}</span>
                         {list.isDefault && <span className="text-[10px] font-medium text-emerald-600">Mặc định</span>}
                       </div>
                       <div className="relative">
                         <Input
                           type="number"
                           min="0"
                           value={productForm.productType === 'combo' ? (productPriceDrafts[list.id] ?? calculated ?? 0) : (productPriceDrafts[list.id] ?? 0)}
                           onChange={(e) => setProductPriceDrafts((previous) => ({ ...previous, [list.id]: parseNumericDraft(e.target.value) }))}
                           className="h-9 pr-9 text-sm font-semibold tabular-nums"
                         />
                         <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">đ</span>
                       </div>
                     </div>;
                   })}
                 </div>
                 {productForm.productType === 'combo' && <p className="text-[11px] text-slate-500">Giá gợi ý là tổng giá thành phần. Có thể nhập giá combo riêng; giá thành phần không bị thay đổi.</p>}
               </div>

               {productForm.productType === 'standard' ? (
                 <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                   <div className="flex items-start justify-between gap-3">
                     <div>
                       <h3 className="text-sm font-semibold text-slate-900">Biến thể đơn vị bán</h3>
                       <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Đơn vị cơ sở: <b>{productForm.unit || '—'}</b> ×1. Ví dụ: 1 Hộp = 20 Cây.</p>
                     </div>
                     <Button variant="outline" className="h-8 shrink-0 px-2 text-xs" onClick={() => setProductVariantDrafts([...productVariantDrafts, { name: '', factor: 1, barcode: '' }])}>
                       <Plus className="mr-1 h-3 w-3" />Thêm biến thể
                     </Button>
                   </div>
                   {productVariantDrafts.length === 0 && <p className="rounded-md bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">Chưa có biến thể. Sản phẩm sẽ bán theo {productForm.unit || 'đơn vị cơ sở'}.</p>}
                   <div className="space-y-1.5">
                     {productVariantDrafts.map((variant, index) => <div key={`variant-row-${index}`} className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]">
                       <Input value={variant.name} placeholder="Tên biến thể, ví dụ Hộp" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} className="h-9 text-xs" />
                       <div className="relative"><Input type="text" inputMode="decimal" value={variant.factor} onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, factor: e.target.value.replace(',', '.') } : row))} className="h-9 pr-10 text-xs" placeholder="1" aria-label={`Hệ số quy đổi biến thể ${index + 1}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">× cơ sở</span></div>
                       <div className="relative"><Barcode className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" /><Input value={variant.barcode} placeholder="Mã vạch riêng (nếu có)" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, barcode: e.target.value } : row))} className="h-9 pl-8 pr-9 text-xs" /><button type="button" aria-label="Quét mã vạch biến thể" title="Quét mã vạch biến thể" onClick={() => { setVariantBarcodeIndex(index); setShowBarcodeScannerModal(true); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-sky-700"><ScanLine className="h-3.5 w-3.5" /></button></div>
                       <button type="button" onClick={() => setProductVariantDrafts(productVariantDrafts.filter((_, i) => i !== index))} className="flex h-9 items-center justify-center text-rose-500"><Trash2 className="h-4 w-4" /></button>
                     </div>)}
                   </div>
                 </div>
               ) : (
                 <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                   <div className="flex items-start justify-between gap-3">
                     <div>
                       <h3 className="text-sm font-semibold text-slate-900">Sản phẩm thành phần của combo</h3>
                       <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Chỉ chọn sản phẩm thường đang có trên hệ thống. Khi bán combo, tồn kho sẽ trừ ở từng thành phần.</p>
                     </div>
                     <Button variant="outline" className="h-8 shrink-0 border-amber-200 px-2 text-xs" onClick={() => setProductComponentDrafts([...productComponentDrafts, { componentProductId: products.find((p) => p.productType !== 'combo' && p.id !== editingProduct?.id)?.id || '', quantity: 1 }])}>
                       <Plus className="mr-1 h-3 w-3" />Thêm sản phẩm
                     </Button>
                   </div>
                   {productComponentDrafts.length === 0 && <p className="rounded-md bg-white/70 px-3 py-1.5 text-[11px] text-amber-700">Hãy thêm sách, vật tư hoặc sản phẩm đơn vào gói combo.</p>}
                   <div className="space-y-1.5">
                     {productComponentDrafts.map((component, index) => <div key={`${component.componentProductId}-${index}`} className="grid gap-2 md:grid-cols-[1fr_110px_auto]">
                       <div className="flex min-w-0 gap-1">
                         <select value={component.componentProductId} onChange={(e) => setProductComponentDrafts(productComponentDrafts.map((row, i) => i === index ? { ...row, componentProductId: e.target.value } : row))} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs">
                           <option value="">Chọn sản phẩm</option>
                           {products.filter((p) => p.productType !== 'combo' && p.id !== editingProduct?.id).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
                         </select>
                         <button type="button" aria-label="Quét mã sản phẩm thành phần" title="Quét mã sản phẩm thành phần" onClick={() => { setComponentBarcodeIndex(index); setVariantBarcodeIndex(null); setShowBarcodeScannerModal(true); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-sky-50 hover:text-sky-700">
                           <Barcode className="h-4 w-4" />
                         </button>
                       </div>
                       <Input type="number" min="0.01" value={component.quantity} onChange={(e) => setProductComponentDrafts((previous) => previous.map((row, i) => i === index ? { ...row, quantity: parseNumericDraft(e.target.value) } : row))} className="h-9 text-xs" placeholder="Số lượng" />
                       <button type="button" onClick={() => setProductComponentDrafts(productComponentDrafts.filter((_, i) => i !== index))} className="flex h-9 items-center justify-center text-rose-500"><Trash2 className="h-4 w-4" /></button>
                     </div>)}
                   </div>
                 </div>
               )}

               {!editingProduct && (
                 <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Số lượng tồn kho ban đầu</label>
                    <Input 
                       type="number"
                       value={productForm.stock}
                       onChange={e => setProductForm((previous) => ({ ...previous, stock: parseNumericDraft(e.target.value) }))}
                       disabled={productForm.productType === 'combo'}
                       className="h-9 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                    />
                    {productForm.productType === 'combo' && <p className="text-[11px] text-slate-500">Combo không có tồn riêng; tồn khả dụng được tính từ các thành phần.</p>}
                 </div>
               )}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-3 py-2 sm:px-4 sm:py-3 md:px-5">
               <Button 
                 onClick={handleSaveProduct}
                 disabled={savingProduct}
                 className="w-full h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-sm shadow-sky-900/20 gap-2"
                >
                 <Save className="h-4 w-4" />
                 <span>{savingProduct ? 'Đang lưu...' : 'Lưu sản phẩm'}</span>
               </Button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Settings2 className="h-4 w-4" /></div>
                <div><h2 className="text-sm font-semibold text-slate-900">Quản lý bảng giá</h2><p className="text-[11px] text-slate-500">Tạo nhóm giá để chọn nhanh tại POS</p></div>
              </div>
              <button onClick={() => setShowPricingModal(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <div><h3 className="text-xs font-semibold text-slate-900">Bảng giá hiện có</h3><p className="text-[11px] text-slate-500">Giá từng sản phẩm được nhập trong form sản phẩm.</p></div>
                  <span className="text-[11px] font-medium text-slate-400">{priceLists.length} bảng</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {priceLists.map((list: any) => editingPriceListId === list.id ? (
                    <div key={list.id} className="space-y-2 bg-slate-50 px-3 py-2">
                      <Input
                        autoFocus
                        value={editingPriceListDraft.name}
                        onChange={(event) => setEditingPriceListDraft((previous) => ({ ...previous, name: event.target.value }))}
                        className="h-8 bg-white text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editingPriceListDraft.customerType}
                          onChange={(event) => setEditingPriceListDraft((previous) => ({ ...previous, customerType: event.target.value }))}
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs"
                        >
                          <option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option>
                        </select>
                        <Button type="button" className="h-8 px-2 text-xs" onClick={() => void savePriceList()}>Lưu</Button>
                        <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setEditingPriceListId(null)}>Hủy</Button>
                      </div>
                    </div>
                  ) : (
                    <div key={list.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">{list.name}</p>
                        <p className="text-[11px] text-slate-400">{list.isDefault ? 'Mặc định' : list.customerType === 'loyal' ? 'Thân thiết' : list.customerType === 'retail' ? 'Bán lẻ' : 'Mọi nhóm khách'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => beginEditPriceList(list)} className="rounded-md p-1.5 text-sky-700 hover:bg-sky-50" aria-label={`Sửa bảng giá ${list.name}`} title="Sửa bảng giá"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => void deletePriceList(list)} disabled={Boolean(list.isDefault)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Xóa bảng giá ${list.name}`} title={list.isDefault ? 'Không thể xóa bảng giá mặc định' : 'Xóa bảng giá'}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {priceLists.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">Chưa có bảng giá nào.</p>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-900">Thêm bảng giá</h3>
                <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                  <Input value={newPriceList.name} onChange={(e) => setNewPriceList({ ...newPriceList, name: e.target.value })} placeholder="Ví dụ: Giá cơ quan" className="h-9 bg-white text-xs" />
                  <select value={newPriceList.customerType} onChange={(e) => setNewPriceList({ ...newPriceList, customerType: e.target.value })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option>
                  </select>
                  <Button onClick={createPriceList} disabled={!newPriceList.name.trim()} className="h-9 px-3 text-xs">Tạo bảng</Button>
                </div>
              </div>
              {pricingMessage && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{pricingMessage}</p>}
              <div className="flex justify-end"><Button variant="outline" className="h-9 px-3 text-xs" onClick={() => setShowPricingModal(false)}>Đóng</Button></div>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="max-h-[calc(100dvh-1rem)] w-full max-w-sm space-y-5 overflow-y-auto rounded-lg border border-white bg-white p-4 shadow-2xl sm:space-y-6 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                      <Layers className="h-5 w-5" />
                   </div>
                   <h3 className="font-semibold text-slate-900">Quản lý nhóm sản phẩm</h3>
                </div>
                <button onClick={() => setShowCategoryModal(false)} className="text-slate-300 hover:text-red-500">
                   <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest ml-1">TÊN NHÓM SẢN PHẨM MỚI</label>
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
                TẠO NHÓM
              </Button>
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-500">Nhóm sản phẩm hiện có</p>
                  <span className="text-[10px] text-slate-400">{categories.length}</span>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {categories.map((category) => editingCategoryId === category.id ? (
                    <div key={category.id} className="flex items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
                      <Input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} className="h-8 min-w-0 flex-1 text-xs" autoFocus />
                      <button type="button" onClick={() => void handleRenameCategory(category.id)} className="rounded-md px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100">Lưu</button>
                      <button type="button" onClick={() => { setEditingCategoryId(null); setEditingCategoryName(''); }} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200">Hủy</button>
                    </div>
                  ) : (
                    <div key={category.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-1.5">
                      <span className="min-w-0 truncate text-xs text-slate-700">{category.name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); setFormError(''); }} className="rounded-md px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-50">Đổi tên</button>
                        <button type="button" onClick={() => void handleDeleteCategory(category)} className="rounded-md p-1 text-rose-500 hover:bg-rose-50" aria-label={`Xóa danh mục ${category.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {!categories.length && <p className="py-2 text-center text-[11px] text-slate-400">Chưa có danh mục.</p>}
                </div>
                {formError && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{formError}</p>}
              </div>
           </div>
        </div>
      )}

      {/* Stock Card Modal */}
      {stockCardProduct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-3 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">Thẻ kho</h2>
                    <p className="truncate text-[11px] text-slate-500">{stockCardProduct.name} · {stockCardProduct.sku}</p>
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeStockCard} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Đóng thẻ kho">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">Tồn hiện tại</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{Number(stockCardProduct.availableStock ?? stockCardProduct.stock)} <span className="text-xs font-normal text-slate-500">{stockCardProduct.unit}</span></p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5">
                  <p className="text-[10px] text-emerald-700">Tổng nhập</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-emerald-800">+{stockCardSummary.in}</p>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-2.5">
                  <p className="text-[10px] text-rose-700">Tổng xuất</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-rose-800">-{stockCardSummary.out}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                  <p className="text-[10px] text-amber-700">Điều chỉnh</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-800">±{stockCardSummary.adjust}</p>
                </div>
              </div>

              {stockCardError && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{stockCardError}</p>}
              {stockCardLoading ? (
                <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">Đang tải lịch sử kho…</div>
              ) : stockCardRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Chưa có giao dịch kho cho sản phẩm này.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[880px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2">Chứng từ</th>
                        <th className="whitespace-nowrap px-3 py-2">Thời gian</th>
                        <th className="whitespace-nowrap px-3 py-2">Loại giao dịch</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Giá GD</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Giá vốn</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Số lượng</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Tồn cuối</th>
                        <th className="whitespace-nowrap px-3 py-2">Đối tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockCardRows.map((row) => {
                        const meta = movementMeta(row.type);
                        const quantityPrefix = row.type === 'in' ? '+' : row.type === 'out' ? '-' : '±';
                        return (
                          <tr key={row.id} className="whitespace-nowrap hover:bg-slate-50/80">
                            <td className="px-3 py-2 font-mono text-sky-700">{row.documentNo || row.referenceId || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{new Date(row.createdAt).toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2"><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${meta.tone}`}>{row.transactionType || meta.label}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCompactCurrency(row.transactionPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCompactCurrency(row.costPrice)}</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.type === 'in' ? 'text-emerald-700' : row.type === 'out' ? 'text-rose-700' : 'text-amber-700'}`}>{quantityPrefix}{row.quantity} {row.productUnit || stockCardProduct.unit}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{row.afterStock} {row.productUnit || stockCardProduct.unit}</td>
                            <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={row.partnerName || ''}>{row.partnerName || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Quản lý đơn vị tính</h3>
                  <p className="text-[11px] text-slate-500">Đơn vị cơ sở và biến thể dùng trong sản phẩm</p>
                </div>
              </div>
              <button onClick={() => setShowUnitModal(false)} className="text-slate-300 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Thêm đơn vị tính</p>
                <div className="flex gap-2">
                  <Input value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} className="h-9 min-w-0 flex-1 bg-white text-xs" placeholder="Ví dụ: Cuộn, Mét, Thùng" />
                  <Button type="button" onClick={() => void handleAddUnit()} disabled={!newUnitName.trim()} className="h-9 px-3 text-xs">Thêm</Button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">Đơn vị đã khai báo</p>
                  <span className="text-[11px] text-slate-400">{catalogUnits.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {catalogUnits.map((unit: any) => editingUnitId === unit.id ? (
                    <div key={unit.id} className="flex items-center gap-2 bg-slate-50 px-3 py-2">
                      <Input autoFocus value={editingUnitName} onChange={(event) => setEditingUnitName(event.target.value)} className="h-8 min-w-0 flex-1 bg-white text-xs" />
                      <button type="button" onClick={() => void saveUnitName()} className="rounded-md px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100">Lưu</button>
                      <button type="button" onClick={() => { setEditingUnitId(null); setEditingUnitName(''); }} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200">Hủy</button>
                    </div>
                  ) : (
                    <div key={unit.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">{unit.name}</p>
                        {Number(unit.inUseCount) > 0 && <p className="text-[10px] text-slate-400">Đang dùng ở {unit.inUseCount} sản phẩm/biến thể</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => { setEditingUnitId(unit.id); setEditingUnitName(unit.name); setUnitMessage(''); }} className="rounded-md p-1.5 text-sky-700 hover:bg-sky-50" aria-label={`Sửa đơn vị ${unit.name}`} title="Sửa đơn vị"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => void deleteUnit(unit)} disabled={Number(unit.inUseCount) > 0} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Xóa đơn vị ${unit.name}`} title={Number(unit.inUseCount) > 0 ? 'Hãy đổi đơn vị đang sử dụng trước' : 'Xóa đơn vị'}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {!catalogUnits.length && <p className="px-3 py-4 text-center text-[11px] text-slate-400">Chưa có đơn vị được lưu. Các đơn vị của sản phẩm sẽ tự xuất hiện sau khi lưu.</p>}
                </div>
              </div>
              {unitMessage && <p className="rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700">{unitMessage}</p>}
              <p className="text-[11px] text-slate-500">Biến thể bán hàng được chỉnh sửa hoặc xóa trong phần <b>Biến thể đơn vị bán</b> khi mở sửa sản phẩm.</p>
            </div>
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3"><Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={() => setShowUnitModal(false)}>Đóng</Button></div>
          </div>
        </div>
      )}

      {/* Stock Entry Modal */}
      {showStockModal && stockUpdatingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-white bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
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
                          onChange={e => setUpdateForm((previous) => ({ ...previous, quantity: parseNumericDraft(e.target.value) }))}
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
                          onChange={e => setUpdateForm((previous) => ({ ...previous, purchasePrice: parseNumericDraft(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GIÁ BÁN MỚI</label>
                        <Input 
                          type="number"
                          className="h-12 rounded-lg bg-slate-50 border-none shadow-inner font-bold text-slate-700" 
                          value={stockUpdateForm.sellingPrice}
                          onChange={e => setUpdateForm((previous) => ({ ...previous, sellingPrice: parseNumericDraft(e.target.value) }))}
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
                          onChange={e => setStockCheckActual(parseNumericDraft(e.target.value))}
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

      <div className="px-3 py-2 bg-white border-b border-slate-200 sticky top-0 z-40 flex flex-col lg:flex-row gap-2 lg:gap-3 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-slate-900">Kho hàng</h1>
            <p className="text-[11px] leading-tight text-slate-500 mt-0.5">{products.length} mặt hàng trong hệ thống</p>
          </div>
        </div>
        
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-2 lg:w-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
          <div className="relative group w-full flex-1 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
            <Input 
              className="h-9 rounded-lg border-none bg-slate-100/70 pl-9 shadow-inner focus:ring-2 focus:ring-sky-500/20 transition-all font-medium text-xs placeholder:text-slate-400"
                placeholder="Tìm theo tên, SKU, danh mục..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:gap-2">
            <Button
              onClick={openCreateProduct}
              className="h-9 px-3 rounded-lg gap-1.5 font-semibold bg-sky-600 hover:bg-sky-700 shadow-sm transition-all text-white shrink-0 text-xs"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Thêm mới</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowMobileActionSheet(true)}
              className="h-9 px-2.5 rounded-lg text-xs gap-1.5 lg:hidden"
            >
              <Ellipsis className="h-3.5 w-3.5" />
              <span className="hidden min-[390px]:inline">Tác vụ</span>
            </Button>
          </div>
          <Button variant="outline" onClick={() => setShowCategoryModal(true)} className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs gap-1.5">
            <Layers className="h-4 w-4" />
            Danh mục
          </Button>
          <Button variant="outline" onClick={openUnitManager} className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs gap-1.5">
            <Tag className="h-4 w-4" />
            Đơn vị tính
          </Button>
          <Button variant="outline" onClick={openPricing} className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs gap-1.5">
            <Settings2 className="h-4 w-4" />
            Bảng giá
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {importing ? 'Đang import...' : 'Import CSV/Excel'}
          </Button>
          <Button
            variant="outline"
            onClick={downloadTemplates}
            className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs gap-1.5"
          >
            <Download className="h-4 w-4" />
            Tải mẫu
          </Button>
          <Button variant="outline" onClick={openBulkCheck} className="hidden lg:inline-flex h-9 px-3 rounded-lg text-xs">
            Kiểm kê
          </Button>
        </div>
      </div>

        <div className="flex-1 overflow-y-auto p-2 lg:p-3">
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Tồn thực tế</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{inventoryStats.totalUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Tồn khả dụng</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{inventoryStats.availableUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Giá trị tồn (giá nhập)</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(inventoryStats.totalStockValue)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Mặt hàng sắp hết</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${inventoryStats.lowStock > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {inventoryStats.lowStock}
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
            Bộ lọc & sắp xếp hàng hóa
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="all">Tất cả danh mục</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="all">Tất cả tồn kho</option>
              <option value="in_stock">Còn hàng</option>
              <option value="low_stock">Sắp hết</option>
              <option value="out_of_stock">Hết hàng</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="updated_desc">Mới cập nhật</option>
              <option value="name_asc">Tên A → Z</option>
              <option value="stock_asc">Tồn kho thấp → cao</option>
              <option value="stock_desc">Tồn kho cao → thấp</option>
              <option value="price_desc">Giá bán cao → thấp</option>
            </select>
            <Button
              variant="outline"
              className="h-9 justify-start gap-2 px-2.5 text-xs"
              onClick={() => {
                setCategoryFilter('all');
                setStockStatusFilter('all');
                setSortBy('updated_desc');
              }}
            >
              <ListFilter className="h-4 w-4" />
              Đặt lại bộ lọc
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* Mobile View: High-polish Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 lg:hidden">
            {visibleProducts.map(product => (
              <div key={product.id} className="p-3 bg-white space-y-2 relative group active:bg-slate-50 transition-colors" onClick={() => openStockEntry(product)}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <button type="button" className="block text-left text-xs font-semibold text-slate-500 font-mono leading-none hover:text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); void openEditProduct(product); }}>{product.sku}</button>
                    <button type="button" className="block text-left font-semibold text-slate-900 text-base leading-tight tracking-tight hover:text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); void openEditProduct(product); }}>{product.name}</button>
                  </div>
                    <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openStockCard(product);
                      }}
                      className="h-8 w-8 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center"
                      aria-label={`Mở thẻ kho ${product.name}`}
                      title="Thẻ kho"
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditProduct(product);
                      }}
                      className="h-8 w-8 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(product);
                      }}
                      className="h-8 w-8 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md leading-none ring-1 ring-slate-200/50">{product.category}</span>
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md leading-none ring-1 ring-slate-200/50">{product.unit}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-500">Tồn kho</div>
                      <div className={`text-sm font-medium tabular-nums leading-none ${
                      Number(product.availableStock ?? product.stock) <= product.lowStockThreshold ? 'text-amber-700' : 'text-slate-700'
                    }`}>
                      {Number(product.availableStock ?? product.stock)} <span className="text-[11px] text-slate-400 font-medium ml-0.5">{product.unit}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xs font-medium text-slate-500">Giá nhập</div>
                    <div className="text-sm font-semibold text-slate-600 tabular-nums leading-none">{formatCompactCurrency(product.purchasePrice)}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xs font-medium text-slate-500">Giá bán</div>
                    <div className="text-sm font-semibold text-sky-700 tabular-nums leading-none">{formatCompactCurrency(product.sellingPrice)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: Polished Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-0 text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[30%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
                    <div className="flex items-center gap-2">Mã SKU <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100">Sản phẩm</th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100">Danh mục</th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100 text-right">Giá nhập</th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100 text-right">Giá bán</th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100 text-center">Tồn kho</th>
                  <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleProducts.map(product => (
                  <tr key={product.id} className="group h-[56px] hover:bg-sky-50/20 transition-colors">
                    <td className="px-2 py-1.5 align-middle">
                      <button type="button" className="inline-flex max-w-full truncate font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md hover:text-sky-700" onClick={() => void openEditProduct(product)}>{product.sku}</button>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="min-w-0">
                        <button type="button" className="block max-w-full truncate text-left font-semibold text-slate-900 tracking-tight text-xs leading-tight hover:text-sky-700 hover:underline" onClick={() => void openEditProduct(product)}>{product.name}</button>
                        {product.barcode && <div className="text-[10px] text-slate-500 font-mono truncate">{product.barcode}</div>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <span className="inline-flex max-w-full truncate text-[11px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded-md">{product.category}</span>
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right font-semibold text-slate-500 tabular-nums text-[11px] whitespace-nowrap">
                        {formatCompactCurrency(product.purchasePrice)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right">
                      <div className="flex flex-col items-end">
                        <div className="font-semibold text-sky-700 text-sm tabular-nums whitespace-nowrap">{formatCompactCurrency(product.sellingPrice)}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditProduct(product);
                          }}
                          className="text-[10px] font-medium text-slate-400 hover:text-sky-600 transition-colors"
                        >
                          Sửa giá
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex flex-col items-center justify-center">
                        <div className={`px-1.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1 ${
                          Number(product.availableStock ?? product.stock) <= product.lowStockThreshold
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}>
                          <button className="hover:text-sky-700 transition-colors" onClick={(e) => {
                             e.stopPropagation();
                             openStockEntry(product);
                          }}><Plus className="h-3.5 w-3.5" /></button>
                          <span className="tabular-nums whitespace-nowrap">{Number(product.availableStock ?? product.stock)}</span>
                          <span className="text-[10px] text-slate-500">{product.unit}</span>
                          {Number(product.availableStock ?? product.stock) <= product.lowStockThreshold && <AlertTriangle className="h-3 w-3" />}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openStockCard(product)}
                          className="h-8 w-8 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
                          title="Thẻ kho"
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openEditProduct(product)}
                          className="h-8 w-8 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-sky-700 transition-colors"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProduct(product)}
                          className="h-8 w-8 rounded-md bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white transition-colors"
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
          
          {visibleProducts.length === 0 && (
            <div className="p-16 text-center space-y-4 animate-pulse">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-lg bg-slate-50 text-slate-200 shadow-inner">
                <Search className="h-9 w-9 opacity-10" />
              </div>
              <p className="text-slate-300 font-semibold uppercase tracking-[0.25em] text-xs">Dữ liệu hàng hóa trống</p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-slate-900">Lịch sử kho gần đây</h3>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value as any)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
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
                <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${movementMeta(m.type).tone}`}>
                        {movementMeta(m.type).label}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{m.productSku || 'N/A'}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {m.productName || 'Sản phẩm'} {m.note ? `· ${m.note}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(m.createdAt).toLocaleString('vi-VN')} · {m.actorName || 'N/A'}
                      {m.actorRole ? ` (${m.actorRole})` : ''}
                      {m.referenceId && m.note?.includes('Bán hàng') && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate(`/app/invoices?invoiceId=${encodeURIComponent(m.referenceId)}`)}>Mở đơn hàng</button></>}
                      {m.referenceId && m.note?.includes('Nhập hàng') && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate(`/app/purchases?purchaseId=${encodeURIComponent(m.referenceId)}`)}>Mở phiếu nhập</button></>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-slate-700 tabular-nums">
                      {m.beforeStock} → {m.afterStock}
                    </p>
                    <p className={`text-xs font-semibold tabular-nums ${m.type === 'in' ? 'text-emerald-700' : m.type === 'out' ? 'text-rose-700' : 'text-amber-700'}`}>
                      {m.type === 'in' ? '+' : m.type === 'out' ? '-' : '±'}{m.quantity} {m.productUnit || ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
