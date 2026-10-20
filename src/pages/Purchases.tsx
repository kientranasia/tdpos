import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Barcode,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Save,
  Trash2,
  UserRound,
  X,
  Tag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppPageHeader from '../components/layout/AppPageHeader';
import { cashAccountsApi, priceListsApi, productUnitsApi, productsApi, purchasesApi, suppliersApi } from '../lib/api';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Product } from '../types';

type NumericDraft = number | string;

type Line = {
  productId: string;
  quantity: NumericDraft;
  price: NumericDraft;
  unitName: string;
  unitFactor: number;
};

type ReturnLine = {
  purchaseItemId: string;
  productName: string;
  unit: string;
  quantity: NumericDraft;
  maxQuantity: number;
  price: number;
};

type NewProductDraft = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  purchasePrice: NumericDraft;
  taxRate: NumericDraft;
  stock: NumericDraft;
  lowStockThreshold: NumericDraft;
  imageUrl: string;
  sellingPrice: NumericDraft;
};

const toNumber = (value: NumericDraft) => Number(value) || 0;

export default function Purchases() {
  const { products, categories, refreshProducts } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierFormError, setSupplierFormError] = useState('');
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', taxCode: '', address: '' });
  const [documentNo, setDocumentNo] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billNote, setBillNote] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<NumericDraft>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'payable'>('payable');
  const [accountId, setAccountId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [message, setMessage] = useState('');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showNewProductBarcodeScanner, setShowNewProductBarcodeScanner] = useState(false);
  const [newProductVariantBarcodeIndex, setNewProductVariantBarcodeIndex] = useState<number | null>(null);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [purchaseView, setPurchaseView] = useState<'history' | 'create'>('history');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [purchaseDetails, setPurchaseDetails] = useState<Record<string, any>>({});
  const [loadingPurchaseId, setLoadingPurchaseId] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnPurchase, setReturnPurchase] = useState<any | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnNote, setReturnNote] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductDraft>({
    name: '',
    sku: '',
    barcode: '',
    category: 'Tạp hóa',
    unit: 'Cái',
    purchasePrice: '',
    taxRate: 0,
    stock: 0,
    lowStockThreshold: 10,
    imageUrl: '',
    sellingPrice: '',
  });
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [productPriceDrafts, setProductPriceDrafts] = useState<Record<string, NumericDraft>>({});
  const [productVariantDrafts, setProductVariantDrafts] = useState<Array<{ name: string; factor: NumericDraft; barcode: string }>>([]);
  const [showInlinePriceListForm, setShowInlinePriceListForm] = useState(false);
  const [newPriceList, setNewPriceList] = useState({ name: '', customerType: 'all' });
  const [pricingMessage, setPricingMessage] = useState('');
  const productPickerRef = useRef<HTMLDivElement>(null);
  const supplierPickerRef = useRef<HTMLDivElement>(null);

  const supplierLabel = (supplier: any) => `${supplier.code} · ${supplier.name}`;

  const reload = async () => {
    const [supplierRows, purchaseRows, returnRows, accountRows] = await Promise.all([
      suppliersApi.list(),
      purchasesApi.list(),
      purchasesApi.returns(),
      cashAccountsApi.list(),
    ]);
    setSuppliers(supplierRows);
    setPurchases(purchaseRows);
    setPurchaseReturns(returnRows);
    setAccounts(accountRows);
    if (!supplierId && supplierRows[0]) setSupplierId(supplierRows[0].id);
  };

  useEffect(() => {
    reload().catch((err) => setMessage(err instanceof Error ? err.message : 'Không thể tải dữ liệu nhập hàng.'));
  }, []);

  useEffect(() => {
    if (!showProductPicker && !showSupplierPicker) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (showProductPicker && productPickerRef.current && !productPickerRef.current.contains(target)) setShowProductPicker(false);
      if (showSupplierPicker && supplierPickerRef.current && !supplierPickerRef.current.contains(target)) setShowSupplierPicker(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [showProductPicker, showSupplierPicker]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.price), 0),
    [lines],
  );
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const standardProducts = useMemo(() => products.filter((product) => product.productType !== 'combo'), [products]);
  const productPickerOptions = useMemo(() => {
    const keyword = normalizeSearchText(barcode);
    return standardProducts
      .filter((product) => !keyword || normalizeSearchText(`${product.sku} ${product.name} ${product.barcode || ''}`).includes(keyword))
      .slice(0, 50);
  }, [barcode, standardProducts]);
  const supplierPickerOptions = useMemo(() => {
    const keyword = normalizeSearchText(supplierSearch);
    return suppliers.filter((supplier) => !keyword || normalizeSearchText(supplierLabel(supplier)).includes(keyword));
  }, [supplierSearch, suppliers]);
  const returnedAmountByPurchase = useMemo(() => purchaseReturns.reduce<Record<string, number>>((result, item) => {
    result[item.purchaseId] = (result[item.purchaseId] || 0) + Number(item.totalAmount || 0);
    return result;
  }, {}), [purchaseReturns]);
  const filteredPurchases = useMemo(() => {
    const keyword = normalizeSearchText(purchaseSearch);
    return purchases.filter((purchase) => {
      if (!keyword) return true;
      const supplierName = purchase.supplier?.name || suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name || '';
      return normalizeSearchText(`${purchase.documentNo} ${supplierName} ${purchase.createdByName || ''} ${purchase.createdBy || ''}`).includes(keyword);
    });
  }, [purchaseSearch, purchases, suppliers]);
  const purchaseHistorySummary = useMemo(() => ({
    total: purchases.reduce((sum, purchase) => sum + Number(purchase.finalAmount || 0), 0),
    payable: purchases.reduce((sum, purchase) => sum + Number(purchase.payableAmount || 0), 0),
    returned: purchases.reduce((sum, purchase) => sum + Number(returnedAmountByPurchase[purchase.id] || 0), 0),
  }), [purchases, returnedAmountByPurchase]);

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

  const openCreateProduct = async (barcodeValue = '') => {
    setNewProduct({
      name: '',
      sku: generateNextSku(),
      barcode: barcodeValue,
      category: categories[0]?.name || 'Tạp hóa',
      unit: 'Cái',
      purchasePrice: '',
      taxRate: 0,
      stock: 0,
      lowStockThreshold: 10,
      imageUrl: '',
      sellingPrice: '',
    });
    setProductVariantDrafts([]);
    setShowInlinePriceListForm(false);
    setNewPriceList({ name: '', customerType: 'all' });
    setPricingMessage('');
    try {
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setProductPriceDrafts(Object.fromEntries(lists.map((list: any) => [list.id, ''])));
    } catch (err) {
      setPriceLists([]);
      setProductPriceDrafts({});
      setMessage(err instanceof Error ? err.message : 'Không thể tải bảng giá.');
    }
    setShowCreateProduct(true);
  };

  const addProductLine = (product: Product) => {
    if (product.productType === 'combo') {
      setMessage('Combo chỉ dùng để bán, không nhập trực tiếp.');
      return;
    }
    const unit = product.units?.[0] || { name: product.unit, factor: 1 };
    setLines((previous) => {
      const existing = previous.find((line) => line.productId === product.id);
      if (existing) {
        return previous.map((line) => line.productId === product.id
          ? { ...line, quantity: toNumber(line.quantity) + 1 }
          : line);
      }
      return [...previous, {
        productId: product.id,
        quantity: 1,
        price: product.purchasePrice,
        unitName: unit.name,
        unitFactor: Number(unit.factor) || 1,
      }];
    });
  };

  const lookupBarcode = async (codeOverride?: string) => {
    const code = (codeOverride ?? barcode).trim();
    if (!code) {
      setMessage('Đưa mã vạch vào camera hoặc nhập mã để tra cứu.');
      return;
    }
    try {
      const product = await productsApi.lookup(code) as Product;
      addProductLine(product);
      setBarcode('');
      setShowProductPicker(false);
      setMessage(`Đã thêm ${product.name} vào phiếu nhập.`);
    } catch {
      setBarcode(code);
      setShowProductPicker(false);
      void openCreateProduct(code);
      setMessage(`Chưa có sản phẩm với mã ${code}. Bạn có thể tạo nhanh ngay trong phiếu nhập.`);
    }
  };

  const submit = async () => {
    const normalizedLines = lines.map((line) => ({
      ...line,
      quantity: toNumber(line.quantity),
      price: toNumber(line.price),
      unitFactor: Number(line.unitFactor) || 1,
    }));
    if (!supplierId || !normalizedLines.length) {
      setMessage('Chọn nhà cung cấp và ít nhất một sản phẩm.');
      return;
    }
    if (normalizedLines.some((line) => line.quantity <= 0)) {
      setMessage('Số lượng nhập phải lớn hơn 0.');
      return;
    }
    if (paymentMethod !== 'payable' && toNumber(paidAmount) > 0 && !accountId) {
      setMessage('Chọn tài khoản tiền cho khoản thanh toán.');
      return;
    }
    try {
      await purchasesApi.create({
        documentNo: documentNo.trim() || undefined,
        createdAt: billDate ? new Date(`${billDate}T12:00:00`).toISOString() : undefined,
        note: billNote.trim(),
        supplierId,
        paidAmount: paymentMethod === 'payable' ? 0 : toNumber(paidAmount),
        paymentMethod,
        accountId: paymentMethod === 'payable' ? null : accountId,
        items: normalizedLines,
      });
      setMessage('Đã xác nhận phiếu nhập. Kho, công nợ và sổ quỹ đã cập nhật.');
      setLines([]);
      setPaidAmount('');
      setDocumentNo('');
      setBillNote('');
      setBillDate(new Date().toISOString().slice(0, 10));
      await reload();
      await refreshProducts();
      setPurchaseView('history');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tạo phiếu nhập.');
    }
  };

  const openReturn = async (purchase: any) => {
    try {
      const data = await purchasesApi.returnable(purchase.id);
      setReturnPurchase(data.purchase);
      setReturnLines(data.items.map((item: any) => ({
        purchaseItemId: item.id,
        productName: item.productName,
        unit: item.unit,
        quantity: 0,
        maxQuantity: Math.max(0, Number(item.quantity) - Number(item.returnedQuantity || 0)),
        price: Number(item.price),
      })));
      setReturnNote('');
      setShowReturn(true);
      setMessage('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tải phiếu nhập để trả.');
    }
  };

  const togglePurchaseDetails = async (purchase: any) => {
    if (expandedPurchaseId === purchase.id) {
      setExpandedPurchaseId(null);
      return;
    }
    setExpandedPurchaseId(purchase.id);
    if (purchaseDetails[purchase.id]) return;
    setLoadingPurchaseId(purchase.id);
    try {
      const details = await purchasesApi.get(purchase.id);
      setPurchaseDetails((previous) => ({ ...previous, [purchase.id]: details }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tải chi tiết phiếu nhập.');
    } finally {
      setLoadingPurchaseId(null);
    }
  };

  useEffect(() => {
    const purchaseId = searchParams.get('purchaseId');
    if (!purchaseId || !purchases.length) return;
    const purchase = purchases.find((item) => item.id === purchaseId);
    if (!purchase || expandedPurchaseId === purchaseId) return;
    setPurchaseView('history');
    void togglePurchaseDetails(purchase);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('purchaseId');
    setSearchParams(nextParams, { replace: true });
  }, [expandedPurchaseId, purchases, searchParams, setSearchParams]);

  const selectedReturnTotal = returnLines.reduce((sum, line) => sum + toNumber(line.quantity) * line.price, 0);
  const returnableTotal = returnLines.reduce((sum, line) => sum + line.maxQuantity * line.price, 0);
  const submitReturn = async () => {
    const items = returnLines
      .filter((line) => toNumber(line.quantity) > 0)
      .map((line) => ({ purchaseItemId: line.purchaseItemId, quantity: toNumber(line.quantity) }));
    if (!returnPurchase || !items.length) {
      setMessage('Nhập số lượng trả cho ít nhất một dòng.');
      return;
    }
    try {
      await purchasesApi.createReturn(returnPurchase.id, { items, note: returnNote });
      setShowReturn(false);
      setMessage('Đã tạo phiếu trả nhà cung cấp và cập nhật số dư được nhận.');
      await reload();
      await refreshProducts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tạo phiếu trả.');
    }
  };

  const handleProductImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Vui lòng chọn đúng tệp ảnh.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setNewProduct((previous) => ({ ...previous, imageUrl: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const createPriceList = async () => {
    if (!newPriceList.name.trim()) return;
    try {
      await priceListsApi.create({ name: newPriceList.name.trim(), customerType: newPriceList.customerType, active: true });
      const lists = await priceListsApi.list(true);
      setPriceLists(lists);
      setProductPriceDrafts((previous) => Object.fromEntries(lists.map((list: any) => [list.id, previous[list.id] ?? ''])));
      setNewPriceList({ name: '', customerType: 'all' });
      setPricingMessage('Đã tạo bảng giá. Nhập giá cho sản phẩm ngay bên dưới.');
    } catch (err) {
      setPricingMessage(err instanceof Error ? err.message : 'Không thể tạo bảng giá.');
    }
  };

  const createProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.sku.trim() || !newProduct.category.trim() || !newProduct.unit.trim()) {
      setMessage('Nhập tên, SKU, danh mục và đơn vị tính sản phẩm.');
      return;
    }
    const variants = productVariantDrafts
      .map((variant) => ({ name: variant.name.trim(), factor: Number(variant.factor), barcode: variant.barcode.trim() }))
      .filter((variant) => variant.name);
    if (variants.some((variant) => !Number.isFinite(variant.factor) || variant.factor <= 0)) {
      setMessage('Tỷ suất quy đổi của biến thể phải lớn hơn 0.');
      return;
    }
    if (variants.some((variant) => variant.name.toLowerCase() === newProduct.unit.trim().toLowerCase())) {
      setMessage('Tên biến thể phải khác đơn vị cơ sở.');
      return;
    }
    setCreatingProduct(true);
    try {
      const defaultPriceList = priceLists.find((list: any) => list.isDefault) || priceLists[0];
      const defaultSellingPrice = defaultPriceList ? toNumber(productPriceDrafts[defaultPriceList.id]) : toNumber(newProduct.sellingPrice);
      const product = await productsApi.create({
        ...newProduct,
        purchasePrice: toNumber(newProduct.purchasePrice),
        sellingPrice: defaultSellingPrice,
        taxRate: toNumber(newProduct.taxRate),
        stock: 0,
        lowStockThreshold: toNumber(newProduct.lowStockThreshold),
        productType: 'standard',
        trackStock: true,
        status: 'active',
      }) as Product;
      await productUnitsApi.save(product.id, variants);
      for (const list of priceLists) {
        const basePrice = toNumber(productPriceDrafts[list.id]);
        const rows = [
          { productId: product.id, unitName: newProduct.unit.trim(), unitFactor: 1, price: basePrice },
          ...variants.map((variant) => ({ productId: product.id, unitName: variant.name, unitFactor: variant.factor, price: basePrice * variant.factor })),
        ];
        await priceListsApi.saveItems(list.id, [...(list.items || []), ...rows]);
      }
      await refreshProducts();
      addProductLine(product);
      setShowCreateProduct(false);
      setMessage(`Đã tạo và thêm ${product.name} vào phiếu nhập.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tạo sản phẩm.');
    } finally {
      setCreatingProduct(false);
    }
  };

  const createSupplier = async () => {
    setSupplierFormError('');
    if (!supplierForm.name.trim()) {
      setSupplierFormError('Nhập tên nhà cung cấp.');
      return;
    }
    setCreatingSupplier(true);
    try {
      const supplier = await suppliersApi.create({
        name: supplierForm.name.trim(),
        phone: supplierForm.phone.trim(),
        taxCode: supplierForm.taxCode.trim(),
        address: supplierForm.address.trim(),
      });
      await reload();
      setSupplierId(supplier.id);
      setSupplierForm({ name: '', phone: '', taxCode: '', address: '' });
      setShowCreateSupplier(false);
      setMessage(`Đã tạo và chọn nhà cung cấp ${supplier.name}.`);
    } catch (err) {
      setSupplierFormError(err instanceof Error ? err.message : 'Không thể tạo nhà cung cấp.');
    } finally {
      setCreatingSupplier(false);
    }
  };

  return (
    <div className="erp-compact min-h-full bg-slate-50">
      <AppPageHeader
        icon={ClipboardList}
        accentClassName="bg-sky-600"
        title={purchaseView === 'history' ? 'Lịch sử nhập hàng' : 'Tạo đơn nhập hàng'}
        subtitle={purchaseView === 'history' ? 'Theo dõi các phiếu đã nhập, người nhập và công nợ nhà cung cấp' : 'Tạo phiếu nhập và ghi nhận hàng vào kho'}
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            {purchaseView === 'history' ? (
              <Button className="h-9 text-sm" onClick={() => { setMessage(''); setPurchaseView('create'); }}>
                <Plus className="mr-2 h-4 w-4" />Tạo đơn nhập hàng
              </Button>
            ) : (
              <>
                <Button variant="outline" className="h-9 text-sm" onClick={() => setPurchaseView('history')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Lịch sử nhập hàng
                </Button>
                <Button variant="outline" className="h-9 text-sm" onClick={() => setShowBarcodeScanner(true)}>
                  <Camera className="mr-2 h-4 w-4" />Quét camera
                </Button>
                <Button variant="outline" className="h-9 text-sm" onClick={() => void openCreateProduct()}>
                  <PackagePlus className="mr-2 h-4 w-4" />Tạo mặt hàng
                </Button>
              </>
            )}
          </div>
        )}
      />

      <main className="space-y-3 p-3 md:p-4 lg:p-5">
        {purchaseView === 'history' && message && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}
        {purchaseView === 'create' && (
          <>
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">1</span><div><h2 className="text-sm font-semibold text-slate-900">Thông tin bill</h2><p className="mt-0.5 text-xs text-slate-500">Nhập số bill của nhà cung cấp hoặc để hệ thống tự sinh số phiếu.</p></div></div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-medium text-slate-600">Số bill nhà cung cấp<input className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm" value={documentNo} onChange={(event) => setDocumentNo(event.target.value)} placeholder="Tự sinh nếu để trống" /></label>
            <label className="text-xs font-medium text-slate-600">Ngày bill<input type="date" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></label>
            <label className="text-xs font-medium text-slate-600 md:col-span-1">Ghi chú<textarea className="mt-1 min-h-9 w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={billNote} onChange={(event) => setBillNote(event.target.value)} placeholder="Ghi chú cho bill (không bắt buộc)" /></label>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">2</span><div><h2 className="text-sm font-semibold text-slate-900">Nhà cung cấp</h2><p className="mt-0.5 text-xs text-slate-500">Chọn đơn vị giao bill và theo dõi công nợ phải trả.</p></div></div>{selectedSupplier && <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500">Nợ NCC: <b className="text-slate-700">{formatCurrency(Math.max(0, Number(selectedSupplier.currentPayable || 0)))}</b></span>}</div>
          <div className="flex w-full max-w-2xl flex-wrap items-end gap-2"><div ref={supplierPickerRef} className="relative min-w-0 w-full flex-1 sm:min-w-[260px]"><label className="text-xs font-medium text-slate-600">Nhà cung cấp<Input value={showSupplierPicker ? supplierSearch : (selectedSupplier ? supplierLabel(selectedSupplier) : supplierSearch)} onFocus={() => { setSupplierSearch(''); setShowSupplierPicker(true); }} onChange={(event) => { setSupplierSearch(event.target.value); setSupplierId(''); setShowSupplierPicker(true); }} placeholder="Tìm nhà cung cấp..." className="mt-1 h-9 text-sm" /></label>{showSupplierPicker && <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"><div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Chọn nhà cung cấp</div><div className="max-h-56 overflow-y-auto p-1">{supplierPickerOptions.map((supplier) => <button key={supplier.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-sky-50" onClick={() => { setSupplierId(supplier.id); setSupplierSearch(''); setShowSupplierPicker(false); }}><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{supplier.name}</span><span className="block truncate text-[11px] text-slate-500">{supplier.code} · {supplier.phone || 'Chưa có SĐT'}</span></span><span className="shrink-0 text-xs text-slate-500">{formatCurrency(Math.max(0, Number(supplier.currentPayable || 0)))}</span></button>)}{!supplierPickerOptions.length && <p className="px-2.5 py-4 text-center text-xs text-slate-500">Không tìm thấy nhà cung cấp.</p>}</div></div>}</div><Button type="button" variant="outline" className="h-9 shrink-0 text-xs" onClick={() => { setSupplierFormError(''); setShowCreateSupplier(true); }}><Plus className="mr-1.5 h-3.5 w-3.5" />Tạo nhà cung cấp</Button></div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">3</span><h2 className="text-sm font-semibold text-slate-900">Danh sách sản phẩm</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{lines.length} dòng</span></div>
              <p className="mt-0.5 text-xs text-slate-500">Quét camera sẽ thêm sản phẩm thẳng vào phiếu, không chuyển về ô tìm kiếm.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setShowBarcodeScanner(true)}><Barcode className="mr-1.5 h-3.5 w-3.5" />Quét mã</Button>
              <Button className="h-8 px-2.5 text-xs" onClick={() => void openCreateProduct()}><PackagePlus className="mr-1.5 h-3.5 w-3.5" />Tạo mặt hàng</Button>
            </div>
          </div>

          <div className="border-y border-slate-100 py-2.5">
            <div ref={productPickerRef} className="relative max-w-xl">
              <Input
                value={barcode}
                onFocus={() => setShowProductPicker(true)}
                onChange={(event) => { setBarcode(event.target.value); setShowProductPicker(true); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void lookupBarcode(); } }}
                placeholder="Tìm theo tên, SKU hoặc mã vạch"
                className="h-9 w-full text-sm"
              />
              {showProductPicker && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">Chọn sản phẩm nhập hàng</p>
                    <button type="button" className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setShowProductPicker(false)}>Đóng</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {productPickerOptions.map((product) => {
                      const alreadyInBill = lines.some((line) => line.productId === product.id);
                      return <button key={product.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-sky-50" onClick={() => { addProductLine(product); setBarcode(''); setShowProductPicker(false); }}>
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{product.name}</span><span className="block truncate text-[11px] text-slate-500">{product.sku} · {product.unit}{alreadyInBill ? ' · đã có trong phiếu' : ''}</span></span>
                        <span className="shrink-0 text-xs font-medium text-slate-600">{formatCurrency(product.purchasePrice || 0)}</span>
                      </button>;
                    })}
                    {!productPickerOptions.length && <p className="px-2.5 py-4 text-center text-xs text-slate-500">Không tìm thấy sản phẩm phù hợp.</p>}
                  </div>
                  <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Quét mã camera hoặc nhấn Enter để tra cứu mã chính xác.</div>
                </div>
              )}
            </div>
          </div>

          {!lines.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
              <FilePlus2 className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">Chưa có hàng hóa trong phiếu</p>
              <p className="mt-1 text-xs text-slate-500">Nhập tên, SKU hoặc mã vạch để chọn hàng hóa, hoặc dùng camera để quét mã.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500"><th className="p-2.5">Sản phẩm</th><th className="p-2.5">Đơn vị nhập</th><th className="p-2.5">SL</th><th className="p-2.5">Đơn giá nhập</th><th className="p-2.5 text-right">Thành tiền</th><th className="w-10" /></tr></thead>
                <tbody>
                  {lines.map((line, index) => {
                    const product = products.find((item) => item.id === line.productId);
                    const units = product?.units?.length ? product.units : [{ name: product?.unit || '', factor: 1 }];
                    return (
                      <tr key={`${line.productId}-${index}`} className="border-b border-slate-100 last:border-0">
                        <td className="p-2"><select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" value={line.productId} onChange={(event) => { const next = products.find((item) => item.id === event.target.value); if (!next) return; const unit = next.units?.[0] || { name: next.unit, factor: 1 }; setLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, productId: next.id, price: next.purchasePrice, unitName: unit.name, unitFactor: Number(unit.factor) || 1 } : row)); }}>{standardProducts.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></td>
                        <td className="p-2"><select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={line.unitName} onChange={(event) => { const unit = units.find((item: any) => item.name === event.target.value); setLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, unitName: event.target.value, unitFactor: Number(unit?.factor || 1) } : row)); }}>{units.map((unit: any) => <option key={unit.name} value={unit.name}>{unit.name} · ×{unit.factor}</option>)}</select></td>
                        <td className="p-2"><input className="h-9 w-20 rounded-md border border-slate-200 px-2 text-sm" type="number" min="0.01" value={line.quantity} onChange={(event) => setLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} /></td>
                        <td className="p-2"><input className="h-9 w-32 rounded-md border border-slate-200 px-2 text-sm" type="number" min="0" value={line.price} onChange={(event) => setLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row))} /></td>
                        <td className="p-2 text-right font-medium text-slate-700">{formatCurrency(toNumber(line.quantity) * toNumber(line.price))}</td>
                        <td className="p-2"><button className="rounded-md p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Xóa dòng hàng" onClick={() => setLines((previous) => previous.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">4</span><div><h2 className="text-sm font-semibold text-slate-900">Số tiền & thanh toán</h2><p className="mt-0.5 text-xs text-slate-500">Kiểm tra tổng tiền bill, chọn thanh toán ngay hoặc ghi công nợ.</p></div></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5"><p className="text-xs font-medium text-sky-700">Tổng tiền hàng</p><p className="mt-1 text-lg font-semibold tabular-nums text-sky-800">{formatCurrency(total)}</p><p className="mt-0.5 text-[11px] text-sky-700/80">Tự tính từ danh sách sản phẩm</p></div>
            <label className="text-xs font-medium text-slate-600">Hình thức thanh toán<select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm" value={paymentMethod} onChange={(event) => { const next = event.target.value as 'cash' | 'transfer' | 'payable'; setPaymentMethod(next); if (next === 'payable') { setPaidAmount(''); setAccountId(''); } }}><option value="payable">Công nợ</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></label>
            <label className="text-xs font-medium text-slate-600">Đã trả<input type="number" min="0" max={total > 0 ? total : undefined} step="0.01" inputMode="decimal" placeholder={paymentMethod === 'payable' ? 'Chọn hình thức thanh toán' : 'Nhập số tiền đã trả'} className={`mt-1 h-9 w-full rounded-md border px-2.5 text-sm ${paymentMethod === 'payable' ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 placeholder:text-slate-400' : 'border-slate-200 bg-white text-slate-900'}`} value={paidAmount} disabled={paymentMethod === 'payable'} onChange={(event) => setPaidAmount(event.target.value)} /><span className="mt-1 block text-[11px] font-normal text-slate-400">{paymentMethod === 'payable' ? 'Chọn Tiền mặt hoặc Chuyển khoản để nhập.' : 'Có thể nhập số tiền thanh toán một phần.'}</span></label>
            <label className="text-xs font-medium text-slate-600">Tài khoản chi<select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400" value={accountId} disabled={paymentMethod === 'payable'} onChange={(event) => setAccountId(event.target.value)}><option value="">{paymentMethod === 'payable' ? 'Không áp dụng' : 'Chọn tài khoản'}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-400">{paymentMethod === 'payable' ? 'Không cần chọn khi ghi công nợ.' : 'Chọn nơi ghi nhận khoản chi.'}</span></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Tồn kho sẽ tăng theo hệ số quy đổi về đơn vị cơ sở.</p><Button disabled={!lines.length} onClick={() => void submit()}><Save className="mr-2 h-4 w-4" />Xác nhận nhập hàng</Button></div>
          {message && <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}
        </section>

          </>
        )}

        {purchaseView === 'history' && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3"><p className="text-xs font-medium text-sky-700">Tổng số phiếu</p><p className="mt-1 text-lg font-semibold tabular-nums text-sky-800">{purchases.length}</p><p className="mt-0.5 text-[11px] text-sky-700/80">Phiếu nhập hàng đã ghi nhận</p></div>
              <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-medium text-slate-500">Tổng giá trị nhập</p><p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(purchaseHistorySummary.total)}</p><p className="mt-0.5 text-[11px] text-slate-500">Theo giá trị trên phiếu</p></div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3"><p className="text-xs font-medium text-amber-700">Còn phải trả</p><p className="mt-1 text-lg font-semibold tabular-nums text-amber-800">{formatCurrency(purchaseHistorySummary.payable)}</p><p className="mt-0.5 text-[11px] text-amber-700/80">Công nợ nhà cung cấp</p></div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3"><p className="text-xs font-medium text-emerald-700">Đã trả hàng</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800">{formatCurrency(purchaseHistorySummary.returned)}</p><p className="mt-0.5 text-[11px] text-emerald-700/80">Giá trị phiếu trả đã ghi nhận</p></div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-3 py-3 md:px-4">
                <div><h2 className="text-sm font-semibold text-slate-900">Danh sách phiếu nhập</h2><p className="mt-0.5 text-xs text-slate-500">Chọn một phiếu để xem chi tiết sản phẩm, người nhập và thanh toán.</p></div>
                <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} placeholder="Tìm số phiếu, NCC, người nhập..." className="h-9 pl-8 text-xs" /></div>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredPurchases.map((purchase) => {
                  const returnedAmount = returnedAmountByPurchase[purchase.id] || 0;
                  const detail = purchaseDetails[purchase.id];
                  const isExpanded = expandedPurchaseId === purchase.id;
                  const supplierName = purchase.supplier?.name || suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name || 'Nhà cung cấp';
                  return (
                    <div key={purchase.id} className="transition-colors hover:bg-slate-50/70">
                      <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_150px_auto] md:items-center md:px-4">
                        <div className="min-w-0">
                          <button type="button" onClick={() => void togglePurchaseDetails(purchase)} className="flex min-w-0 items-start gap-2 text-left">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700"><ClipboardList className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900">{purchase.documentNo || purchase.id.slice(0, 8)}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${purchase.payableAmount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{purchase.payableAmount > 0 ? 'Còn nợ' : 'Đã thanh toán'}</span></span></span>
                          </button>
                          <button type="button" className="ml-10 mt-0.5 block max-w-[calc(100%-2.5rem)] truncate text-left text-xs text-slate-600 hover:text-sky-700 hover:underline" onClick={() => purchase.supplierId && navigate(`/app/suppliers/${purchase.supplierId}`)}>{supplierName}</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 md:block"><p><span className="text-slate-400">Ngày nhập:</span> {new Date(purchase.createdAt).toLocaleString('vi-VN')}</p><p className="mt-1"><span className="text-slate-400">Người nhập:</span> {purchase.createdByName || 'Chưa xác định'}</p></div>
                        <div className="text-left md:text-right"><p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(purchase.finalAmount)}</p><p className="mt-0.5 text-[11px] text-slate-500">{purchase.itemCount ?? '—'} sản phẩm · SL {purchase.totalQuantity ?? '—'}</p></div>
                        <div className="flex items-center justify-between gap-2 md:justify-end"><Button variant="outline" className="h-8 px-2.5 text-xs" onClick={() => void openReturn(purchase)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Trả hàng</Button><button type="button" aria-label={isExpanded ? 'Thu gọn chi tiết phiếu' : 'Xem chi tiết phiếu'} onClick={() => void togglePurchaseDetails(purchase)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100"><ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></button></div>
                      </div>
                      {isExpanded && <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-3 md:px-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]"><div><p className="mb-2 text-xs font-semibold text-slate-700">Chi tiết sản phẩm</p>{loadingPurchaseId === purchase.id ? <p className="text-xs text-slate-500">Đang tải chi tiết...</p> : detail?.items?.length ? <div className="overflow-hidden rounded-md border border-slate-200 bg-white"><div className="grid grid-cols-[minmax(0,1fr)_80px_110px] gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] font-medium text-slate-500"><span>Sản phẩm</span><span className="text-right">Số lượng</span><span className="text-right">Thành tiền</span></div>{detail.items.map((item: any) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_80px_110px] gap-2 border-b border-slate-100 px-2.5 py-2 text-xs last:border-0"><button type="button" className="truncate text-left text-slate-700 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{item.productName}<span className="ml-1 text-[11px] text-slate-400">· {item.unit}</span></button><span className="text-right tabular-nums text-slate-600">{item.quantity}</span><span className="text-right font-medium tabular-nums text-slate-700">{formatCurrency(item.total)}</span></div>)}</div> : <p className="text-xs text-slate-500">Chưa có chi tiết sản phẩm.</p>}</div><div className="rounded-md border border-slate-200 bg-white p-3 text-xs"><p className="font-semibold text-slate-700">Tổng quan thanh toán</p><div className="mt-2 space-y-1.5"><div className="flex justify-between gap-2"><span className="text-slate-500">Đã trả</span><b className="tabular-nums text-emerald-700">{formatCurrency(purchase.paidAmount)}</b></div><div className="flex justify-between gap-2"><span className="text-slate-500">Còn nợ</span><b className="tabular-nums text-amber-700">{formatCurrency(purchase.payableAmount)}</b></div><div className="flex justify-between gap-2"><span className="text-slate-500">Trả hàng</span><b className="tabular-nums text-slate-700">{formatCurrency(returnedAmount)}</b></div><div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5"><span className="text-slate-500">Hình thức</span><b className="text-slate-700">{purchase.paymentMethod === 'payable' ? 'Công nợ' : purchase.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}</b></div></div></div></div></div>}
                    </div>
                  );
                })}
                {!filteredPurchases.length && <div className="px-4 py-12 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Chưa có phiếu nhập phù hợp</p><p className="mt-1 text-xs text-slate-500">Tạo đơn nhập hàng đầu tiên để bắt đầu theo dõi lịch sử.</p></div>}
              </div>
            </section>
          </>
        )}
      </main>

      <BarcodeScannerModal open={showBarcodeScanner} title="Quét mã nhập hàng" description="Đưa mã vạch vào khung. Khi nhận diện được, sản phẩm sẽ được thêm trực tiếp vào phiếu nhập." onClose={() => setShowBarcodeScanner(false)} onDetected={(code) => { void lookupBarcode(code); }} />
      <BarcodeScannerModal
        open={showNewProductBarcodeScanner}
        title="Quét mã vạch mặt hàng"
        description="Quét mã cho sản phẩm hoặc biến thể đang tạo."
        onClose={() => { setShowNewProductBarcodeScanner(false); setNewProductVariantBarcodeIndex(null); }}
        onDetected={(code) => {
          if (newProductVariantBarcodeIndex !== null) {
            setProductVariantDrafts((previous) => previous.map((row, index) => index === newProductVariantBarcodeIndex ? { ...row, barcode: code } : row));
          } else {
            setNewProduct((previous) => ({ ...previous, barcode: code }));
          }
          setShowNewProductBarcodeScanner(false);
          setNewProductVariantBarcodeIndex(null);
        }}
      />

      {showCreateProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
          <div className="flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900 sm:text-base">Tạo hàng hóa mới</h2><p className="mt-0.5 text-[11px] text-slate-500">Biểu mẫu giống Hàng hóa · lưu xong tự thêm vào phiếu nhập.</p></div><button aria-label="Đóng" onClick={() => setShowCreateProduct(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <div className="space-y-1"><label className="text-[11px] font-semibold text-slate-500">Hình ảnh sản phẩm</label><div className="relative flex h-28 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-200 bg-slate-50"><input type="file" accept="image/*" onChange={handleProductImageUpload} className="absolute inset-0 cursor-pointer opacity-0" />{newProduct.imageUrl ? <img src={newProduct.imageUrl} alt="Xem trước sản phẩm" className="h-full w-full object-cover" /> : <><Camera className="h-6 w-6 text-slate-300" /><span className="mt-1 text-[11px] text-slate-500">Tải ảnh lên</span></>}</div></div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-[11px] font-semibold text-slate-500 md:col-span-2">Tên sản phẩm<Input autoFocus value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="Ví dụ: Nước ngọt Coca" className="h-9 text-sm" /></label>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-500">Mã SKU<div className="relative"><Tag className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" /><Input value={newProduct.sku} onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })} className="h-9 pl-8 text-sm" /></div></label>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-500">Mã vạch<div className="relative"><Barcode className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" /><Input value={newProduct.barcode} onChange={(event) => setNewProduct({ ...newProduct, barcode: event.target.value })} placeholder="EAN/UPC/Code128" className="h-9 pl-8 pr-9 text-sm" /><button type="button" aria-label="Quét mã vạch sản phẩm" title="Quét mã vạch sản phẩm" onClick={() => { setNewProductVariantBarcodeIndex(null); setShowNewProductBarcodeScanner(true); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-sky-700"><Barcode className="h-3.5 w-3.5" /></button></div></label>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1 text-[11px] font-semibold text-slate-500">Danh mục<select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm" value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}{!categories.some((category) => category.name === 'Tạp hóa') && <option value="Tạp hóa">Tạp hóa</option>}</select></label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-500">Loại hàng hóa<select className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-600" value="standard" disabled><option value="standard">Sản phẩm thường</option></select><span className="block text-[10px] font-normal text-slate-500">Combo chỉ tạo trong Hàng hóa, không nhập trực tiếp.</span></label>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="space-y-1 text-[11px] font-semibold text-slate-500">Đơn vị tính<Input value={newProduct.unit} onChange={(event) => setNewProduct({ ...newProduct, unit: event.target.value })} placeholder="Cái" className="h-9 text-sm" /></label>
                <label className="space-y-1 text-[11px] font-semibold text-slate-500">Giá nhập<Input type="number" min="0" value={newProduct.purchasePrice} onChange={(event) => setNewProduct({ ...newProduct, purchasePrice: event.target.value })} className="h-9 text-sm" /></label>
                <label className="space-y-1 text-[11px] font-semibold text-slate-500">Thuế suất (%)<Input type="number" min="0" max="100" value={newProduct.taxRate} onChange={(event) => setNewProduct({ ...newProduct, taxRate: event.target.value })} className="h-9 text-sm" /></label>
              </div>

              <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">Giá bán theo bảng giá</h3><p className="mt-0.5 text-[11px] text-slate-500">Nhập giá tại đơn vị cơ sở <b>{newProduct.unit || '—'}</b>. Giá biến thể tự tính theo hệ số.</p></div><button type="button" onClick={() => setShowInlinePriceListForm((visible) => !visible)} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-700">{showInlinePriceListForm ? 'Đóng' : '+ Tạo bảng giá'}</button></div>
                {showInlinePriceListForm && <div className="grid gap-2 rounded-md border border-sky-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"><Input autoFocus value={newPriceList.name} onChange={(event) => setNewPriceList({ ...newPriceList, name: event.target.value })} placeholder="Ví dụ: Giá cơ quan" className="h-9 text-xs" /><select value={newPriceList.customerType} onChange={(event) => setNewPriceList({ ...newPriceList, customerType: event.target.value })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option></select><Button type="button" className="h-9 px-3 text-xs" disabled={!newPriceList.name.trim()} onClick={() => void createPriceList()}>Tạo bảng</Button></div>}
                {!priceLists.length && <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Chưa có bảng giá. Hãy tạo một bảng giá để nhập giá bán cho mặt hàng.</p>}
                <div className="grid gap-2 md:grid-cols-2">{priceLists.map((list: any) => <label key={list.id} className="rounded-md border border-white bg-white p-2 text-[11px] font-semibold text-slate-700">{list.name}{list.isDefault && <span className="ml-1 font-normal text-emerald-600">· Mặc định</span>}<div className="relative mt-1"><Input type="number" min="0" value={productPriceDrafts[list.id] ?? ''} onChange={(event) => setProductPriceDrafts((previous) => ({ ...previous, [list.id]: event.target.value }))} className="h-9 pr-8 text-sm" /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">đ</span></div></label>)}</div>
                {pricingMessage && <p className="text-[11px] text-emerald-700">{pricingMessage}</p>}
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">Biến thể đơn vị bán</h3><p className="mt-0.5 text-[11px] text-slate-500">Đơn vị cơ sở: <b>{newProduct.unit || '—'}</b> ×1. Ví dụ: 1 Hộp = 20 Cây.</p></div><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setProductVariantDrafts((previous) => [...previous, { name: '', factor: 1, barcode: '' }])}><Plus className="mr-1 h-3 w-3" />Thêm biến thể</Button></div>
                {!productVariantDrafts.length && <p className="rounded-md bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">Chưa có biến thể. Sản phẩm sẽ bán theo {newProduct.unit || 'đơn vị cơ sở'}.</p>}
                <div className="space-y-1.5">{productVariantDrafts.map((variant, index) => <div key={`variant-row-${index}`} className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]"><Input value={variant.name} placeholder="Tên biến thể, ví dụ Hộp" onChange={(event) => setProductVariantDrafts((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} className="h-9 text-xs" /><div className="relative"><Input type="text" inputMode="decimal" value={variant.factor} onChange={(event) => setProductVariantDrafts((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, factor: event.target.value.replace(',', '.') } : row))} className="h-9 pr-10 text-xs" placeholder="1" aria-label={`Hệ số quy đổi biến thể ${index + 1}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">× cơ sở</span></div><div className="relative"><Barcode className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" /><Input value={variant.barcode} placeholder="Mã vạch riêng (nếu có)" onChange={(event) => setProductVariantDrafts((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, barcode: event.target.value } : row))} className="h-9 pl-8 pr-9 text-xs" /><button type="button" aria-label="Quét mã vạch biến thể" title="Quét mã vạch biến thể" onClick={() => { setNewProductVariantBarcodeIndex(index); setShowNewProductBarcodeScanner(true); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-sky-700"><Barcode className="h-3.5 w-3.5" /></button></div><button type="button" aria-label="Xóa biến thể" onClick={() => setProductVariantDrafts((previous) => previous.filter((_, rowIndex) => rowIndex !== index))} className="flex h-9 items-center justify-center text-rose-500"><Trash2 className="h-4 w-4" /></button></div>)}</div>
              </div>

              <div className="grid gap-2 md:grid-cols-2"><label className="space-y-1 text-[11px] font-semibold text-slate-500">Số lượng tồn kho ban đầu<input type="number" value={newProduct.stock} disabled className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-500" /><span className="block text-[10px] font-normal text-slate-500">Tồn sẽ tăng từ số lượng của phiếu nhập này.</span></label><label className="space-y-1 text-[11px] font-semibold text-slate-500">Ngưỡng cảnh báo tồn<input type="number" min="0" value={newProduct.lowStockThreshold} onChange={(event) => setNewProduct({ ...newProduct, lowStockThreshold: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm" /></label></div>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-4 py-3"><Button disabled={creatingProduct} onClick={() => void createProduct()} className="h-10 w-full"><Check className="mr-2 h-4 w-4" />{creatingProduct ? 'Đang tạo...' : 'Tạo và thêm vào phiếu'}</Button></div>
          </div>
        </div>
      )}

      {showCreateSupplier && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center bg-slate-900/60 p-3 pt-16 sm:p-4 sm:pt-20">
          <form onSubmit={(event) => { event.preventDefault(); void createSupplier(); }} className="max-h-[calc(100dvh-5rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 className="text-sm font-semibold text-slate-900">Tạo nhà cung cấp</h2><p className="mt-0.5 text-xs text-slate-500">Thông tin được đồng bộ với mục Nhà cung cấp.</p></div><button type="button" aria-label="Đóng" onClick={() => setShowCreateSupplier(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Tên nhà cung cấp<Input autoFocus value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="Ví dụ: Công ty ABC" className="mt-1 h-9 text-sm" /></label><label className="text-xs font-medium text-slate-600">Số điện thoại<Input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} placeholder="Không bắt buộc" className="mt-1 h-9 text-sm" /></label><label className="text-xs font-medium text-slate-600">Mã số thuế<Input value={supplierForm.taxCode} onChange={(event) => setSupplierForm({ ...supplierForm, taxCode: event.target.value })} placeholder="Không bắt buộc" className="mt-1 h-9 text-sm" /></label><label className="text-xs font-medium text-slate-600">Địa chỉ<Input value={supplierForm.address} onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })} placeholder="Không bắt buộc" className="mt-1 h-9 text-sm" /></label></div>
            {supplierFormError && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{supplierFormError}</p>}
            <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowCreateSupplier(false)}>Hủy</Button><Button type="submit" disabled={creatingSupplier}><Check className="mr-2 h-4 w-4" />{creatingSupplier ? 'Đang lưu...' : 'Lưu nhà cung cấp'}</Button></div>
          </form>
        </div>
      )}

      {showReturn && returnPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-base font-semibold text-slate-900">Trả hàng nhà cung cấp</h2><p className="mt-0.5 text-xs text-slate-500">Phiếu {returnPurchase.documentNo || returnPurchase.id.slice(0, 8)} · Chỉ trả được phần còn lại và không vượt tồn kho.</p></div><button aria-label="Đóng" onClick={() => setShowReturn(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/70 p-3 text-xs"><div><p className="text-slate-500">Có thể trả</p><b className="mt-1 block text-slate-800">{formatCurrency(returnableTotal)}</b></div><div><p className="text-slate-500">Đang chọn trả</p><b className="mt-1 block text-indigo-600">{formatCurrency(selectedReturnTotal)}</b></div><div><p className="text-slate-500">Cách xử lý</p><b className="mt-1 block text-slate-800">Giảm nợ / tạo số dư</b></div></div>
            <div className="space-y-2 overflow-y-auto p-4">
              {returnLines.map((line, index) => <div key={line.purchaseItemId} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-[1fr_110px_110px]"><div><p className="text-sm font-medium text-slate-800">{line.productName}</p><p className="mt-0.5 text-xs text-slate-500">{line.unit} · tối đa {line.maxQuantity}{line.maxQuantity <= 0 ? ' · đã trả hết' : ''}</p></div><Input type="number" min="0" max={line.maxQuantity} value={line.quantity} disabled={line.maxQuantity <= 0} onChange={(event) => setReturnLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value === '' ? '' : Math.min(row.maxQuantity, Number(event.target.value) || 0) } : row))} className="h-9 w-full text-sm" /><span className="text-right text-sm font-medium text-slate-700">{formatCurrency(toNumber(line.quantity) * line.price)}</span></div>)}
              <Input value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="Ghi chú trả hàng (tuỳ chọn)" className="h-9 text-sm" />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3"><Button variant="outline" onClick={() => setShowReturn(false)}>Hủy</Button><Button disabled={!returnLines.some((line) => toNumber(line.quantity) > 0)} onClick={() => void submitReturn()}><RotateCcw className="mr-2 h-4 w-4" />Xác nhận trả hàng</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
