import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, AlertTriangle, Package, ArrowUpDown, X, Save, Edit3, Tag, CheckCircle, Camera, Layers, Trash2, Upload, Download, ScanLine, SlidersHorizontal, ListFilter, Ellipsis, Settings2 } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { Product } from '../types';
import { v4 as uuid } from 'uuid';
import { productsApi, stockMovementsApi, priceListsApi, productUnitsApi, productComponentsApi } from '../lib/api';
import * as XLSX from 'xlsx';

type ImportPreviewRow = {
  rowNumber: number;
  mode: 'create' | 'update' | 'skip';
  errors: string[];
  payload: Partial<Product>;
  existingId?: string;
};

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, activeTenant, categories, addCategory } = useApp();
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
  const [newUnitName, setNewUnitName] = useState('');
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState('');
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [stockCheckActual, setStockCheckActual] = useState<number>(0);
  const [bulkCheckActuals, setBulkCheckActuals] = useState<Record<string, number>>({});
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated_desc' | 'name_asc' | 'stock_asc' | 'stock_desc' | 'price_desc'>('updated_desc');
  const [importing, setImporting] = useState(false);
  const [showImportPreviewModal, setShowImportPreviewModal] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [selectedImportRows, setSelectedImportRows] = useState<number[]>([]);
  const [showBarcodeScannerModal, setShowBarcodeScannerModal] = useState(false);
  const [barcodeScannerError, setBarcodeScannerError] = useState('');
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number>>({});
  const [pricingProductId, setPricingProductId] = useState('');
  const [unitDrafts, setUnitDrafts] = useState<Array<{ name: string; factor: number; barcode: string }>>([]);
  const [componentDrafts, setComponentDrafts] = useState<Array<{ componentProductId: string; quantity: number }>>([]);
  const [newPriceList, setNewPriceList] = useState({ name: '', customerType: 'all' });
  const [pricingMessage, setPricingMessage] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const barcodeVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const barcodeStreamRef = React.useRef<MediaStream | null>(null);
  const barcodeScanIntervalRef = React.useRef<number | null>(null);

  const unitOptions = useMemo(() => {
    const defaults = ['Cái', 'Chai', 'Thùng', 'Hộp', 'Gói', 'Kg', 'Lít'];
    const dynamicUnits = products.map((p) => p.unit).filter(Boolean);
    return Array.from(new Set([...defaults, ...customUnits, ...dynamicUnits]));
  }, [customUnits, products]);

  const [productForm, setProductForm] = useState({
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

  const [stockUpdateForm, setUpdateForm] = useState({
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
      taxRate: Number(productForm.taxRate) || 0,
      stock: Number(productForm.stock) || 0,
      lowStockThreshold: Number(productForm.lowStockThreshold) || 0,
      productType: productForm.productType,
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
    visibleProducts.forEach((p) => { defaults[p.id] = p.stock; });
    setBulkCheckActuals(defaults);
    setShowBulkCheckModal(true);
  };

  const handleBulkCheckApply = async () => {
    setFormError('');
    try {
      for (const product of visibleProducts) {
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
      barcode: product.barcode || '',
      category: product.category,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      imageUrl: product.imageUrl || '',
      productType: product.productType || 'standard'
    });
    setShowProductModal(true);
  };

  const openPricing = async () => {
    setPricingMessage('');
    try {
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      const list = lists.find((item: any) => item.isDefault) || lists[0];
      setSelectedPriceListId(list?.id || '');
      const firstProduct = products[0];
      setPricingProductId(firstProduct?.id || '');
      setPriceDrafts(Object.fromEntries(products.map((product) => {
        const item = list?.items?.find((row: any) => row.productId === product.id && row.unitName === product.unit);
        return [product.id, Number(item?.price ?? product.sellingPrice)];
      })));
      if (firstProduct) {
        const [units, components] = await Promise.all([productUnitsApi.list(firstProduct.id), productComponentsApi.list(firstProduct.id)]);
        setUnitDrafts(units.filter((unit: any) => unit.name !== firstProduct.unit).map((unit: any) => ({ name: unit.name, factor: Number(unit.factor), barcode: unit.barcode || '' })));
        setComponentDrafts(components.map((component: any) => ({ componentProductId: component.componentProductId, quantity: Number(component.quantity) })));
      }
      setShowPricingModal(true);
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tải cấu hình bán hàng.');
    }
  };

  const changePricingProduct = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    setPricingProductId(productId);
    if (!product) return;
    try {
      const [units, components] = await Promise.all([productUnitsApi.list(productId), productComponentsApi.list(productId)]);
      setUnitDrafts(units.filter((unit: any) => unit.name !== product.unit).map((unit: any) => ({ name: unit.name, factor: Number(unit.factor), barcode: unit.barcode || '' })));
      setComponentDrafts(components.map((component: any) => ({ componentProductId: component.componentProductId, quantity: Number(component.quantity) })));
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tải cấu hình sản phẩm.');
    }
  };

  const changePricingList = (listId: string) => {
    setSelectedPriceListId(listId);
    const list = priceLists.find((item) => item.id === listId);
    setPriceDrafts(Object.fromEntries(products.map((product) => {
      const item = list?.items?.find((row: any) => row.productId === product.id && row.unitName === product.unit);
      return [product.id, Number(item?.price ?? product.sellingPrice)];
    })));
  };

  const savePricing = async () => {
    const selectedList = priceLists.find((list) => list.id === selectedPriceListId);
    const items = products.map((product) => ({ productId: product.id, unitName: product.unit, unitFactor: 1, price: Number(priceDrafts[product.id] ?? product.sellingPrice) }));
    try {
      if (selectedList) {
        const untouched = (selectedList.items || []).filter((row: any) => !products.some((product) => product.id === row.productId && row.unitName === product.unit));
        await priceListsApi.saveItems(selectedList.id, [...untouched, ...items]);
      }
      const selectedProduct = products.find((product) => product.id === pricingProductId);
      if (selectedProduct) {
        await productUnitsApi.save(selectedProduct.id, unitDrafts);
        await productComponentsApi.save(selectedProduct.id, selectedProduct.productType === 'combo' ? componentDrafts : []);
      }
      setPriceLists(await priceListsApi.list(true));
      setPricingMessage('Đã lưu cấu hình bảng giá, đơn vị và combo.');
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể lưu cấu hình bán hàng.');
    }
  };

  const createPriceList = async () => {
    if (!newPriceList.name.trim()) return;
    try {
      const created = await priceListsApi.create({ name: newPriceList.name.trim(), customerType: newPriceList.customerType, active: true });
      setPriceLists(await priceListsApi.list(true));
      setSelectedPriceListId(created.id);
      setNewPriceList({ name: '', customerType: 'all' });
      setPricingMessage('Đã tạo bảng giá mới.');
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tạo bảng giá.');
    }
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

  const stopBarcodeScanner = () => {
    if (barcodeScanIntervalRef.current) {
      window.clearInterval(barcodeScanIntervalRef.current);
      barcodeScanIntervalRef.current = null;
    }
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      barcodeStreamRef.current = null;
    }
  };

  const closeBarcodeScannerModal = () => {
    stopBarcodeScanner();
    setShowBarcodeScannerModal(false);
  };

  const openBarcodeScanner = async () => {
    setBarcodeScannerError('');
    if (!('BarcodeDetector' in window)) {
      setBarcodeScannerError('Thiết bị chưa hỗ trợ BarcodeDetector. Vui lòng nhập tay hoặc dùng trình duyệt mới.');
      setShowBarcodeScannerModal(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      barcodeStreamRef.current = stream;
      setShowBarcodeScannerModal(true);
      window.setTimeout(() => {
        if (barcodeVideoRef.current) {
          barcodeVideoRef.current.srcObject = stream;
          void barcodeVideoRef.current.play();
        }
      }, 50);
    } catch {
      setBarcodeScannerError('Không mở được camera. Hãy cấp quyền camera rồi thử lại.');
      setShowBarcodeScannerModal(true);
    }
  };

  useEffect(() => {
    if (!showBarcodeScannerModal || !barcodeVideoRef.current || !('BarcodeDetector' in window)) return;
    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
    });
    barcodeScanIntervalRef.current = window.setInterval(async () => {
      if (!barcodeVideoRef.current) return;
      try {
        const codes = await detector.detect(barcodeVideoRef.current);
        const code = codes?.[0]?.rawValue?.trim();
        if (code) {
          setProductForm((prev) => ({ ...prev, barcode: code }));
          closeBarcodeScannerModal();
        }
      } catch {
        // Ignore frame decode errors.
      }
    }, 300);

    return () => {
      if (barcodeScanIntervalRef.current) {
        window.clearInterval(barcodeScanIntervalRef.current);
        barcodeScanIntervalRef.current = null;
      }
    };
  }, [showBarcodeScannerModal]);

  useEffect(() => () => stopBarcodeScanner(), []);

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
    const keyword = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      const matchesKeyword =
        !keyword ||
        p.name.toLowerCase().includes(keyword) ||
        p.sku.toLowerCase().includes(keyword) ||
        (p.barcode || '').toLowerCase().includes(keyword) ||
        p.category.toLowerCase().includes(keyword);
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

  const inventoryStats = useMemo(() => {
    const lowStock = products.filter((p) => p.trackStock && Number(p.availableStock ?? p.stock) <= p.lowStockThreshold).length;
    const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const reservedUnits = products.reduce((sum, p) => sum + Number(p.reservedStock || 0), 0);
    const availableUnits = products.reduce((sum, p) => sum + Number(p.availableStock ?? p.stock ?? 0), 0);
    const totalStockValue = products.reduce((sum, p) => sum + (p.stock || 0) * (p.purchasePrice || 0), 0);
    return { lowStock, totalUnits, reservedUnits, availableUnits, totalStockValue };
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

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden relative">
      {showBarcodeScannerModal && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Quét mã vạch sản phẩm</h3>
              <button onClick={closeBarcodeScannerModal} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg bg-slate-950 overflow-hidden aspect-video flex items-center justify-center">
                {barcodeScannerError ? (
                  <div className="px-4 text-center text-sm text-rose-300">{barcodeScannerError}</div>
                ) : (
                  <video ref={barcodeVideoRef} className="h-full w-full object-cover" muted playsInline />
                )}
              </div>
              <p className="text-xs text-slate-500">Đưa mã vạch vào giữa khung, hệ thống sẽ tự điền vào trường mã vạch.</p>
              <Button variant="outline" className="w-full" onClick={closeBarcodeScannerModal}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {showImportPreviewModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden">
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
            <div className="max-h-[60vh] overflow-auto">
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
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
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
            </div>
          </div>
        </div>
      )}

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
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl border border-white overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-4 py-4 md:px-6 md:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
               <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20">
                     <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-semibold text-slate-900">{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Thông tin hàng hóa cơ bản</p>
                  </div>
               </div>
               <button onClick={() => setShowProductModal(false)} className="h-9 w-9 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all flex items-center justify-center">
                  <X className="h-5 w-5" />
               </button>
            </div>
            
            <div className="px-4 py-4 md:px-6 md:py-5 space-y-4 md:space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
               {formError && (
                 <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                   {formError}
                 </div>
               )}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                  <div className="space-y-4">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Hình ảnh sản phẩm</label>
                    <div className="relative group/img">
                      <div className="h-36 md:h-40 w-full rounded-lg bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/img:border-sky-300">
                        {productForm.imageUrl ? (
                          <img src={productForm.imageUrl} className="h-full w-full object-cover" alt="Preview" />
                        ) : (
                          <>
                            <Camera className="h-8 w-8 text-slate-300 group-hover/img:scale-110 transition-transform" />
                            <span className="text-xs font-medium text-slate-500 mt-2">Tải ảnh lên</span>
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
                        <label className="text-xs font-semibold text-slate-500 ml-1">Mã SKU</label>
                        <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <Input 
                            value={productForm.sku}
                            onChange={e => setProductForm({...productForm, sku: e.target.value})}
                            className="h-11 pl-12 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                            placeholder="Ví dụ: SP001" 
                        />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 ml-1">Mã vạch</label>
                        <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <Input 
                            value={productForm.barcode}
                            onChange={e => setProductForm({...productForm, barcode: e.target.value})}
                            className="h-11 pl-12 pr-28 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                            placeholder="EAN/UPC/Code128 (không bắt buộc)" 
                        />
                        <button
                          type="button"
                          onClick={openBarcodeScanner}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1 text-xs font-medium"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <ScanLine className="h-3.5 w-3.5" />
                          Quét
                        </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 ml-1">Tên sản phẩm</label>
                        <Input 
                        value={productForm.name}
                        onChange={e => setProductForm({...productForm, name: e.target.value})}
                        className="h-11 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                        placeholder="Ví dụ: Nước ngọt Coca" 
                        />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-xs font-semibold text-slate-500">Danh mục</label>
                        <button 
                          onClick={() => setShowCategoryModal(true)}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                        >
                          + Thêm mới
                        </button>
                    </div>
                    <select 
                      value={productForm.category}
                      onChange={e => setProductForm({...productForm, category: e.target.value})}
                      className="w-full h-11 px-4 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm appearance-none"
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
                      <label className="text-xs font-semibold text-slate-500">Đơn vị tính</label>
                      <button
                        onClick={() => setShowUnitModal(true)}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        + Thêm mới
                      </button>
                    </div>
                    <select
                      value={productForm.unit}
                      onChange={e => setProductForm({ ...productForm, unit: e.target.value })}
                      className="w-full h-11 px-4 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm appearance-none"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Loại hàng hóa</label>
                    <select
                      value={productForm.productType}
                      onChange={e => setProductForm({ ...productForm, productType: e.target.value as 'standard' | 'combo' })}
                      className="w-full h-11 px-4 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                    >
                      <option value="standard">Sản phẩm thường</option>
                      <option value="combo">Combo bán hàng</option>
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                    <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Giá nhập</label>
                    <div className="relative">
                       <Input 
                         type="number"
                         value={productForm.purchasePrice}
                         onChange={e => setProductForm({...productForm, purchasePrice: Number(e.target.value)})}
                         className="h-11 pr-9 rounded-lg bg-sky-50/30 border-none shadow-inner font-semibold text-sky-700 tabular-nums"
                       />
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-sky-700">đ</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Giá bán</label>
                    <div className="relative">
                       <Input 
                         type="number"
                         value={productForm.sellingPrice}
                         onChange={e => setProductForm({...productForm, sellingPrice: Number(e.target.value)})}
                         className="h-11 pr-9 rounded-lg bg-sky-50/30 border-none shadow-inner font-semibold text-sky-700 tabular-nums"
                       />
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-sky-700">đ</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Thuế suất (%)</label>
                    <Input type="number" min="0" max="100" value={productForm.taxRate} onChange={e => setProductForm({...productForm, taxRate: Number(e.target.value)})} className="h-11 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 tabular-nums" />
                  </div>
               </div>

               {!editingProduct && (
                 <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Số lượng tồn kho ban đầu</label>
                    <Input 
                       type="number"
                       value={productForm.stock}
                       onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})}
                       className="h-11 rounded-lg bg-slate-50 border-none shadow-inner font-semibold text-slate-700 text-sm"
                    />
                 </div>
               )}
            </div>

            <div className="px-4 py-4 md:px-6 md:py-5 bg-slate-50/70 border-t border-slate-100">
               <Button 
                 onClick={handleSaveProduct}
                 disabled={savingProduct}
                 className="w-full h-11 md:h-12 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-xl shadow-sky-900/20 gap-2"
                >
                 <Save className="h-4 w-4" />
                 <span>{savingProduct ? 'Đang lưu...' : 'Lưu sản phẩm'}</span>
               </Button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white"><Settings2 className="h-5 w-5" /></div>
                <div><h2 className="font-semibold text-slate-900">Cấu hình bán hàng</h2><p className="text-xs text-slate-500">Bảng giá, đơn vị quy đổi và thành phần combo</p></div>
              </div>
              <button onClick={() => setShowPricingModal(false)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[260px_1fr]">
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bảng giá</p>
                  <select value={selectedPriceListId} onChange={(e) => changePricingList(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                    {priceLists.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.customerType === 'loyal' ? 'Thân thiết' : list.customerType === 'retail' ? 'Bán lẻ' : 'Mặc định'}</option>)}
                  </select>
                  <div className="mt-3 flex gap-2">
                    <Input value={newPriceList.name} onChange={(e) => setNewPriceList({ ...newPriceList, name: e.target.value })} placeholder="Bảng giá mới" className="h-9 text-sm" />
                    <Button onClick={createPriceList} className="h-9 shrink-0 px-3">Tạo</Button>
                  </div>
                  <select value={newPriceList.customerType} onChange={(e) => setNewPriceList({ ...newPriceList, customerType: e.target.value })} className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option>
                  </select>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sản phẩm cấu hình</label>
                  <select value={pricingProductId} onChange={(e) => changePricingProduct(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.productType === 'combo' ? 'Combo' : product.unit}</option>)}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">Đơn vị cơ sở: <b>{products.find((p) => p.id === pricingProductId)?.unit || '—'}</b></p>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Giá theo sản phẩm · {priceLists.find((list) => list.id === selectedPriceListId)?.name || '—'}</h3><span className="text-xs text-slate-500">Giá theo đơn vị cơ sở</span></div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Sản phẩm</th><th className="p-2">Đơn vị</th><th className="p-2 text-right">Giá bán</th></tr></thead><tbody className="divide-y divide-slate-100">
                      {products.map((product) => <tr key={product.id}><td className="p-2 font-medium text-slate-800">{product.name}</td><td className="p-2 text-slate-500">{product.unit}</td><td className="p-2"><Input type="number" min="0" value={priceDrafts[product.id] ?? product.sellingPrice} onChange={(e) => setPriceDrafts({ ...priceDrafts, [product.id]: Number(e.target.value) || 0 })} className="ml-auto h-9 max-w-36 text-right" /></td></tr>)}
                    </tbody></table>
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Đơn vị quy đổi</h3><Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setUnitDrafts([...unitDrafts, { name: '', factor: 1, barcode: '' }])}><Plus className="mr-1 h-3 w-3" />Thêm</Button></div>
                    <div className="space-y-2">{unitDrafts.map((unit, index) => <div key={`${unit.name}-${index}`} className="grid grid-cols-[1fr_70px_1fr_auto] gap-2"><Input value={unit.name} placeholder="Tên đơn vị" onChange={(e) => setUnitDrafts(unitDrafts.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} className="h-9 text-xs" /><Input type="number" min="0.01" value={unit.factor} onChange={(e) => setUnitDrafts(unitDrafts.map((row, i) => i === index ? { ...row, factor: Number(e.target.value) || 1 } : row))} className="h-9 text-xs" /><Input value={unit.barcode} placeholder="Mã vạch" onChange={(e) => setUnitDrafts(unitDrafts.map((row, i) => i === index ? { ...row, barcode: e.target.value } : row))} className="h-9 text-xs" /><button onClick={() => setUnitDrafts(unitDrafts.filter((_, i) => i !== index))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></div>)}</div>
                    <p className="mt-2 text-xs text-slate-500">Ví dụ: 1 Hộp = 20 {products.find((p) => p.id === pricingProductId)?.unit || 'đơn vị cơ sở'}.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Thành phần combo</h3><Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setComponentDrafts([...componentDrafts, { componentProductId: products.find((p) => p.productType !== 'combo' && p.id !== pricingProductId)?.id || '', quantity: 1 }])}><Plus className="mr-1 h-3 w-3" />Thêm</Button></div>
                    <div className="space-y-2">{componentDrafts.map((component, index) => <div key={`${component.componentProductId}-${index}`} className="grid grid-cols-[1fr_70px_auto] gap-2"><select value={component.componentProductId} onChange={(e) => setComponentDrafts(componentDrafts.map((row, i) => i === index ? { ...row, componentProductId: e.target.value } : row))} className="h-9 rounded-md border border-slate-200 px-2 text-xs">{products.filter((p) => p.productType !== 'combo' && p.id !== pricingProductId).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><Input type="number" min="0.01" value={component.quantity} onChange={(e) => setComponentDrafts(componentDrafts.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) || 1 } : row))} className="h-9 text-xs" /><button onClick={() => setComponentDrafts(componentDrafts.filter((_, i) => i !== index))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></div>)}</div>
                    {products.find((p) => p.id === pricingProductId)?.productType !== 'combo' && <p className="mt-2 text-xs text-slate-500">Chuyển loại sản phẩm sang Combo để sử dụng thành phần.</p>}
                  </div>
                </div>
                {pricingMessage && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{pricingMessage}</p>}
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowPricingModal(false)}>Đóng</Button><Button onClick={savePricing}><Save className="mr-2 h-4 w-4" />Lưu cấu hình</Button></div>
              </div>
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

      <div className="p-3 lg:p-4 bg-white border-b border-slate-200 sticky top-0 z-40 flex flex-col lg:flex-row gap-2 lg:gap-4 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-slate-900">Kho hàng</h1>
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
          <div className="relative group w-full flex-1 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
            <Input 
              className="h-9 lg:h-10 rounded-lg border-none bg-slate-100/70 shadow-inner focus:ring-2 focus:ring-sky-500/20 transition-all font-medium text-sm placeholder:text-slate-400"
                placeholder="Tìm theo tên, SKU, danh mục..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:gap-2">
            <Button
              variant="outline"
              onClick={openPricing}
              className="h-9 lg:h-10 px-3 rounded-lg gap-2 font-medium text-sm"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Bảng giá & combo</span>
            </Button>
            <Button
              onClick={() => {
                  resetProductForm();
                  setShowProductModal(true);
              }}
              className="h-9 lg:h-10 px-4 rounded-lg gap-2 font-semibold bg-sky-600 hover:bg-sky-700 shadow-sm transition-all text-white shrink-0 text-sm"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Thêm mới</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowMobileActionSheet(true)}
              className="h-10 px-3 rounded-lg text-sm gap-2 lg:hidden"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="hidden min-[390px]:inline">Tác vụ</span>
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="hidden lg:inline-flex h-10 lg:h-11 px-4 rounded-lg text-sm gap-2"
          >
            <Upload className="h-4 w-4" />
            {importing ? 'Đang import...' : 'Import CSV/Excel'}
          </Button>
          <Button
            variant="outline"
            onClick={downloadTemplates}
            className="hidden lg:inline-flex h-10 lg:h-11 px-4 rounded-lg text-sm gap-2"
          >
            <Download className="h-4 w-4" />
            Tải mẫu
          </Button>
          <Button variant="outline" onClick={openBulkCheck} className="hidden lg:inline-flex h-10 lg:h-11 px-4 rounded-lg text-sm">
            Kiểm kê
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tồn thực tế</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{inventoryStats.totalUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tồn khả dụng</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700 tabular-nums">{inventoryStats.availableUnits}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Đang giữ cho bill</p>
            <p className="mt-1 text-lg font-semibold text-orange-600 tabular-nums">{inventoryStats.reservedUnits}</p>
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

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 lg:p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-600">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            Bộ lọc & sắp xếp hàng hóa
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">Tất cả danh mục</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">Tất cả tồn kho</option>
              <option value="in_stock">Còn hàng</option>
              <option value="low_stock">Sắp hết</option>
              <option value="out_of_stock">Hết hàng</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="updated_desc">Mới cập nhật</option>
              <option value="name_asc">Tên A → Z</option>
              <option value="stock_asc">Tồn kho thấp → cao</option>
              <option value="stock_desc">Tồn kho cao → thấp</option>
              <option value="price_desc">Giá bán cao → thấp</option>
            </select>
            <Button
              variant="outline"
              className="h-10 justify-start gap-2 px-3 text-sm"
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

        <div className="bg-white rounded-lg shadow-xl shadow-slate-900/5 border border-white overflow-hidden">
          {/* Mobile View: High-polish Cards */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 lg:hidden">
            {visibleProducts.map(product => (
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
                      Number(product.availableStock ?? product.stock) <= product.lowStockThreshold ? 'text-orange-600' : 'text-slate-900'
                    }`}>
                      {Number(product.availableStock ?? product.stock)} <span className="text-xs text-slate-400 font-medium ml-0.5">{product.unit}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">Thực tế {product.stock} · Giữ {product.reservedStock || 0}</div>
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
            <table className="w-full min-w-[1120px] text-left border-collapse table-fixed">
              <colgroup>
                <col className="w-[130px]" />
                <col className="w-[340px]" />
                <col className="w-[150px]" />
                <col className="w-[140px]" />
                <col className="w-[170px]" />
                <col className="w-[170px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100">
                    <div className="flex items-center gap-2">Mã SKU <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100">Sản phẩm</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100">Danh mục</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100 text-right">Giá nhập</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100 text-right">Giá bán</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100 text-center">Tồn kho</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleProducts.map(product => (
                  <tr key={product.id} className="group h-[84px] hover:bg-sky-50/20 transition-all duration-300">
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-flex max-w-full truncate font-mono text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/50">{product.sku}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-slate-50 group-hover:bg-white group-hover:shadow-lg transition-all flex items-center justify-center text-slate-400 group-hover:text-sky-600 border border-transparent group-hover:border-sky-100 shrink-0">
                           <Package className="h-5 w-5 transform group-hover:rotate-12 transition-transform" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 tracking-tight text-base leading-tight truncate">{product.name}</div>
                          {product.barcode && <div className="text-xs text-slate-500 font-mono truncate">{product.barcode}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-flex max-w-full truncate text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">{product.category}</span>
                    </td>
                    <td className="px-4 py-3 align-middle text-right font-semibold text-slate-500 tabular-nums text-sm whitespace-nowrap">
                        {formatCurrency(product.purchasePrice)}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <div className="flex flex-col items-end">
                        <div className="font-semibold text-sky-700 text-lg tabular-nums whitespace-nowrap">{formatCurrency(product.sellingPrice)}</div>
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
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <div className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2.5 shadow-sm transition-transform group-hover:scale-105 ${
                          Number(product.availableStock ?? product.stock) <= product.lowStockThreshold
                            ? 'bg-orange-600 text-white ring-4 ring-orange-100' 
                            : 'bg-slate-900 text-white ring-4 ring-slate-100'
                        }`}>
                          <button className="hover:scale-125 transition-transform" onClick={(e) => {
                             e.stopPropagation();
                             openStockEntry(product);
                          }}><Plus className="h-4 w-4" /></button>
                          <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{Number(product.availableStock ?? product.stock)}</span>
                          <span className="opacity-70">{product.unit}</span>
                          {Number(product.availableStock ?? product.stock) <= product.lowStockThreshold && <AlertTriangle className="h-4 w-4" />}
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">Thực tế {product.stock} · Giữ {product.reservedStock || 0}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openEditProduct(product)}
                          className="h-9 w-9 rounded-lg bg-slate-50 hover:bg-sky-600 text-slate-400 hover:text-white transition-all shadow-sm ring-1 ring-slate-100 hover:ring-sky-500"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProduct(product)}
                          className="h-9 w-9 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white transition-all shadow-sm ring-1 ring-rose-100 hover:ring-rose-500"
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
