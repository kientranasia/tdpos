import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Search, Plus, AlertTriangle, Package, ArrowUpDown, X, Save, Edit3, Tag, Camera, Layers, Trash2, Upload, Download, ScanLine, Barcode, SlidersHorizontal, ListFilter, Ellipsis, Settings2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Product } from '../types';
import { v4 as uuid } from 'uuid';
import { stockMovementsApi, priceListsApi, productUnitsApi, productComponentsApi, unitsApi, productsApi } from '../lib/api';
import * as XLSX from 'xlsx';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';
import { CategoryManagerModal, PriceListManagerModal, UnitManagerModal } from '../components/inventory/InventoryManagers';
import { applyPriceListAdjustment, formatPriceListAdjustment } from '../lib/priceLists';

type ImportPreviewRow = {
  rowNumber: number;
  mode: 'create' | 'update' | 'skip';
  errors: string[];
  payload: Partial<Product>;
  existingId?: string;
};

type KiotImportRow = {
  rowNumber: number;
  productType: 'standard' | 'combo';
  category: string;
  sku: string;
  barcode: string;
  name: string;
  sellingPrice: number;
  purchasePrice: number;
  stock: number;
  lowStockThreshold: number;
  maxStockThreshold: number;
  unit: string;
  baseSku: string;
  factor: number;
  attributes: string;
  relatedSku: string;
};

type KiotImportPreview = {
  fileName: string;
  rows: KiotImportRow[];
  summary: {
    totalRows: number;
    productRows: number;
    unitRows: number;
    createdCount: number;
    updatedCount: number;
    unitCount: number;
    comboCount: number;
    errorCount: number;
    warningCount: number;
  };
  issues: Array<{ rowNumber: number; code: string; message: string; sku: string; barcode: string }>;
  warnings: Array<{ rowNumber: number; message: string; sku: string }>;
};

const technicalStockIdPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const readableStockNote = (movement: any) => {
  const note = movement.note || '';
  const withDocument = movement.referenceLabel && movement.referenceId
    ? note.replaceAll(movement.referenceId, movement.referenceLabel)
    : note;
  return withDocument.replace(technicalStockIdPattern, '').replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim();
};

const readableStockDocument = (movement: any) => {
  const value = movement.documentNo || movement.referenceLabel || '';
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(value) ? '—' : value || '—';
};

const readableStockActor = (movement: any) => {
  const actorName = String(movement.actorName || '').trim();
  return actorName && actorName !== 'N/A' ? actorName : '—';
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
  maxStockThreshold: NumericDraft;
  attributes: string;
  imageUrl: string;
  productType: 'standard' | 'combo';
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
  const [showMobileActionSheet, setShowMobileActionSheet] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState('');
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [stockCardProduct, setStockCardProduct] = useState<Product | null>(null);
  const [stockCardRows, setStockCardRows] = useState<any[]>([]);
  const [stockCardLoading, setStockCardLoading] = useState(false);
  const [stockCardError, setStockCardError] = useState('');
  const [stockCardTransactionFilter, setStockCardTransactionFilter] = useState('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated_desc' | 'name_asc' | 'stock_asc' | 'stock_desc' | 'price_desc'>('updated_desc');
  const [inventoryRows, setInventoryRows] = useState<Product[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryPage, setInventoryPage] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryReloadKey, setInventoryReloadKey] = useState(0);
  const inventoryPageSize = 50;
  const [importing, setImporting] = useState(false);
  const [showImportPreviewModal, setShowImportPreviewModal] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [selectedImportRows, setSelectedImportRows] = useState<number[]>([]);
  const [showKiotImportModal, setShowKiotImportModal] = useState(false);
  const [kiotImportPreview, setKiotImportPreview] = useState<KiotImportPreview | null>(null);
  const [kiotImportHistory, setKiotImportHistory] = useState<any[]>([]);
  const [showBarcodeScannerModal, setShowBarcodeScannerModal] = useState(false);
  const [variantBarcodeIndex, setVariantBarcodeIndex] = useState<number | null>(null);
  const [componentBarcodeIndex, setComponentBarcodeIndex] = useState<number | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showInlinePriceListForm, setShowInlinePriceListForm] = useState(false);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [productVariantDrafts, setProductVariantDrafts] = useState<Array<{ id: string; sku: string; name: string; factor: NumericDraft; barcode: string; purchasePrice: NumericDraft }>>([]);
  const [productVariantPriceDrafts, setProductVariantPriceDrafts] = useState<Record<string, NumericDraft>>({});
  const [productComponentDrafts, setProductComponentDrafts] = useState<Array<{ componentProductId: string; quantity: NumericDraft }>>([]);
  const [productPriceDrafts, setProductPriceDrafts] = useState<Record<string, NumericDraft>>({});
  const [newPriceList, setNewPriceList] = useState({ name: '', customerType: 'all', markupMode: 'percent' as 'percent' | 'amount', markupValue: 0 as NumericDraft });
  const [pricingExpanded, setPricingExpanded] = useState(true);
  const [variantsExpanded, setVariantsExpanded] = useState(true);
  const [pricingMessage, setPricingMessage] = useState('');
  const [catalogUnits, setCatalogUnits] = useState<any[]>([]);
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
    maxStockThreshold: 0,
    attributes: '',
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
      maxStockThreshold: 0,
      attributes: '',
      imageUrl: '',
      productType: 'standard'
    });
    setEditingProduct(null);
    setProductVariantDrafts([]);
    setProductVariantPriceDrafts({});
    setProductComponentDrafts([]);
    setProductPriceDrafts({});
    setPricingExpanded(true);
    setVariantsExpanded(true);
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
    const defaultList = priceLists.find((item: any) => item.isDefault) || priceLists[0];
    const defaultDraft = defaultList?.id ? productPriceDrafts[defaultList.id] : undefined;
    const basePrice = productForm.productType === 'combo'
      ? comboBasePriceForList(defaultList, components)
      : defaultDraft !== undefined && defaultDraft !== ''
        ? Number(defaultDraft) || 0
        : Number(productForm.sellingPrice || 0);
    if (!list || !defaultList || list.id === defaultList.id || list.isDefault) return basePrice;
    return applyPriceListAdjustment(basePrice, list);
  };

  const loadProductPriceDrafts = (lists: any[], product: Product | null = null) => {
    setProductPriceDrafts(Object.fromEntries(lists.map((list: any) => {
      const saved = product ? list.items?.find((item: any) => item.productId === product.id && item.unitName === product.unit) : undefined;
      return [list.id, product && saved?.price !== undefined ? Number(saved.price) : product && list.isDefault ? Number(product.sellingPrice || 0) : undefined];
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
      .map((variant) => ({ id: variant.id, sku: variant.sku.trim(), name: variant.name.trim(), factor: Number(variant.factor), barcode: variant.barcode.trim(), purchasePrice: Number(variant.purchasePrice) || 0 }))
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
      maxStockThreshold: Number(productForm.maxStockThreshold) || 0,
      attributes: productForm.attributes.trim() || null,
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
            ? variants.map((variant) => {
              const draftKey = `${list.id}::${variant.id}`;
              const variantPrice = productVariantPriceDrafts[draftKey];
              return { productId, unitName: variant.name, unitFactor: variant.factor, price: variantPrice === undefined || variantPrice === '' ? basePrice * Number(variant.factor) : Number(variantPrice) || 0 };
            })
            : []),
        ];
        const existingItems = (list.items || []).filter((item: any) => item.productId !== productId);
        await priceListsApi.saveItems(list.id, [...existingItems, ...rows]);
      }
      await refreshProducts();
      setInventoryReloadKey((value) => value + 1);
      setSavingProduct(false);
      setShowProductModal(false);
      resetProductForm();
    } catch (err) {
      setSavingProduct(false);
      setFormError(err instanceof Error ? err.message : 'Sản phẩm đã lưu nhưng chưa lưu được biến thể, combo hoặc bảng giá.');
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
      maxStockThreshold: product.maxStockThreshold || 0,
      attributes: product.attributes || '',
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
      const loadedVariants = units
        .filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1)
        .map((unit: any) => ({ id: unit.id || uuid(), sku: unit.sku || '', name: unit.name, factor: Number(unit.factor) || 1, barcode: unit.barcode || '', purchasePrice: Number(unit.purchasePrice) || 0 }));
      setProductVariantDrafts(loadedVariants);
      setProductVariantPriceDrafts(Object.fromEntries(loadedVariants.flatMap((variant) => lists.map((list: any) => {
        const saved = list.items?.find((item: any) => item.productId === product.id && item.unitName === variant.name);
        return [`${list.id}::${variant.id}`, saved?.price === undefined ? '' : Number(saved.price)];
      }))));
      setProductComponentDrafts(components.map((component: any) => ({ componentProductId: component.componentProductId, quantity: Number(component.quantity) })));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể tải cấu hình sản phẩm.');
      setProductVariantDrafts([]);
      setProductVariantPriceDrafts({});
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
      await priceListsApi.create({ name: newPriceList.name.trim(), customerType: newPriceList.customerType, markupMode: newPriceList.markupMode, markupValue: Number(newPriceList.markupValue) || 0, active: true });
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setProductPriceDrafts((previous) => Object.fromEntries(lists.map((list: any) => [list.id, previous[list.id]])));
      setNewPriceList({ name: '', customerType: 'all', markupMode: 'percent', markupValue: 0 });
      setPricingMessage('Đã tạo bảng giá mới.');
      setShowInlinePriceListForm(false);
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tạo bảng giá.');
    }
  };

  const refreshUnitCatalog = async () => {
    try {
      const units = await unitsApi.list();
      setCatalogUnits(units);
      return units;
    } catch {
      return [];
    }
  };

  const openUnitManager = async () => {
    await refreshUnitCatalog();
    setShowUnitModal(true);
  };

  const openStockCard = async (product: Product) => {
    setStockCardProduct(product);
    setStockCardRows([]);
    setStockCardError('');
    setStockCardTransactionFilter('all');
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

  const createCategoryForManager = async (name: string) => {
    if (!activeTenant) return false;
    return addCategory({ id: uuid(), tenantId: activeTenant.id, name });
  };

  const renameCategoryForManager = async (categoryId: string, name: string) => updateCategory(categoryId, name);

  const deleteCategoryForManager = async (category: { id: string; name: string }) => {
    const success = await deleteCategory(category.id);
    if (success && productForm.category === category.name) {
      setProductForm((previous) => ({ ...previous, category: categories.find((item) => item.id !== category.id)?.name || '' }));
    }
    return success;
  };

  const createUnitForManager = async (name: string) => {
    try {
      const unit = await unitsApi.create({ name });
      setCatalogUnits((previous) => [...previous, unit]);
      if (!unitOptions.includes(name)) setCustomUnits((previous) => [...previous, name]);
      setProductForm((previous) => ({ ...previous, unit: name }));
      return true;
    } catch {
      return false;
    }
  };

  const renameUnitForManager = async (unitId: string, name: string) => {
    try {
      const currentUnit = catalogUnits.find((unit) => unit.id === unitId);
      const updated = await unitsApi.update(unitId, { name });
      setCatalogUnits((previous) => previous.map((unit) => unit.id === unitId ? { ...unit, ...updated } : unit));
      if (currentUnit?.name === productForm.unit) setProductForm((previous) => ({ ...previous, unit: updated.name }));
      await refreshProducts();
      setInventoryReloadKey((value) => value + 1);
      return true;
    } catch {
      return false;
    }
  };

  const deleteUnitForManager = async (unit: any) => {
    try {
      await unitsApi.remove(unit.id);
      setCatalogUnits((previous) => previous.filter((item) => item.id !== unit.id));
      return true;
    } catch {
      return false;
    }
  };

  const createPriceListForManager = async (name: string, customerType: string, markupMode: 'percent' | 'amount', markupValue: number) => {
    try {
      await priceListsApi.create({ name, customerType, markupMode, markupValue, active: true });
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setProductPriceDrafts((previous) => Object.fromEntries(lists.map((list: any) => [list.id, previous[list.id]])));
      return true;
    } catch {
      return false;
    }
  };

  const renamePriceListForManager = async (id: string, name: string, customerType: string, markupMode: 'percent' | 'amount', markupValue: number) => {
    try {
      await priceListsApi.update(id, { name, customerType, markupMode, markupValue });
      setPriceLists(await priceListsApi.list(true));
      return true;
    } catch {
      return false;
    }
  };

  const deletePriceListForManager = async (list: any) => {
    try {
      await priceListsApi.remove(list.id);
      setPriceLists(await priceListsApi.list(true));
      return true;
    } catch {
      return false;
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

  const normalizeImportHeader = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const importText = (value: unknown) => String(value ?? '').trim();

  const isKiotVietHeaders = (headers: string[]) => {
    const normalized = new Set(headers.map(normalizeImportHeader));
    const required = ['loaihang', 'nhomhang3cap', 'mahang', 'tenhang', 'giaban', 'giavon', 'tonkho', 'dvt', 'madvtcoban'];
    return required.every((header) => normalized.has(header));
  };

  const parseKiotVietRows = (rawRows: Record<string, unknown>[]) => rawRows.map((rawRow, index): KiotImportRow => {
    const values = new Map(Object.entries(rawRow).map(([key, value]) => [normalizeImportHeader(key), value]));
    const get = (...keys: string[]) => keys.map((key) => values.get(key)).find((value) => value !== undefined && value !== '') ?? '';
    const typeText = importText(get('loaihang')).toLowerCase();
    return {
      rowNumber: index + 2,
      productType: typeText.includes('combo') ? 'combo' : 'standard',
      category: importText(get('nhomhang3cap')) || 'Khác',
      sku: importText(get('mahang')),
      barcode: importText(get('mavach')),
      name: importText(get('tenhang')),
      sellingPrice: parseNumber(get('giaban'), 0),
      purchasePrice: parseNumber(get('giavon'), 0),
      stock: parseNumber(get('tonkho'), 0),
      lowStockThreshold: parseNumber(get('tonnhoinhat'), 0),
      maxStockThreshold: parseNumber(get('tonlonnhat'), 0),
      unit: importText(get('dvt')),
      baseSku: importText(get('madvtcoban')),
      factor: parseNumber(get('quydoi'), 1),
      attributes: importText(get('thuoctinh')),
      relatedSku: importText(get('mahhienquan')),
    };
  });

  const loadKiotImportHistory = async () => {
    try {
      setKiotImportHistory(await productsApi.importHistory());
    } catch {
      setKiotImportHistory([]);
    }
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

      if (isKiotVietHeaders(Object.keys(rows[0]))) {
        const kiotRows = parseKiotVietRows(rows);
        const preview = await productsApi.importPreview({ sourceSystem: 'kiot-viet', fileName: file.name, rows: kiotRows });
        setKiotImportPreview({ fileName: file.name, rows: kiotRows, ...preview });
        await loadKiotImportHistory();
        setShowKiotImportModal(true);
        return;
      }

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
          else if (['maxstockthreshold', 'muctontoida', 'tontoida'].includes(k)) mapped.maxStockThreshold = value;
          else if (['attributes', 'thuoctinh', 'ghichu'].includes(k)) mapped.attributes = value;
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
          maxStockThreshold: parseNumber(mapped.maxStockThreshold, 0),
          attributes: String(mapped.attributes || '').trim() || null,
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
          maxStockThreshold: row.payload.maxStockThreshold || 0,
          attributes: row.payload.attributes || null,
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

  const downloadKiotImportIssues = () => {
    if (!kiotImportPreview?.issues.length) return;
    const rows = kiotImportPreview.issues.map((issue) => ({
      Dòng: issue.rowNumber,
      Mã_lỗi: issue.code,
      Nội_dung: issue.message,
      Mã_hàng: issue.sku,
      Mã_vạch: issue.barcode,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Lỗi import');
    XLSX.writeFile(workbook, `loi-import-kiot-viet-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const applyKiotImport = async () => {
    if (!kiotImportPreview) return;
    setFormError('');
    setImporting(true);
    try {
      const result = await productsApi.importBatch({
        sourceSystem: 'kiot-viet',
        fileName: kiotImportPreview.fileName,
        rows: kiotImportPreview.rows,
      });
      await refreshProducts();
      setInventoryReloadKey((value) => value + 1);
      await loadKiotImportHistory();
      setShowKiotImportModal(false);
      setKiotImportPreview(null);
      window.alert(`Import Kiot Việt hoàn tất.\nTạo mới: ${result.summary?.createdCount || 0}\nCập nhật: ${result.summary?.updatedCount || 0}\nĐơn vị quy đổi: ${result.summary?.unitCount || 0}\nLỗi bị chặn: ${result.summary?.errorCount || 0}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể import lô sản phẩm Kiot Việt.');
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
        maxStockThreshold: 200,
        attributes: 'Màu xanh; size M',
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
        maxStockThreshold: 100,
        attributes: '',
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

  useEffect(() => {
    setInventoryPage(0);
  }, [searchTerm, categoryFilter]);

  useEffect(() => {
    if (!activeTenant?.id) {
      setInventoryRows([]);
      setInventoryTotal(0);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setInventoryLoading(true);
      try {
        const result = await productsApi.listPage(activeTenant.id, {
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          search: searchTerm.trim() || undefined,
          limit: inventoryPageSize,
          offset: inventoryPage * inventoryPageSize,
        });
        if (active) {
          setInventoryRows(result.items as Product[]);
          setInventoryTotal(result.total);
        }
      } catch (error) {
        if (active) {
          setInventoryRows([]);
          setInventoryTotal(0);
          console.error('Failed to load inventory page:', error);
        }
      } finally {
        if (active) setInventoryLoading(false);
      }
    }, searchTerm.trim() ? 180 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeTenant?.id, categoryFilter, inventoryPage, inventoryReloadKey, searchTerm]);

  const filteredProducts = useMemo(() => {
    return inventoryRows.filter((p) => {
      const availableStock = Number(p.availableStock ?? p.stock);
      const matchesStockStatus =
        stockStatusFilter === 'all' ||
        (stockStatusFilter === 'in_stock' && availableStock > p.lowStockThreshold) ||
        (stockStatusFilter === 'low_stock' && availableStock > 0 && availableStock <= p.lowStockThreshold) ||
        (stockStatusFilter === 'out_of_stock' && availableStock <= 0);
      return matchesStockStatus;
    });
  }, [inventoryRows, stockStatusFilter]);

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
    if (!productId || showProductModal) return;
    const localProduct = products.find((item) => item.id === productId);
    const productPromise = localProduct ? Promise.resolve(localProduct) : productsApi.get(productId);
    void productPromise.then((product) => openEditProduct(product as Product)).finally(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('productId');
      setSearchParams(nextParams, { replace: true });
    });
  }, [products, searchParams, setSearchParams, showProductModal]);

  const inventoryStats = useMemo(() => {
    const lowStock = inventoryRows.filter((p) => p.trackStock && Number(p.availableStock ?? p.stock) <= p.lowStockThreshold).length;
    const totalUnits = inventoryRows.reduce((sum, p) => sum + (p.stock || 0), 0);
    const availableUnits = inventoryRows.reduce((sum, p) => sum + Number(p.availableStock ?? p.stock ?? 0), 0);
    const totalStockValue = inventoryRows.reduce((sum, p) => sum + (p.stock || 0) * (p.purchasePrice || 0), 0);
    return { lowStock, totalUnits, availableUnits, totalStockValue };
  }, [inventoryRows]);

  const uniqueCategories = useMemo(
    () => categories.map((category) => category.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
    [categories]
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

  const visibleStockCardRows = useMemo(() => {
    if (stockCardTransactionFilter === 'all') return stockCardRows;
    return stockCardRows.filter((row) => row.transactionType === stockCardTransactionFilter);
  }, [stockCardRows, stockCardTransactionFilter]);

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

      {showKiotImportModal && kiotImportPreview && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">Import Kiot Việt theo lô</h3>
                <p className="mt-0.5 max-w-[70vw] truncate text-[11px] text-slate-500">{kiotImportPreview.fileName} · đối chiếu barcode trước, SKU sau</p>
              </div>
              <button type="button" onClick={() => setShowKiotImportModal(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Đóng xem trước import">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 space-y-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ['Dòng dữ liệu', kiotImportPreview.summary.totalRows, 'text-slate-800'],
                  ['Sản phẩm', kiotImportPreview.summary.productRows, 'text-slate-800'],
                  ['Đơn vị quy đổi', kiotImportPreview.summary.unitRows, 'text-sky-700'],
                  ['Tạo mới', kiotImportPreview.summary.createdCount, 'text-emerald-700'],
                  ['Cập nhật', kiotImportPreview.summary.updatedCount, 'text-sky-700'],
                  ['Combo', kiotImportPreview.summary.comboCount, 'text-violet-700'],
                  ['Dòng bị chặn', kiotImportPreview.summary.errorCount, kiotImportPreview.summary.errorCount ? 'text-rose-700' : 'text-emerald-700'],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                    <p className="text-[10px] font-medium text-slate-500">{label}</p>
                    <p className={`mt-0.5 text-base font-semibold tabular-nums ${tone}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>Giá và tồn sẽ ghi vào sản phẩm/đơn vị tương ứng.</span>
                <span>Tồn thay đổi sẽ tạo thẻ kho điều chỉnh đầu kỳ.</span>
                <span>Không xóa sản phẩm ngoài file.</span>
              </div>
              {kiotImportPreview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Có {kiotImportPreview.warnings.length} cảnh báo. Ví dụ: {kiotImportPreview.warnings.slice(0, 2).map((warning) => `dòng ${warning.rowNumber}: ${warning.message}`).join(' · ')}
                </div>
              )}
              {formError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</div>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-5">
              {kiotImportPreview.issues.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-rose-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 bg-rose-50 px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-rose-800">Chi tiết dòng chưa được import ({kiotImportPreview.issues.length})</p>
                      <p className="mt-0.5 text-[11px] text-rose-700">Các dòng hợp lệ vẫn được xử lý. Sửa các dòng này trong file rồi import lại nếu cần.</p>
                    </div>
                    <Button type="button" variant="outline" className="h-8 border-rose-200 bg-white px-2.5 text-xs text-rose-700 hover:bg-rose-50" onClick={downloadKiotImportIssues}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />Tải danh sách lỗi
                    </Button>
                  </div>
                  <div className="max-h-[min(42vh,420px)] overflow-auto">
                    <table className="min-w-[720px] w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Dòng</th>
                          <th className="px-3 py-2">Mã lỗi</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Barcode</th>
                          <th className="px-3 py-2">Nội dung</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {kiotImportPreview.issues.slice(0, 300).map((issue, index) => (
                          <tr key={`${issue.rowNumber}-${issue.code}-${index}`}>
                            <td className="px-3 py-2 tabular-nums text-slate-600">{issue.rowNumber}</td>
                            <td className="px-3 py-2 font-mono text-rose-700">{issue.code}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{issue.sku || '—'}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{issue.barcode || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{issue.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {kiotImportPreview.issues.length > 300 && <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Đang hiển thị 300 lỗi đầu tiên. Hãy tải danh sách lỗi để xem đầy đủ.</p>}
                </div>
              ) : (
                <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 text-center">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">File sẵn sàng để import</p>
                    <p className="mt-1 text-xs text-emerald-700">Không phát hiện xung đột barcode/SKU hoặc dữ liệu không hợp lệ.</p>
                  </div>
                </div>
              )}
              {kiotImportHistory.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-800">Lịch sử import gần nhất</div>
                  <div className="divide-y divide-slate-100">
                    {kiotImportHistory.slice(0, 3).map((batch: any) => (
                      <div key={batch.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-slate-600">
                        <span className="min-w-0 truncate">{batch.fileName || 'Không có tên file'} · {batch.createdAt ? new Date(batch.createdAt).toLocaleString('vi-VN') : '—'}</span>
                        <span className="shrink-0 font-medium text-slate-700">{batch.createdCount || 0} tạo · {batch.updatedCount || 0} cập nhật · {batch.errorCount || 0} lỗi</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
              <Button type="button" variant="outline" onClick={() => setShowKiotImportModal(false)}>Hủy</Button>
              <Button type="button" onClick={applyKiotImport} disabled={importing || (kiotImportPreview.summary.createdCount + kiotImportPreview.summary.updatedCount === 0)}>
                {importing ? 'Đang import theo lô...' : `Import ${kiotImportPreview.summary.createdCount + kiotImportPreview.summary.updatedCount} sản phẩm`}
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
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[11px] font-semibold text-slate-500">Danh mục</label>
                          <button
                            type="button"
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
                            if (productType === 'combo') {
                              setProductVariantDrafts([]);
                              setProductVariantPriceDrafts({});
                            }
                          }}
                          className="w-full h-8 px-3 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm sm:h-9"
                        >
                          <option value="standard">Sản phẩm thường</option>
                          <option value="combo">Combo bán hàng</option>
                        </select>
                      </div>
                    </div>
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

               <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                 <div className="space-y-1">
                   <label className="text-[11px] font-semibold text-slate-500">Tồn tối thiểu</label>
                   <Input type="number" min="0" step="any" value={productForm.lowStockThreshold} onChange={e => setProductForm((previous) => ({ ...previous, lowStockThreshold: parseNumericDraft(e.target.value) }))} className="h-8 rounded-lg bg-slate-50 shadow-inner font-semibold text-slate-700 tabular-nums sm:h-9" />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[11px] font-semibold text-slate-500">Tồn tối đa</label>
                   <Input type="number" min="0" step="any" value={productForm.maxStockThreshold} onChange={e => setProductForm((previous) => ({ ...previous, maxStockThreshold: parseNumericDraft(e.target.value) }))} className="h-8 rounded-lg bg-slate-50 shadow-inner font-semibold text-slate-700 tabular-nums sm:h-9" placeholder="Không giới hạn" />
                 </div>
                 <div className="space-y-1 md:col-span-1">
                   <label className="text-[11px] font-semibold text-slate-500">Thuộc tính / ghi chú nguồn</label>
                   <Input value={productForm.attributes} onChange={e => setProductForm((previous) => ({ ...previous, attributes: e.target.value }))} className="h-8 rounded-lg bg-slate-50 shadow-inner text-slate-700 sm:h-9" placeholder="Ví dụ: Màu đỏ · size M" />
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
                     <button
                       type="button"
                       onClick={() => setPricingExpanded((expanded) => !expanded)}
                       className="inline-flex h-7 items-center gap-1 rounded-md border border-sky-200 bg-white px-2 text-[11px] font-medium text-sky-800 hover:bg-sky-50 hover:text-sky-700"
                       aria-expanded={pricingExpanded}
                       aria-controls="product-pricing-content"
                     >
                       {pricingExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                       {pricingExpanded ? 'Thu gọn' : 'Mở rộng'}
                     </button>
                   </div>
                 </div>
                 {pricingExpanded && <div id="product-pricing-content" className="space-y-2">
                 {priceLists.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Chưa có bảng giá. Hệ thống sẽ dùng giá cơ bản hiện có và tạo bảng giá mặc định khi lưu.</p>}
                 {showInlinePriceListForm && (
                   <div className="rounded-md border border-sky-200 bg-white p-2">
                     <div className="mb-1.5 flex items-center justify-between gap-2">
                       <span className="text-xs font-semibold text-slate-800">Tạo bảng giá mới</span>
                       <span className="text-[11px] text-slate-500">Giá áp dụng theo nhóm khách</span>
                     </div>
                     <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_145px_105px_95px_auto]">
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
                       <select
                         value={newPriceList.markupMode}
                         onChange={(e) => setNewPriceList({ ...newPriceList, markupMode: e.target.value as 'percent' | 'amount' })}
                         className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                         aria-label="Kiểu điều chỉnh bảng giá"
                       >
                         <option value="percent">Theo %</option>
                         <option value="amount">Theo tiền</option>
                       </select>
                       <div className="relative">
                         <Input
                           type="number"
                           min={newPriceList.markupMode === 'percent' ? '-100' : undefined}
                           value={newPriceList.markupValue}
                           onChange={(e) => setNewPriceList({ ...newPriceList, markupValue: parseNumericDraft(e.target.value) })}
                           className="h-9 pr-8 text-right text-xs"
                           placeholder="0"
                           aria-label={newPriceList.markupMode === 'percent' ? 'Tăng giá theo phần trăm' : 'Cộng tiền so với giá cơ sở'}
                         />
                         <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{newPriceList.markupMode === 'percent' ? '%' : 'đ'}</span>
                       </div>
                       <Button type="button" onClick={createPriceList} disabled={!newPriceList.name.trim()} className="h-9 px-3 text-xs">Tạo bảng</Button>
                     </div>
                     <p className="mt-1.5 text-[11px] text-slate-500">Chọn Theo % để nhập 10 hoặc -10; chọn Theo tiền để cộng trực tiếp số tiền vào giá cơ sở.</p>
                     {pricingMessage && <p className="mt-1.5 text-[11px] text-emerald-700">{pricingMessage}</p>}
                   </div>
                 )}
                 <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                   <table className="min-w-[680px] w-full text-xs">
                     <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                       <tr>
                         <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-2 py-2 text-left font-semibold">Đơn vị / biến thể</th>
                         {priceLists.map((list: any) => <th scope="col" key={list.id} className="min-w-[145px] px-2 py-2 text-left font-semibold">
                           <div className="normal-case text-slate-700">{list.name}</div>
                           <div className={`mt-0.5 normal-case text-[10px] font-medium ${list.isDefault ? 'text-emerald-600' : 'text-slate-400'}`}>
                             {formatPriceListAdjustment(list)}
                           </div>
                         </th>)}
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                       <tr>
                         <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-2 text-left">
                           <p className="font-medium text-slate-800">{productForm.unit || 'Đơn vị cơ sở'}</p>
                           <p className="mt-0.5 text-[10px] font-normal text-slate-400">Đơn vị mặc định · ×1</p>
                         </th>
                         {priceLists.map((list: any) => {
                           const fallbackPrice = productFormBasePrice(list);
                           return <td key={list.id} className="px-2 py-2 align-top">
                             <div className="relative">
                               <Input type="number" min="0" value={productPriceDrafts[list.id] ?? fallbackPrice} aria-label={`Giá ${productForm.unit || 'đơn vị cơ sở'} · ${list.name}`} onChange={(e) => setProductPriceDrafts((previous) => ({ ...previous, [list.id]: parseNumericDraft(e.target.value) }))} className="h-8 pr-7 text-right text-xs font-semibold tabular-nums" />
                               <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">đ</span>
                             </div>
                           </td>;
                         })}
                       </tr>
                       {productVariantDrafts.map((variant, index) => <tr key={variant.id}>
                         <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-2 text-left">
                           <p className="truncate font-medium text-slate-800">{variant.name.trim() || `Biến thể ${index + 1}`}</p>
                           <p className="mt-0.5 text-[10px] font-normal text-slate-400">{variant.factor || 1}× {productForm.unit || 'đơn vị cơ sở'}</p>
                         </th>
                         {priceLists.map((list: any) => {
                           const draftKey = `${list.id}::${variant.id}`;
                           const fallbackPrice = productFormBasePrice(list) * (Number(variant.factor) || 1);
                           return <td key={list.id} className="px-2 py-2 align-top">
                             <div className="relative">
                               <Input type="number" min="0" value={productVariantPriceDrafts[draftKey] ?? fallbackPrice} aria-label={`Giá ${variant.name.trim() || `biến thể ${index + 1}`} · ${list.name}`} onChange={(e) => setProductVariantPriceDrafts((previous) => ({ ...previous, [draftKey]: parseNumericDraft(e.target.value) }))} className="h-8 pr-7 text-right text-xs tabular-nums" />
                               <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">đ</span>
                             </div>
                           </td>;
                         })}
                       </tr>)}
                     </tbody>
                   </table>
                 </div>
                 <p className="text-[11px] text-slate-500">Mỗi hàng là một đơn vị hoặc biến thể; mỗi cột là một bảng giá. Giá gợi ý có thể tính theo % hoặc số tiền cố định, và vẫn có thể sửa riêng.</p>
                 {productForm.productType === 'combo' && <p className="text-[11px] text-slate-500">Giá gợi ý của combo là tổng giá thành phần. Có thể nhập giá combo riêng; giá thành phần không bị thay đổi.</p>}
                 </div>}
               </div>

               {productForm.productType === 'standard' ? (
                 <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                   <div className="flex items-start justify-between gap-3">
                     <div>
                       <h3 className="text-sm font-semibold text-slate-900">Biến thể bán hàng</h3>
                       <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Một sản phẩm có thể có nhiều màu/loại, mỗi biến thể có mã vạch riêng. Hệ số quy đổi theo <b>{productForm.unit || 'đơn vị cơ sở'}</b>.</p>
                     </div>
                     <div className="flex shrink-0 items-center gap-1.5">
                       <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setProductVariantDrafts([...productVariantDrafts, { id: uuid(), sku: '', name: '', factor: 1, barcode: '', purchasePrice: 0 }])}>
                         <Plus className="mr-1 h-3 w-3" />Thêm biến thể
                       </Button>
                       <button
                         type="button"
                         onClick={() => setVariantsExpanded((expanded) => !expanded)}
                         className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-sky-700"
                         aria-expanded={variantsExpanded}
                         aria-controls="product-variants-content"
                       >
                         {variantsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                         {variantsExpanded ? 'Thu gọn' : 'Mở rộng'}
                       </button>
                     </div>
                   </div>
                   {variantsExpanded && <div id="product-variants-content" className="space-y-2">
                   {productVariantDrafts.length === 0 && <p className="rounded-md bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">Chưa có biến thể. Sản phẩm sẽ bán theo {productForm.unit || 'đơn vị cơ sở'}.</p>}
                   {productVariantDrafts.length > 0 && <>
                     <div className="space-y-1.5">
                       <div className="grid gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 md:grid-cols-[140px_minmax(160px,1fr)_90px_minmax(160px,1fr)_110px_32px]">
                         <span>SKU đơn vị</span>
                         <span>Tên biến thể / loại</span>
                         <span>Hệ số</span>
                         <span>Mã vạch riêng</span>
                         <span>Giá vốn</span>
                         <span className="sr-only">Thao tác</span>
                       </div>
                       {productVariantDrafts.map((variant, index) => <div key={variant.id} className="grid gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2 md:grid-cols-[140px_minmax(160px,1fr)_90px_minmax(160px,1fr)_110px_32px]">
                         <Input value={variant.sku} placeholder="SKU hộp" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, sku: e.target.value } : row))} className="h-9 text-xs" aria-label={`SKU biến thể ${index + 1}`} />
                         <Input value={variant.name} placeholder="Màu/loại, ví dụ Đỏ, Xanh" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} className="h-9 text-xs" />
                         <div className="relative"><Input type="text" inputMode="decimal" value={variant.factor} onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, factor: e.target.value.replace(',', '.') } : row))} className="h-9 pr-10 text-xs" placeholder="1" aria-label={`Hệ số quy đổi biến thể ${index + 1}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">× cơ sở</span></div>
                         <div className="relative"><Barcode className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-300" /><Input value={variant.barcode} placeholder="Mã vạch riêng (nếu có)" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, barcode: e.target.value } : row))} className="h-9 pl-8 pr-9 text-xs" /><button type="button" aria-label="Quét mã vạch biến thể" title="Quét mã vạch biến thể" onClick={() => { setVariantBarcodeIndex(index); setShowBarcodeScannerModal(true); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-sky-700 hover:bg-sky-50 hover:text-sky-700"><ScanLine className="h-3.5 w-3.5" /></button></div>
                         <Input type="number" min="0" step="any" value={variant.purchasePrice} placeholder="0" onChange={(e) => setProductVariantDrafts((previous) => previous.map((row, i) => i === index ? { ...row, purchasePrice: e.target.value.replace(',', '.') } : row))} className="h-9 text-right text-xs tabular-nums" aria-label={`Giá vốn biến thể ${index + 1}`} />
                         <button type="button" aria-label={`Xóa biến thể ${index + 1}`} onClick={() => setProductVariantDrafts(productVariantDrafts.filter((_, i) => i !== index))} className="flex h-9 items-center justify-center text-rose-500"><Trash2 className="h-4 w-4" /></button>
                       </div>)}
                     </div>

                   </>}
                   </div>}
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
                         <button type="button" aria-label="Quét mã sản phẩm thành phần" title="Quét mã sản phẩm thành phần" onClick={() => { setComponentBarcodeIndex(index); setVariantBarcodeIndex(null); setShowBarcodeScannerModal(true); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-sky-700 hover:bg-sky-50 hover:text-sky-700">
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

      <PriceListManagerModal
        open={showPricingModal}
        priceLists={priceLists}
        onClose={() => setShowPricingModal(false)}
        onCreate={createPriceListForManager}
        onRename={renamePriceListForManager}
        onDelete={deletePriceListForManager}
      />

      <CategoryManagerModal
        open={showCategoryModal}
        categories={categories}
        onClose={() => setShowCategoryModal(false)}
        onAdd={createCategoryForManager}
        onRename={renameCategoryForManager}
        onDelete={deleteCategoryForManager}
      />

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

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Lịch sử giao dịch</p>
                  <p className="text-[10px] text-slate-500">Nhập hàng, bán hàng, trả hàng và kiểm kê</p>
                </div>
                <select
                  value={stockCardTransactionFilter}
                  onChange={(event) => setStockCardTransactionFilter(event.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                  aria-label="Lọc loại giao dịch thẻ kho"
                >
                  <option value="all">Tất cả giao dịch</option>
                  <option value="Nhập hàng">Nhập hàng</option>
                  <option value="Bán hàng">Bán hàng</option>
                  <option value="Khách trả hàng">Khách trả hàng</option>
                  <option value="Trả hàng NCC">Trả hàng NCC</option>
                  <option value="Kiểm kê">Kiểm kê</option>
                </select>
              </div>

              {stockCardError && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{stockCardError}</p>}
              {stockCardLoading ? (
                <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">Đang tải lịch sử kho…</div>
              ) : visibleStockCardRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{stockCardRows.length ? 'Không có giao dịch phù hợp với bộ lọc.' : 'Chưa có giao dịch kho cho sản phẩm này.'}</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[1020px] w-full text-left text-xs">
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
                        <th className="whitespace-nowrap px-3 py-2">Người cập nhật</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleStockCardRows.map((row) => {
                        const meta = movementMeta(row.type);
                        const quantityPrefix = row.type === 'in' ? '+' : row.type === 'out' ? '-' : '±';
                        return (
                          <tr key={row.id} className="whitespace-nowrap hover:bg-slate-50/80">
                            <td className="px-3 py-2 font-mono text-sky-700">{readableStockDocument(row)}</td>
                            <td className="px-3 py-2 text-slate-600">{new Date(row.createdAt).toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2"><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${meta.tone}`}>{row.transactionType || meta.label}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCompactCurrency(row.transactionPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCompactCurrency(row.costPrice)}</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.type === 'in' ? 'text-emerald-700' : row.type === 'out' ? 'text-rose-700' : 'text-amber-700'}`}>{quantityPrefix}{row.quantity} {row.productUnit || stockCardProduct.unit}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{row.afterStock} {row.productUnit || stockCardProduct.unit}</td>
                            <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={row.partnerName || ''}>{row.partnerName || '—'}</td>
                            <td className="max-w-[150px] truncate px-3 py-2 text-slate-600" title={readableStockActor(row)}>{readableStockActor(row)}</td>
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
      <UnitManagerModal
        open={showUnitModal}
        units={catalogUnits}
        onClose={() => setShowUnitModal(false)}
        onAdd={createUnitForManager}
        onRename={renameUnitForManager}
        onDelete={deleteUnitForManager}
      />

      <div className="px-3 py-2 bg-white border-b border-slate-200 sticky top-0 z-40 flex flex-col lg:flex-row gap-2 lg:gap-3 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-slate-900">Hàng hóa</h1>
            <p className="text-[11px] leading-tight text-slate-500 mt-0.5">{inventoryTotal} hàng hóa trong hệ thống</p>
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
        </div>
      </div>

        <div className="flex-1 overflow-y-auto p-2 lg:p-3">
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Tồn thực tế · trang này</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{inventoryStats.totalUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Tồn khả dụng · trang này</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{inventoryStats.availableUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Giá trị tồn · trang này</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(inventoryStats.totalStockValue)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] text-slate-500">Sắp hết · trang này</p>
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
          {inventoryLoading && (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-700" role="status">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
              Đang tải danh sách hàng hóa…
            </div>
          )}
          {/* Mobile View: High-polish Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 lg:hidden">
            {visibleProducts.map(product => (
              <div key={product.id} className="p-3 bg-white space-y-2 relative group active:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <button type="button" className="block text-left text-xs font-semibold text-slate-500 font-mono leading-none hover:text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); void openEditProduct(product); }}>{product.sku}</button>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="block min-w-0 text-left font-semibold text-slate-900 text-base leading-tight tracking-tight hover:text-sky-700 hover:underline" onClick={(event) => { event.stopPropagation(); void openEditProduct(product); }}>{product.name}</button>
                      {product.productType === 'combo' && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${product.components?.length ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'}`}>{product.components?.length ? 'Combo' : 'Thiếu thành phần'}</span>}
                    </div>
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
                {product.units && product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).length > 0 && (
                  <p className="truncate text-[10px] text-slate-500" title={product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).map((unit: any) => `${unit.sku || '—'} · ${unit.name} ×${unit.factor} · vốn ${formatCompactCurrency(unit.purchasePrice)} · bán ${formatCompactCurrency(unit.sellingPrice)}`).join(' | ')}>
                    Đơn vị phụ: {product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).slice(0, 2).map((unit: any) => `${unit.sku || '—'} · ${unit.name} ×${unit.factor} · ${formatCompactCurrency(unit.sellingPrice)}`).join(' | ')}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-500">Tồn kho</div>
                      <div className={`text-sm font-medium tabular-nums leading-none ${
                      Number(product.availableStock ?? product.stock) <= product.lowStockThreshold ? 'text-amber-700' : 'text-slate-700'
                    }`}>
                      {Number(product.availableStock ?? product.stock)} <span className="text-[11px] text-slate-400 font-medium ml-0.5">{product.unit}</span>
                    </div>
                    {Number(product.maxStockThreshold || 0) > 0 && <div className="text-[10px] text-slate-400">Tối đa {Number(product.maxStockThreshold)}</div>}
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
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
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
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button type="button" className="block max-w-full truncate text-left font-semibold text-slate-900 tracking-tight text-xs leading-tight hover:text-sky-700 hover:underline" onClick={() => void openEditProduct(product)}>{product.name}</button>
                          {product.productType === 'combo' && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${product.components?.length ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'}`}>{product.components?.length ? 'Combo' : 'Thiếu thành phần'}</span>}
                        </div>
                        {product.barcode && <div className="text-[10px] text-slate-500 font-mono truncate">{product.barcode}</div>}
                        {product.units && product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).length > 0 && <div className="truncate text-[10px] text-slate-500" title={product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).map((unit: any) => `${unit.sku || '—'} · ${unit.name} ×${unit.factor} · vốn ${formatCompactCurrency(unit.purchasePrice)} · bán ${formatCompactCurrency(unit.sellingPrice)}`).join(' | ')}>Đơn vị phụ: {product.units.filter((unit: any) => unit.name !== product.unit || Number(unit.factor) !== 1).slice(0, 2).map((unit: any) => `${unit.sku || '—'} · ${unit.name} ×${unit.factor} · ${formatCompactCurrency(unit.sellingPrice)}`).join(' | ')}</div>}
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
                          <span className="tabular-nums whitespace-nowrap">{Number(product.availableStock ?? product.stock)}</span>
                          <span className="text-[10px] text-slate-500">{product.unit}</span>
                          {Number(product.availableStock ?? product.stock) <= product.lowStockThreshold && <AlertTriangle className="h-3 w-3" />}
                        </div>
                        {Number(product.maxStockThreshold || 0) > 0 && <span className="mt-0.5 text-[10px] text-slate-400">Tối đa {Number(product.maxStockThreshold)}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openStockCard(product)}
                          className="h-8 gap-1 rounded-md bg-sky-50 px-2 text-[11px] text-sky-700 hover:bg-sky-100 transition-colors"
                          title="Thẻ kho"
                        >
                          <ArrowUpDown className="h-4 w-4" />
                          <span>Thẻ kho</span>
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

        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {inventoryTotal === 0 ? 'Không có hàng hóa phù hợp' : `Hiển thị ${inventoryPage * inventoryPageSize + 1}–${Math.min((inventoryPage + 1) * inventoryPageSize, inventoryTotal)} / ${inventoryTotal}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              disabled={inventoryPage === 0 || inventoryLoading}
              onClick={() => setInventoryPage((page) => Math.max(0, page - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Trước
            </Button>
            <span className="min-w-[72px] text-center tabular-nums">Trang {inventoryPage + 1} / {Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize))}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              disabled={(inventoryPage + 1) * inventoryPageSize >= inventoryTotal || inventoryLoading}
              onClick={() => setInventoryPage((page) => page + 1)}
            >
              Sau <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
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
                      {m.productName || 'Sản phẩm'} {m.referenceLabel ? `· ${m.transactionType} ${m.referenceLabel}` : readableStockNote(m) ? `· ${readableStockNote(m)}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(m.createdAt).toLocaleString('vi-VN')} · {m.actorName || 'N/A'}
                      {m.actorRole ? ` (${m.actorRole})` : ''}
                      {m.referenceType === 'invoice' && m.referenceId && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate(`/app/invoices?invoiceId=${encodeURIComponent(m.referenceId)}`)}>Mở hóa đơn</button></>}
                      {m.referenceType === 'sales_return' && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate('/app/returns')}>Mở phiếu trả</button></>}
                      {m.referenceType === 'purchase' && m.referenceId && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate(`/app/purchases?purchaseId=${encodeURIComponent(m.referenceId)}`)}>Mở phiếu nhập</button></>}
                      {m.referenceType === 'purchase_return' && <><span> · </span><button type="button" className="text-sky-700 hover:underline" onClick={() => navigate('/app/purchase-returns')}>Mở phiếu trả NCC</button></>}
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
