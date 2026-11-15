import { useState, useMemo, useRef, useEffect, type UIEvent } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Customer, PaymentMethod, InvoiceItem, Invoice } from '../types';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Search, X, ShoppingCart, Wallet, TrendingUp, Package, ChevronLeft, ChevronRight, AlertCircle, MapPin, Phone, User, UserPlus, ScanLine, Camera, SlidersHorizontal, MessageSquare, Tag, Plus, ClipboardList } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { v4 as uuid } from 'uuid';
import { cashAccountsApi, priceListsApi, productsApi } from '../lib/api';
import { applyPriceListAdjustment } from '../lib/priceLists';
import { createProductScanIndex, findProductInScanIndex } from '../lib/productScanIndex';
import { printViaBridge } from '../lib/printBridge';

// Components
import { POSCartItem } from '../components/pos/POSCartItem';
import { POSInvoiceModal } from '../components/pos/POSInvoiceModal';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';

type DiscountMode = 'percent' | 'amount';
type CartLine = InvoiceItem & { maxStock: number };
type SaleUnit = { name: string; factor: number; sku?: string | null; barcode?: string | null };
type OrderDraft = {
  id: string;
  name: string;
  cart: CartLine[];
  customerId: string | null;
  paymentMethod: PaymentMethod;
  orderNote: string;
  orderDiscountType: 'percent' | 'amount';
  orderDiscountValue: number;
  createdAt: string;
};

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

const accountTypeForPayment = (paymentMethod: PaymentMethod) => (
  paymentMethod === 'transfer' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash'
);

const POS_CATALOG_PAGE_SIZE = 500;

export default function POS() {
  const { products: loadedProducts, customers, activeTenant, currentUser, addInvoice, addCustomer, categories: appCategories } = useApp();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showOrderContext, setShowOrderContext] = useState(false);
  const [showMobileOrderNote, setShowMobileOrderNote] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [mobileSortKey, setMobileSortKey] = useState<'default' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'name_asc'>('default');
  const [mobileStockFilter, setMobileStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [orderDiscountValue, setOrderDiscountValue] = useState(0);
  const [actualPaymentAmount, setActualPaymentAmount] = useState<number | string>(0);
  const [drafts, setDrafts] = useState<OrderDraft[]>([]);
  const [activeOrderTab, setActiveOrderTab] = useState<'live' | string>('live');
  const [step, setStep] = useState<'cart' | 'payment' | 'success'>('cart');
  const [lastInvoiceId, setLastInvoiceId] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<InvoiceItem[]>([]);
  const [formError, setFormError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);
  const [cartPulse, setCartPulse] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [scanHint, setScanHint] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileProductPickerOpen, setMobileProductPickerOpen] = useState(false);
  const [showOrderItemsSheet, setShowOrderItemsSheet] = useState(false);
  const [showDraftsSheet, setShowDraftsSheet] = useState(false);
  const isCashier = currentUser?.role === 'cashier';

  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [remoteProductResults, setRemoteProductResults] = useState<Product[]>([]);
  const catalogOffsetRef = useRef(0);
  const catalogLoadingRef = useRef(false);

  const products = useMemo(() => {
    const byId = new Map<string, Product>();
    [...loadedProducts, ...catalogProducts, ...remoteProductResults].forEach((product) => byId.set(product.id, product));
    return Array.from(byId.values());
  }, [loadedProducts, catalogProducts, remoteProductResults]);

  useEffect(() => {
    let active = true;
    catalogOffsetRef.current = 0;
    catalogLoadingRef.current = true;
    setCatalogProducts([]);
    setCatalogTotal(0);
    setCatalogError('');
    setCatalogLoading(true);

    if (!activeTenant?.id) {
      catalogLoadingRef.current = false;
      setCatalogLoading(false);
      return () => { active = false; };
    }

    productsApi.listPage(activeTenant.id, {
      category: selectedCategory === 'All' ? undefined : selectedCategory,
      productType: 'all',
      limit: POS_CATALOG_PAGE_SIZE,
      offset: 0,
    }).then((result) => {
      if (!active) return;
      const items = result.items as Product[];
      setCatalogProducts(items);
      setCatalogTotal(Number(result.total) || items.length);
      catalogOffsetRef.current = items.length;
      setCatalogError('');
    }).catch(() => {
      if (!active) return;
      setCatalogProducts([]);
      setCatalogTotal(0);
      setCatalogError('Không tải được danh sách hàng hóa. Bạn vẫn có thể tìm theo tên, SKU hoặc mã vạch.');
    }).finally(() => {
      if (!active) return;
      catalogLoadingRef.current = false;
      setCatalogLoading(false);
    });

    return () => {
      active = false;
      catalogLoadingRef.current = false;
    };
  }, [activeTenant?.id, selectedCategory]);

  const loadMoreCatalogProducts = async () => {
    if (!activeTenant?.id || catalogLoadingRef.current || catalogOffsetRef.current >= catalogTotal) return;
    catalogLoadingRef.current = true;
    setCatalogLoading(true);
    try {
      const result = await productsApi.listPage(activeTenant.id, {
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        productType: 'all',
        limit: POS_CATALOG_PAGE_SIZE,
        offset: catalogOffsetRef.current,
      });
      const items = result.items as Product[];
      setCatalogProducts((previous) => {
        const byId = new Map(previous.map((product) => [product.id, product]));
        items.forEach((product) => byId.set(product.id, product));
        return Array.from(byId.values());
      });
      catalogOffsetRef.current += items.length;
      setCatalogTotal(Number(result.total) || catalogOffsetRef.current);
      setCatalogError('');
    } catch {
      setCatalogError('Không tải thêm được danh sách hàng hóa. Hãy thử cuộn lại sau ít giây.');
    } finally {
      catalogLoadingRef.current = false;
      setCatalogLoading(false);
    }
  };

  const handleProductListScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 360) {
      void loadMoreCatalogProducts();
    }
  };

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setRemoteProductResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await productsApi.listPage(activeTenant?.id, { search: query, limit: POS_CATALOG_PAGE_SIZE, offset: 0 });
        if (active) setRemoteProductResults(result.items as Product[]);
      } catch {
        if (active) setRemoteProductResults([]);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeTenant?.id, searchTerm]);

  const priceProductIds = useMemo(
    () => Array.from(new Set([...loadedProducts, ...catalogProducts, ...remoteProductResults].map((product) => product.id))),
    [loadedProducts, catalogProducts, remoteProductResults]
  );

  useEffect(() => {
    if (!priceProductIds.length) return;
    let active = true;
    priceListsApi.list(true, priceProductIds).then((lists) => {
      if (!active) return;
      setPriceLists((previous) => lists.map((list: any) => {
        const previousItems = previous.find((item: any) => item.id === list.id)?.items || [];
        const fetchedIds = new Set((list.items || []).map((item: any) => item.productId));
        return { ...list, items: [...previousItems.filter((item: any) => !fetchedIds.has(item.productId)), ...(list.items || [])] };
      }));
      const defaultList = lists.find((list: any) => list.isDefault) || lists[0];
      setSelectedPriceListId((current) => current || defaultList?.id || '');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [priceProductIds]);

  useEffect(() => {
    cashAccountsApi.list().then((accounts) => {
      setCashAccounts(accounts);
      setSelectedAccountId((current) => current || accounts.find((account: any) => account.type === 'cash')?.id || accounts[0]?.id || '');
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (paymentMethod === 'debt') {
      setSelectedAccountId('');
      return;
    }
    const expectedType = accountTypeForPayment(paymentMethod);
    const selected = cashAccounts.find((account: any) => account.id === selectedAccountId);
    if (selected?.type === expectedType) return;
    setSelectedAccountId(cashAccounts.find((account: any) => account.type === expectedType)?.id || '');
  }, [cashAccounts, paymentMethod, selectedAccountId]);

  useEffect(() => {
    const matching = priceLists.find((list: any) => list.customerType === selectedCustomer?.type) || priceLists.find((list: any) => list.isDefault) || priceLists[0];
    if (matching) setSelectedPriceListId(matching.id);
  }, [selectedCustomer?.type, priceLists]);

  const productUnits = (product: Product): SaleUnit[] => product.units?.length ? product.units : [{ name: product.unit, factor: 1, sku: product.sku, barcode: product.barcode }];

  // Scanning must stay fast even when the tenant has a large catalog. Build
  // the exact-code index once instead of normalizing every product on each
  // scan (which is noticeably slow with tens of thousands of SKUs).
  const scanCodeIndex = useMemo(() => createProductScanIndex(products), [products]);

  const resolvePrice = (product: Product, unitName = product.unit, unitFactor = 1, seen = new Set<string>()): number => {
    if (product.productType === 'combo') {
      if (seen.has(product.id)) return 0;
      return (product.components || []).reduce((sum, component: any) => {
        const componentProduct = products.find((item) => item.id === component.componentProductId);
        return sum + (componentProduct ? Number(component.quantity) * resolvePrice(componentProduct, componentProduct.unit, 1, new Set([...seen, product.id])) : 0);
      }, 0) * unitFactor;
    }
    const list = priceLists.find((item: any) => item.id === selectedPriceListId);
    const item = list?.items?.find((row: any) => row.productId === product.id && row.unitName === unitName);
    if (item) return Number(item.price);
    const baseItem = list?.items?.find((row: any) => row.productId === product.id && row.unitName === product.unit);
    const basePrice = baseItem ? Number(baseItem.price) : Number(product.sellingPrice);
    const adjustedBasePrice = baseItem || !list ? basePrice : applyPriceListAdjustment(basePrice, list);
    return adjustedBasePrice * unitFactor;
  };

  const displayPrice = (product: Product) => resolvePrice(product, product.unit, 1);
  const maxQuantityForUnit = (product: Product, factor: number) => {
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return Math.max(0, Math.floor(Number(product.availableStock ?? product.stock) / safeFactor));
  };
  const lineDiscountValue = (item: Pick<CartLine, 'discountMode' | 'discountAmount' | 'discountPercent'>) => (
    item.discountMode === 'amount' ? Number(item.discountAmount) || 0 : Number(item.discountPercent) || 0
  );

  const totalForLine = (price: number, quantity: number, discountValue = 0, discountMode: DiscountMode = 'percent') => {
    const rawTotal = price * quantity;
    const discount = discountMode === 'amount'
      ? Math.min(rawTotal, Math.max(0, Number(discountValue) || 0))
      : (rawTotal * Math.min(100, Math.max(0, Number(discountValue) || 0))) / 100;
    return Math.max(0, rawTotal - discount);
  };

  useEffect(() => {
    const list = priceLists.find((item: any) => item.id === selectedPriceListId);
    setCart((prev) => prev.map((item) => {
      const product = products.find((row) => row.id === item.productId);
      if (!product) return item;
      const price = resolvePrice(product, item.unitName || product.unit, Number(item.unitFactor) || 1);
      return {
        ...item,
        price,
        priceListId: selectedPriceListId || undefined,
        priceListName: list?.name,
        maxStock: maxQuantityForUnit(product, Number(item.unitFactor) || 1),
        total: totalForLine(price, item.quantity, lineDiscountValue(item), item.discountMode),
      };
    }));
  }, [selectedPriceListId, priceLists, products]);

  const invoiceRef = useRef<HTMLDivElement>(null);
  const scannerBufferRef = useRef('');
  const scannerLastKeyTimeRef = useRef(0);
  const addedPulseTimerRef = useRef<number | null>(null);
  const cartPulseTimerRef = useRef<number | null>(null);
  const draftStorageKey = activeTenant?.id ? `hkdplus_pos_drafts_${activeTenant.id}` : 'hkdplus_pos_drafts';

  useEffect(() => {
    return () => {
      if (addedPulseTimerRef.current) window.clearTimeout(addedPulseTimerRef.current);
      if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) setDrafts(JSON.parse(raw));
      else setDrafts([]);
    } catch {
      setDrafts([]);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
  }, [draftStorageKey, drafts]);

  const categories = useMemo(() => {
    return ['All', ...appCategories.map(c => c.name)];
  }, [appCategories]);

  const filteredProducts = useMemo(() => {
    const keyword = normalizeSearchText(searchTerm);
    return products.filter(p => {
      const matchSearch =
        !keyword ||
        normalizeSearchText(p.name).includes(keyword) ||
        normalizeSearchText(p.sku).includes(keyword) ||
        normalizeSearchText(p.barcode).includes(keyword) ||
        productUnits(p).some((unit) => normalizeSearchText(unit.barcode).includes(keyword) || normalizeSearchText(unit.sku).includes(keyword));
      const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const mobileVisibleProducts = useMemo(() => {
    const rows = filteredProducts.filter((p) => {
      if (mobileStockFilter === 'all') return true;
      if (mobileStockFilter === 'in_stock') return p.stock > p.lowStockThreshold;
      if (mobileStockFilter === 'low_stock') return p.stock > 0 && p.stock <= p.lowStockThreshold;
      return p.stock <= 0;
    });

    switch (mobileSortKey) {
      case 'price_asc':
        rows.sort((a, b) => displayPrice(a) - displayPrice(b));
        break;
      case 'price_desc':
        rows.sort((a, b) => displayPrice(b) - displayPrice(a));
        break;
      case 'stock_asc':
        rows.sort((a, b) => a.stock - b.stock);
        break;
      case 'stock_desc':
        rows.sort((a, b) => b.stock - a.stock);
        break;
      case 'name_asc':
        rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        break;
      default:
        break;
    }
    return rows;
  }, [filteredProducts, mobileSortKey, mobileStockFilter, priceLists, selectedPriceListId]);

  const filteredCustomers = useMemo(() => {
    const query = normalizeSearchText(customerSearchTerm);
    return customers.filter(c => !query || normalizeSearchText(c.name).includes(query) || normalizeSearchText(c.phone).includes(query)).slice(0, 5);
  }, [customers, customerSearchTerm]);

  const inventorySummary = useMemo(() => {
    const inStockCount = products.filter((p) => p.stock > 0).length;
    const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
    return { total: catalogTotal || products.length, inStockCount, lowStockCount };
  }, [products, catalogTotal]);

  const findProductByScanCode = (rawCode: string): { product: Product; unit: SaleUnit } | null => {
    const code = normalizeSearchText(rawCode);
    if (!code) return null;
    return findProductInScanIndex(scanCodeIndex, code) as { product: Product; unit: SaleUnit } | null;
  };

  const handleScannedCode = async (code: string) => {
    let matched = findProductByScanCode(code);
    if (!matched) {
      try {
        const remoteProduct = await productsApi.lookup(code) as Product;
        const normalizedCode = normalizeSearchText(code);
        const remoteUnit = productUnits(remoteProduct).find((unit) => normalizeSearchText(unit.barcode) === normalizedCode || normalizeSearchText(unit.sku) === normalizedCode);
        matched = { product: remoteProduct, unit: remoteUnit || productUnits(remoteProduct)[0] };
      } catch {
        matched = null;
      }
    }
    if (!matched) {
      setSearchTerm(code);
      setScanHint(`Không tìm thấy mã: ${code}`);
      return;
    }
    addToCart(matched.product, matched.unit);
    setSearchTerm(matched.product.name);
    setScanHint(`Đã thêm: ${matched.product.name} · ${matched.unit.name}`);
    if (mobileProductPickerOpen) {
      setMobileProductPickerOpen(false);
      setSearchTerm('');
    }
  };

  const addToCart = (product: Product, selectedUnit?: SaleUnit) => {
    const unit = selectedUnit || productUnits(product)[0];
    const unitFactor = Number(unit.factor) || 1;
    const maxStock = maxQuantityForUnit(product, unitFactor);
    if (maxStock <= 0) return;
    const price = resolvePrice(product, unit.name, unitFactor);

    let wasAdded = false;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.unitName === unit.name);
      if (existing) {
        if (existing.quantity >= existing.maxStock) return prev;
        wasAdded = true;
        return prev.map(item => 
          item.id === existing.id
            ? { ...item, quantity: item.quantity + 1, total: totalForLine(item.price, item.quantity + 1, lineDiscountValue(item), item.discountMode) }
            : item
        );
      }
      wasAdded = true;
      return [...prev, {
        id: uuid(),
        invoiceId: '',
        productId: product.id,
        productName: product.name,
        price,
        taxRate: product.taxRate || 0,
        quantity: 1,
        total: price,
        maxStock,
        unitName: unit.name,
        unitFactor,
        priceListId: selectedPriceListId || undefined,
        priceListName: priceLists.find((list: any) => list.id === selectedPriceListId)?.name,
        discountMode: 'percent',
        discountPercent: 0,
        discountAmount: 0,
      }];
    });

    if (wasAdded) {
      setLastAddedProductId(product.id);
      setCartPulse(true);

      if (addedPulseTimerRef.current) window.clearTimeout(addedPulseTimerRef.current);
      if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current);

      addedPulseTimerRef.current = window.setTimeout(() => setLastAddedProductId(null), 420);
      cartPulseTimerRef.current = window.setTimeout(() => setCartPulse(false), 360);
    }
  };

  const chooseProductForSale = (product: Product) => {
    const units = productUnits(product);
    if (units.length > 1) {
      setVariantProduct(product);
      return;
    }
    addToCart(product, units[0]);
    if (mobileProductPickerOpen) {
      setMobileProductPickerOpen(false);
      setSearchTerm('');
    }
  };

  const updateLineUnit = (lineId: string, unitName: string) => {
    const line = cart.find((item) => item.id === lineId);
    const product = line ? products.find((item) => item.id === line.productId) : null;
    const unit = product ? productUnits(product).find((row) => row.name === unitName) : null;
    if (!product || !unit) return;
    const price = resolvePrice(product, unit.name, Number(unit.factor) || 1);
    const unitFactor = Number(unit.factor) || 1;
    const maxStock = maxQuantityForUnit(product, unitFactor);
    setCart((prev) => {
      const current = prev.find((item) => item.id === lineId);
      if (!current) return prev;
      const quantity = Math.min(current.quantity, maxStock);
      return prev.map((item) => item.id === lineId
        ? { ...item, unitName: unit.name, unitFactor, quantity, maxStock, price, total: totalForLine(price, quantity, lineDiscountValue(item), item.discountMode) }
        : item).filter((item) => item.quantity > 0);
    });
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setCart(prev => prev.flatMap(item => {
      if (item.id === lineId) {
        const newQ = item.quantity + delta;
        if (newQ <= 0) return [];
        if (newQ > item.maxStock) return [item];
        return { ...item, quantity: newQ, total: totalForLine(item.price, newQ, lineDiscountValue(item), item.discountMode) };
      }
      return [item];
    }));
  };

  const removeFromCart = (lineId: string) => {
    setCart(prev => prev.filter(item => item.id !== lineId));
  };

  const duplicateCartLine = (lineId: string) => {
    setCart((prev) => {
      const source = prev.find((item) => item.id === lineId);
      if (!source) return prev;
      const usedQuantity = prev
        .filter((item) => item.productId === source.productId && item.unitName === source.unitName)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (usedQuantity >= source.maxStock) return prev;
      const duplicate: CartLine = {
        ...source,
        id: uuid(),
        invoiceId: '',
        quantity: 1,
        total: totalForLine(source.price, 1, 0, 'percent'),
        discountMode: 'percent',
        discountPercent: 0,
        discountAmount: 0,
        note: '',
      };
      const sourceIndex = prev.findIndex((item) => item.id === lineId);
      return [...prev.slice(0, sourceIndex + 1), duplicate, ...prev.slice(sourceIndex + 1)];
    });
  };

  const updateLineNote = (lineId: string, note: string) => {
    setCart((prev) => prev.map((item) => item.id === lineId ? { ...item, note } : item));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = cart.reduce((sum, item) => sum + (item.total * (Number(item.taxRate) || 0)) / 100, 0);
  const orderDiscountAmount = useMemo(() => {
    if (orderDiscountType === 'percent') {
      return Math.min(totalAmount, Math.max(0, (totalAmount * (Number(orderDiscountValue) || 0)) / 100));
    }
    return Math.min(totalAmount, Math.max(0, Number(orderDiscountValue) || 0));
  }, [orderDiscountType, orderDiscountValue, totalAmount]);
  const finalAmount = Math.max(0, totalAmount - orderDiscountAmount + taxAmount);
  const previousDebtAmount = Math.max(0, Number(selectedCustomer?.totalDebt) || 0);
  const actualPayment = Math.max(0, Number(actualPaymentAmount) || 0);
  const amountAppliedToInvoice = Math.min(finalAmount, actualPayment);
  const debtPaymentAmount = Math.min(previousDebtAmount, Math.max(0, actualPayment - finalAmount));
  const invoiceDebtAmount = Math.max(0, finalAmount - amountAppliedToInvoice);
  const totalReceivable = finalAmount + previousDebtAmount;
  const changeAmount = Math.max(0, actualPayment - totalReceivable);
  const remainingCustomerDebt = Math.max(0, previousDebtAmount - debtPaymentAmount + invoiceDebtAmount);

  const updateLineDiscount = (lineId: string, mode: DiscountMode, value: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.id !== lineId) return item;
      const safeValue = mode === 'percent'
        ? Math.min(100, Math.max(0, Number(value) || 0))
        : Math.max(0, Number(value) || 0);
      return {
        ...item,
        discountMode: mode,
        discountPercent: mode === 'percent' ? safeValue : 0,
        discountAmount: mode === 'amount' ? safeValue : 0,
        total: totalForLine(item.price, item.quantity, safeValue, mode),
      };
    }));
  };

  const saveDraft = () => {
    if (cart.length === 0) {
      setFormError('Không thể lưu đơn trống.');
      return;
    }
    const upsertId = activeOrderTab === 'live' ? `DRAFT-${Date.now()}` : activeOrderTab;
    const draft: OrderDraft = {
      id: upsertId,
      name: `${selectedCustomer?.name || 'Khách vãng lai'} - ${new Date().toLocaleTimeString('vi-VN')}`,
      cart,
      customerId: selectedCustomer?.id || null,
      paymentMethod,
      orderNote,
      orderDiscountType,
      orderDiscountValue,
      createdAt: new Date().toISOString(),
    };
    setDrafts((prev) => {
      const next = [draft, ...prev.filter((d) => d.id !== upsertId)].slice(0, 20);
      return next;
    });
    setActiveOrderTab(upsertId);
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMethod('cash');
    setActualPaymentAmount(0);
    setOrderNote('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setMobileProductPickerOpen(false);
    setShowOrderItemsSheet(false);
    setShowMobileOrderNote(false);
    setFormError('');
  };

  const loadDraft = (draft: OrderDraft) => {
    setCart(draft.cart);
    setSelectedCustomer(draft.customerId ? customers.find((c) => c.id === draft.customerId) || null : null);
    setPaymentMethod(draft.paymentMethod);
    setOrderNote(draft.orderNote || '');
    setOrderDiscountType(draft.orderDiscountType || 'amount');
    setOrderDiscountValue(draft.orderDiscountValue || 0);
    setActualPaymentAmount(0);
    setStep('cart');
    setActiveOrderTab(draft.id);
    setShowDraftsSheet(false);
    setMobileProductPickerOpen(false);
  };

  const removeDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (activeOrderTab === draftId) {
      startNewOrder();
    }
  };

  const startNewOrder = () => {
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMethod('cash');
    setActualPaymentAmount(0);
    setOrderNote('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setStep('cart');
    setActiveOrderTab('live');
    setMobileProductPickerOpen(false);
    setShowOrderItemsSheet(false);
    setShowMobileOrderNote(false);
    setShowDraftsSheet(false);
  };

  const openPaymentStep = () => {
    setFormError('');
    setActualPaymentAmount(paymentMethod === 'debt' ? 0 : finalAmount);
    setStep('payment');
  };

  const selectPaymentMethod = (nextMethod: PaymentMethod) => {
    setPaymentMethod(nextMethod);
    setActualPaymentAmount(nextMethod === 'debt' ? 0 : finalAmount);
  };

  const handleCheckout = async () => {
    setFormError('');
    if (!activeTenant || !currentUser || cart.length === 0) return;
    if (invoiceDebtAmount > 0 && !selectedCustomer) {
      setFormError('Khách lẻ cần thanh toán đủ toa hoặc chọn khách hàng để ghi nợ.');
      return;
    }

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      tenantId: activeTenant.id,
      customerId: selectedCustomer?.id || null,
      createdBy: currentUser.id,
      totalAmount,
      discount: orderDiscountAmount,
      taxAmount,
      finalAmount,
      paidAmount: paymentMethod === 'debt' ? 0 : actualPayment,
      debtAmount: paymentMethod === 'debt' ? finalAmount : invoiceDebtAmount,
      previousDebtAmount,
      changeAmount: paymentMethod === 'debt' ? 0 : changeAmount,
      paymentMethod,
      accountId: paymentMethod === 'debt' ? null : selectedAccountId || null,
      status: paymentMethod === 'debt' || invoiceDebtAmount > 0 ? (actualPayment > 0 ? 'partial' : 'unpaid') : 'completed',
      // POS checkout is already the completed sale flow. Posting it as closed
      // makes stock, cashbook, debt and reports update immediately.
      workflowStatus: 'closed',
      paymentStatus: paymentMethod === 'debt' || invoiceDebtAmount > 0 ? (actualPayment > 0 ? 'partial' : 'unpaid') : 'paid',
      note: orderNote?.trim() || '',
      createdAt: new Date().toISOString()
    };

    setIsCheckingOut(true);
    try {
      const createdInvoice = await addInvoice(newInvoice, cart.map((item) => ({
        ...item,
        priceOverride: false,
        discountMode: item.discountMode || 'percent',
        discountPercent: item.discountMode === 'percent' || !item.discountMode ? item.discountPercent || 0 : 0,
        discountAmount: item.discountMode === 'amount' ? item.discountAmount || 0 : 0,
      })));
      if (!createdInvoice) {
        setFormError('Không thể ghi nhận hóa đơn. Vui lòng thử lại.');
        return;
      }

      const persistedInvoiceId = createdInvoice.id;
      setLastInvoiceId(createdInvoice.documentNo || persistedInvoiceId);
      setCurrentInvoice(createdInvoice);
      const itemsWithInvoiceId = cart.map(item => ({ ...item, invoiceId: persistedInvoiceId }));
      setCurrentInvoiceItems(itemsWithInvoiceId);

      setStep('success');
      setCart([]);
      setOrderDiscountValue(0);
      setActualPaymentAmount(0);
      setOrderNote('');
      setShowMobileOrderNote(false);
      if (activeOrderTab !== 'live') {
        setDrafts((prev) => prev.filter((d) => d.id !== activeOrderTab));
        setActiveOrderTab('live');
      }
    } finally {
      setIsCheckingOut(false);
    }
  };

  const resetPOS = () => {
    setStep('cart');
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMethod('cash');
    setActualPaymentAmount(0);
    setSelectedCategory('All');
    setSearchTerm('');
    setCustomerSearchTerm('');
    setShowCustomerResults(false);
    setShowAddCustomer(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setShowInvoice(false);
    setLastInvoiceId('');
    setCurrentInvoice(null);
    setCurrentInvoiceItems([]);
    setActiveOrderTab('live');
    setFormError('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setOrderNote('');
    setMobileProductPickerOpen(false);
    setShowOrderItemsSheet(false);
    setShowMobileOrderNote(false);
  };

  const handleCreateCustomer = () => {
    setFormError('');
    if (isCashier) {
      setFormError('Nhân viên bán hàng không có quyền tạo mới khách hàng.');
      return;
    }
    if (!newCustomer.name || !newCustomer.phone || !activeTenant) {
      setFormError('Vui lòng nhập tên và số điện thoại khách hàng.');
      return;
    }

    const customer: Customer = {
      id: uuid(),
      tenantId: activeTenant.id,
      name: newCustomer.name,
      phone: newCustomer.phone,
      address: newCustomer.address,
      totalDebt: 0,
      type: 'retail'
    };

    void addCustomer(customer).then((createdCustomer) => {
      if (!createdCustomer) {
        setFormError('Không thể lưu khách hàng. Vui lòng thử lại.');
        return;
      }
      setSelectedCustomer(createdCustomer);
      setCustomerSearchTerm(createdCustomer.name);
      setShowAddCustomer(false);
      setNewCustomer({ name: '', phone: '', address: '' });
    });
  };

  const selectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setCustomerSearchTerm(customer?.name || '');
    setShowCustomerResults(false);
    setShowCustomerPicker(false);
    setShowOrderContext(false);
  };

  const renderMobileOrderItemsSheet = () => {
    if (!showOrderItemsSheet) return null;
    return (
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center sm:p-4" onClick={() => setShowOrderItemsSheet(false)}>
        <div className="max-h-[78vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Hàng hóa trong đơn</h3>
            <button type="button" onClick={() => setShowOrderItemsSheet(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng danh sách hàng hóa">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">Nhấn <span className="font-semibold text-sky-700">+</span> để thêm dòng cùng sản phẩm, hoặc biểu tượng tin nhắn để ghi chú riêng.</p>
          <div className="space-y-2">
            {cart.map((item) => (
              <POSCartItem
                key={item.id}
                item={item}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onDuplicate={duplicateCartLine}
                onUpdateNote={updateLineNote}
                onUpdateDiscount={updateLineDiscount}
                units={productUnits(products.find((product) => product.id === item.productId) || ({} as Product))}
                onChangeUnit={updateLineUnit}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderMobileDraftsSheet = () => {
    if (!showDraftsSheet) return null;
    const draftTotal = (draft: OrderDraft) => {
      const subtotal = draft.cart.reduce((sum, item) => sum + item.total, 0);
      const discount = draft.orderDiscountType === 'percent'
        ? subtotal * (draft.orderDiscountValue / 100)
        : draft.orderDiscountValue;
      return Math.max(0, subtotal - discount);
    };
    const itemCount = (draft: OrderDraft) => draft.cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div className="pos-mobile-ui fixed inset-0 z-[121] flex items-end justify-center bg-slate-950/35 p-3" onClick={() => setShowDraftsSheet(false)}>
        <div role="dialog" aria-modal="true" aria-label="Chuyển đơn hàng" className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Chuyển đơn hàng</h3>
              <p className="text-[11px] text-slate-500">Chọn đơn hiện tại hoặc đơn nháp để tiếp tục bán</p>
            </div>
            <button type="button" onClick={() => setShowDraftsSheet(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Đóng danh sách đơn hàng">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            <button
              type="button"
              onClick={() => { startNewOrder(); setShowDraftsSheet(false); }}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${activeOrderTab === 'live' ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700"><Plus className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-900">Đơn hiện tại</span>
                <span className="block text-[11px] text-slate-500">{cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm · {formatCurrency(finalAmount)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => loadDraft(draft)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${activeOrderTab === draft.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><ClipboardList className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900">{draft.name}</span>
                  <span className="block text-[11px] text-slate-500">{itemCount(draft)} sản phẩm · {formatCurrency(draftTotal(draft))}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
            {drafts.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">Chưa có đơn nháp. Lưu một đơn để chuyển qua lại nhiều đơn.</p>}
          </div>
        </div>
      </div>
    );
  };

  const handleExportImage = () => {
    const invoiceNode = invoiceRef.current;
    if (invoiceNode === null) return;

    const width = Math.ceil(invoiceNode.scrollWidth || invoiceNode.getBoundingClientRect().width);
    const height = Math.ceil(invoiceNode.scrollHeight || invoiceNode.getBoundingClientRect().height);
    toPng(invoiceNode, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      width,
      height,
      pixelRatio: 2,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        margin: '0',
        borderRadius: '0',
        boxShadow: 'none',
        overflow: 'visible',
      },
    })
      .then((dataUrl) => {
        download(dataUrl, `HoaDon_${lastInvoiceId}.png`);
      })
      .catch((err) => {
        console.error('Export image error:', err);
      });
  };

  const handlePrint = async () => {
    const invoiceNode = invoiceRef.current;
    if (invoiceNode === null) return;

    if (await printViaBridge({ text: invoiceNode.innerText, documentNo: lastInvoiceId })) return;

    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('title', 'Bản in hóa đơn');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '-10000px';
    printFrame.style.bottom = '0';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameDocument = printFrame.contentDocument;
    if (!frameDocument) {
      printFrame.remove();
      return;
    }

    const copiedStyles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((style) => style.outerHTML)
      .join('');
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8">${copiedStyles}<style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { display: flex; align-items: flex-start; justify-content: center; }
      #printable-invoice { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
    </style></head><body>${invoiceNode.outerHTML}</body></html>`);
    frameDocument.close();

    let printed = false;
    const printInvoice = () => {
      if (printed) return;
      printed = true;
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      window.setTimeout(() => printFrame.remove(), 500);
    };
    printFrame.onload = printInvoice;
    window.setTimeout(printInvoice, 250);
  };

  const handlePrintAndReturn = async () => {
    await handlePrint();
    resetPOS();
  };

  const closeScannerModal = () => {
    setShowScannerModal(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target as HTMLElement)?.isContentEditable;
      if (isTypingField) return;

      const now = Date.now();
      if (now - scannerLastKeyTimeRef.current > 70) {
        scannerBufferRef.current = '';
      }
      scannerLastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (code.length >= 3) {
          void handleScannedCode(code);
        }
        return;
      }

      if (event.key.length === 1) {
        scannerBufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [products]);

  if (step === 'success') {
    return (
      <POSInvoiceModal
        ref={invoiceRef}
        isOpen={showInvoice}
        onClose={resetPOS}
        lastInvoiceId={lastInvoiceId}
        activeTenant={activeTenant}
        selectedCustomer={selectedCustomer}
        paymentMethod={paymentMethod}
        currentInvoiceItems={currentInvoiceItems}
        currentInvoice={currentInvoice}
        currentUserName={currentUser?.name}
        onExportImage={handleExportImage}
        onPrint={handlePrintAndReturn}
      />
    );
  }

  if (step === 'payment') {
    return (
      <div className="erp-compact flex h-full flex-col bg-slate-100">
        <div className="hidden p-6 lg:flex items-center justify-between sticky top-0 z-40 border-b border-sky-100/30 bg-white">
          <Button variant="ghost" size="sm" onClick={() => setStep('cart')} className="h-11 px-5 rounded-lg font-medium text-slate-600 hover:text-sky-700 flex items-center gap-2">
            <ChevronRight className="h-5 w-5 rotate-180" /> Trở lại
          </Button>
          <h2 className="font-semibold text-slate-900 text-lg">Thanh toán</h2>
          <div className="h-10 w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto pb-28 lg:pb-6">
          <div className="mx-auto w-full max-w-2xl space-y-3 p-3 lg:space-y-5 lg:p-6">
            <div className="lg:hidden flex items-center gap-2 bg-white rounded-lg px-2 py-1 border border-slate-200">
              <Button variant="ghost" size="sm" onClick={() => setStep('cart')} className="h-9 w-9 p-0 text-slate-500">
                <ChevronRight className="h-5 w-5 rotate-180" />
              </Button>
              <h2 className="font-semibold text-slate-900 text-[18px]">Thanh toán</h2>
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowOrderItemsSheet(true)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left text-base text-slate-900 flex items-center justify-between"
            >
              <span>Xem hàng trong đơn</span>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </button>

            <label className="block rounded-xl border border-slate-200 bg-white p-3">
              <span className="text-sm font-medium text-slate-800">Ghi chú chung cho đơn hàng</span>
              <textarea
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
                rows={2}
                placeholder="Ví dụ: Khách lấy hàng lúc 17:00..."
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              {selectedCustomer && (
                <div className="rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[15px]">
                    <span className="text-orange-900">Công nợ cũ · {selectedCustomer.name}</span>
                    <span className="font-semibold tabular-nums text-orange-700">{formatCurrency(previousDebtAmount)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-orange-800/75">Tiền trả sẽ ưu tiên thanh toán toa này, phần còn lại cấn trừ công nợ cũ.</p>
                </div>
              )}
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Tổng tiền hàng</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-300 px-1.5 text-xs text-slate-600">{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 text-[17px]">
                <span className="text-slate-900">Giảm giá</span>
                <div className="flex items-center gap-1.5">
                <select
                  value={orderDiscountType}
                  onChange={(e) => setOrderDiscountType(e.target.value as 'percent' | 'amount')}
                  aria-label="Đơn vị giảm giá đơn hàng"
                  className="h-9 rounded-md border border-slate-200 bg-white px-1.5 text-right text-xs text-slate-700 outline-none"
                >
                  <option value="amount">VNĐ</option>
                  <option value="percent">%</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={orderDiscountType === 'percent' ? 100 : totalAmount}
                  value={orderDiscountValue || 0}
                  onChange={(e) => setOrderDiscountValue(Number(e.target.value) || 0)}
                  aria-label={orderDiscountType === 'amount' ? 'Số tiền giảm giá đơn hàng' : 'Phần trăm giảm giá đơn hàng'}
                  className="h-10 w-28 border-b border-slate-300 bg-transparent text-right text-[17px] outline-none"
                />
                </div>
              </div>
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Khách cần trả</span>
                <span className="font-semibold text-sky-600 tabular-nums">{formatCurrency(finalAmount)}</span>
              </div>
              {selectedCustomer && (
                <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-[17px]">
                  <span className="font-semibold text-slate-900">Tổng phải thu</span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(totalReceivable)}</span>
                </div>
              )}
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5">
                <label className="flex items-center justify-between gap-3 text-[15px] font-medium text-slate-900">
                  <span>Khách trả thực tế</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    inputMode="numeric"
                    value={actualPaymentAmount}
                    onChange={(event) => setActualPaymentAmount(event.target.value)}
                    disabled={paymentMethod === 'debt'}
                    className="h-9 w-36 rounded-md border border-sky-200 bg-white px-2 text-right text-[15px] font-semibold tabular-nums text-sky-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
                {paymentMethod === 'debt' && <p className="mt-1 text-[11px] text-slate-500">Đang ghi nợ toàn bộ toa này.</p>}
              </div>
              {debtPaymentAmount > 0 && (
                <div className="flex items-center justify-between text-[15px] text-emerald-700">
                  <span>Cấn trừ công nợ cũ</span>
                  <span className="font-semibold tabular-nums">-{formatCurrency(debtPaymentAmount)}</span>
                </div>
              )}
              {invoiceDebtAmount > 0 && (
                <div className="flex items-center justify-between text-[15px] text-orange-700">
                  <span>Công nợ phát sinh từ toa này</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(invoiceDebtAmount)}</span>
                </div>
              )}
              {selectedCustomer && remainingCustomerDebt > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 text-[15px] text-orange-800">
                  <span className="font-medium">Công nợ còn lại</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(remainingCustomerDebt)}</span>
                </div>
              )}
              {changeAmount > 0 && (
                <div className="flex items-center justify-between text-[15px] text-emerald-700">
                  <span>Tiền thừa trả khách</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(changeAmount)}</span>
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1 rounded-xl bg-slate-100 p-1 flex items-center gap-1">
                  {[
                    { key: 'cash', label: 'Tiền mặt' },
                    { key: 'transfer', label: 'Chuyển khoản' },
                    { key: 'debt', label: 'Ghi nợ' }
                  ].map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      disabled={method.key === 'debt' && isCashier}
                      onClick={() => selectPaymentMethod(method.key as PaymentMethod)}
                      className={`h-10 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        paymentMethod === method.key ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="h-12 w-12 rounded-xl bg-slate-100 text-slate-700 text-lg">•••</button>
              </div>
              {paymentMethod !== 'debt' && (
                <label className="block text-sm text-slate-600">Tài khoản nhận tiền
                  <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3">
                    <option value="">Tự động theo phương thức</option>
                    {cashAccounts.filter((account) => account.type === accountTypeForPayment(paymentMethod)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
              )}
            </div>

          </div>
        </div>

        {renderMobileOrderItemsSheet()}

        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto w-full max-w-2xl">
            <Button
              className="h-12 w-full rounded-xl bg-sky-600 text-base font-semibold text-white hover:bg-sky-700"
              onClick={handleCheckout}
              disabled={isCheckingOut || (paymentMethod === 'debt' && !selectedCustomer)}
            >
              {isCheckingOut ? 'Đang ghi nhận...' : 'Hoàn thành'}
            </Button>
          </div>
        </div>
        </div>
    );
  }

  return (
    <div className="erp-compact pos-page flex min-h-0 min-w-0 flex-col h-full lg:flex-row lg:items-stretch bg-slate-50 overflow-y-auto lg:overflow-hidden font-sans relative">
      <BarcodeScannerModal
        open={showScannerModal}
        title="Quét mã để thêm vào giỏ"
        description="Đưa mã vạch vào giữa khung để tự động thêm sản phẩm vào giỏ hàng."
        onClose={closeScannerModal}
        onDetected={(code) => {
          setScanHint('');
          void handleScannedCode(code);
        }}
      />

      {variantProduct && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-[2px] sm:items-center" onMouseDown={() => setVariantProduct(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Chọn quy cách bán ${variantProduct.name}`} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Sản phẩm có biến thể</p>
                <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-900">{variantProduct.name}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Chọn quy cách muốn bán</p>
              </div>
              <button type="button" aria-label="Đóng chọn biến thể" onClick={() => setVariantProduct(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto p-3">
              {productUnits(variantProduct).map((unit) => {
                const factor = Number(unit.factor) || 1;
                const available = maxQuantityForUnit(variantProduct, factor);
                const price = resolvePrice(variantProduct, unit.name, factor);
                const disabled = available <= 0;
                return (
                  <button key={unit.name} type="button" disabled={disabled} onClick={() => { addToCart(variantProduct, unit); setVariantProduct(null); if (mobileProductPickerOpen) { setMobileProductPickerOpen(false); setSearchTerm(''); } }} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${disabled ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50' : 'border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">{unit.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">1 {unit.name} = {factor} {variantProduct.unit} · {disabled ? 'Hết hàng' : `Còn ${available}`}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-sky-700">{formatCompactCurrency(price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Product List Section */}
      <div className="w-full min-w-0 flex-1 basis-0 lg:self-stretch flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200/50 bg-white relative">
        <div className="p-3 sm:p-4 lg:p-2 space-y-3 lg:space-y-1.5 bg-white sticky top-0 z-40 border-b border-slate-200 shadow-sm shrink-0">
          <div className="hidden lg:flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-600 text-white">
                <ShoppingCart className="h-3.5 w-3.5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900">Tạo chứng từ bán hàng</h1>
                <p className="text-[10px] text-slate-500">Tìm hàng, kiểm tra tồn và thêm vào đơn</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">
                <Package className="h-3.5 w-3.5" />
                {inventorySummary.total} SP
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                Còn hàng: {inventorySummary.inStockCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">
                Sắp hết: {inventorySummary.lowStockCount}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
              <Input 
                className="h-10 sm:h-11 lg:h-8 pl-9 rounded-lg border border-slate-200 bg-white focus:ring-4 focus:ring-sky-500/10 transition-all font-medium text-sm lg:text-xs placeholder:text-slate-400"
                placeholder="Quét mã hoặc tìm sản phẩm" 
                value={searchTerm}
                onFocus={() => setMobileProductPickerOpen(true)}
                onChange={e => { setSearchTerm(e.target.value); setMobileProductPickerOpen(true); }}
              />
            </div>
            <Button
              onClick={() => {
                setScanHint('');
                setMobileProductPickerOpen(true);
                setShowScannerModal(true);
              }}
              variant="outline"
              className="h-10 sm:h-11 lg:h-8 px-3 sm:px-4 lg:px-2 rounded-lg border-slate-200 bg-white text-slate-700"
              title="Quét bằng camera"
            >
              <Camera className="h-4 w-4 sm:h-5 sm:w-5 lg:h-3.5 lg:w-3.5" />
              <ScanLine className="h-4 w-4 sm:h-5 sm:w-5 lg:h-3.5 lg:w-3.5 ml-1 lg:ml-0.5" />
            </Button>
            {!mobileProductPickerOpen && (
              <div className="flex shrink-0 items-center gap-1 lg:hidden">
                <button
                  type="button"
                  onClick={() => setShowOrderContext(true)}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white ${showOrderContext ? 'border-sky-300 text-sky-700' : 'border-slate-200 text-slate-500'}`}
                  aria-label="Chọn khách hàng"
                  title="Chọn khách hàng"
                >
                  <User className="h-4 w-4" />
                  {selectedCustomer && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOrderContext(true)}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white ${showOrderContext ? 'border-sky-300 text-sky-700' : 'border-slate-200 text-slate-500'}`}
                  aria-label="Chọn bảng giá"
                  title="Chọn bảng giá"
                >
                  <Tag className="h-4 w-4" />
                  {selectedPriceListId && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileProductPickerOpen(true)}
                  className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-sky-800"
                  aria-label="Thêm hàng"
                  title="Thêm hàng"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Thêm</span>
                </button>
              </div>
            )}
          </div>
          {scanHint && <p className="text-xs text-sky-700">{scanHint}</p>}

          <div className="hidden lg:flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 sm:h-9 lg:h-7 px-4 sm:px-5 lg:px-3 rounded-lg font-medium whitespace-nowrap transition-all text-xs lg:text-[11px] shadow-sm shrink-0 ${
                  selectedCategory === cat 
                  ? 'bg-sky-600 text-white shadow-md' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'All' ? 'Tất cả' : cat}
              </button>
            ))}
          </div>
        </div>
        
        <div
          className="pos-mobile-ui pos-mobile-content flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pb-[18rem] sm:p-4 sm:pb-[18rem] lg:p-2 lg:pb-2"
          onScroll={handleProductListScroll}
        >
          <div className={`${mobileProductPickerOpen ? 'mb-2' : 'hidden'} lg:hidden`}>
            <button
              onClick={() => setShowMobileFilters((v) => !v)}
              className="pos-mobile-filter-control inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
            </button>
            {showMobileFilters && (
              <div className="pos-mobile-filter-controls mt-2 grid grid-cols-2 gap-2">
                <select
                  value={mobileSortKey}
                  onChange={(e) => setMobileSortKey(e.target.value as any)}
                  className="pos-mobile-filter-control h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
                >
                  <option value="default">Sắp xếp mặc định</option>
                  <option value="name_asc">Tên A → Z</option>
                  <option value="price_asc">Giá thấp → cao</option>
                  <option value="price_desc">Giá cao → thấp</option>
                  <option value="stock_asc">Tồn thấp → cao</option>
                  <option value="stock_desc">Tồn cao → thấp</option>
                </select>
                <select
                  value={mobileStockFilter}
                  onChange={(e) => setMobileStockFilter(e.target.value as any)}
                  className="pos-mobile-filter-control h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
                >
                  <option value="all">Tất cả tồn kho</option>
                  <option value="in_stock">Còn hàng</option>
                  <option value="low_stock">Sắp hết</option>
                  <option value="out_of_stock">Hết hàng</option>
                </select>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="pos-mobile-filter-control col-span-2 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
                >
                  {categories.map((category) => <option key={category} value={category}>{category === 'All' ? 'Tất cả danh mục' : category}</option>)}
                </select>
              </div>
            )}
          </div>

          {!mobileProductPickerOpen && (
            <div className="lg:hidden">
              {showOrderContext && (
                <div className="fixed inset-0 z-[118] flex items-end justify-center bg-slate-950/35 p-3 lg:hidden" onClick={() => setShowOrderContext(false)}>
                  <div role="dialog" aria-modal="true" aria-label="Thông tin đơn hàng" className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Thông tin đơn hàng</h3>
                        <p className="text-[11px] text-slate-500">Chọn khách hàng và bảng giá áp dụng</p>
                      </div>
                      <button type="button" onClick={() => setShowOrderContext(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Đóng"><X className="h-4 w-4" /></button>
                    </div>
                    <button type="button" onClick={() => { setShowOrderContext(false); setShowCustomerPicker(true); }} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800"><User className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{selectedCustomer?.name || 'Khách lẻ / khách ngoài'}</span></span>
                      <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-slate-500">Nợ: {formatCurrency(selectedCustomer?.totalDebt || 0)} <ChevronRight className="h-4 w-4" /></span>
                    </button>
                    <label className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                      <Tag className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="shrink-0 text-sm text-slate-600">Bảng giá</span>
                      <select value={selectedPriceListId} onChange={(event) => setSelectedPriceListId(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-sm text-slate-800 outline-none">
                        {priceLists.map((list: any) => <option key={list.id} value={list.id}>{list.name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="pos-mobile-title text-sm font-semibold text-slate-900">Giỏ hàng</h2>
                  <p className="pos-mobile-caption text-[11px] text-slate-500">Chỉ hiển thị các mặt hàng đã chọn</p>
                </div>
              </div>
              {cart.length > 0 ? (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <POSCartItem
                      key={item.id}
                      item={item}
                      onUpdateQuantity={updateQuantity}
                      onRemove={removeFromCart}
                      onDuplicate={duplicateCartLine}
                      onUpdateNote={updateLineNote}
                      onUpdateDiscount={updateLineDiscount}
                      units={productUnits(products.find((product) => product.id === item.productId) || ({} as Product))}
                      onChangeUnit={updateLineUnit}
                    />
                  ))}
                </div>
              ) : (
                <button type="button" onClick={() => setMobileProductPickerOpen(true)} className="flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center">
                  <ShoppingCart className="mb-2 h-7 w-7 text-slate-300" />
                  <span className="text-sm font-medium text-slate-600">Chưa có mặt hàng</span>
                  <span className="mt-1 text-xs text-slate-400">Chạm “Thêm hàng” hoặc ô tìm kiếm để chọn sản phẩm</span>
                </button>
              )}
            </div>
          )}

          <div className={`${mobileProductPickerOpen ? 'block' : 'hidden'} lg:hidden`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Chọn hàng</h2>
                <p className="text-[11px] text-slate-500">Chọn xong sẽ quay về giỏ hàng</p>
              </div>
              <button type="button" aria-label="Về giỏ hàng" onClick={() => { setMobileProductPickerOpen(false); setSearchTerm(''); }} className="pos-mobile-back-to-cart inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700">
                <ChevronLeft className="h-3.5 w-3.5" />
                Về giỏ hàng
              </button>
            </div>
            <div className="space-y-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {mobileVisibleProducts.map((product) => {
              const inCart = cart.find((line) => line.productId === product.id);
              const units = productUnits(product);
              const available = Number(product.availableStock ?? product.stock);
              const price = displayPrice(product);
              const isOutOfStock = available <= 0;
              const isLowStock = available > 0 && available <= product.lowStockThreshold;
              return (
                <div key={product.id} className={`pos-mobile-product-row px-3 py-2.5 border-b border-slate-100 last:border-b-0 ${isOutOfStock ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">SP</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="pos-mobile-product-name line-clamp-1 text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="pos-mobile-product-meta mt-0.5 text-[11px] text-slate-500">{units.length > 1 ? `${units.length} quy cách · chọn khi thêm` : `Bán theo ${product.unit}`}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="pos-mobile-product-price text-base leading-none font-semibold text-sky-700 tabular-nums">{formatCompactCurrency(price)}</span>
                        <span className="pos-mobile-product-meta text-[11px] text-slate-400">/{product.unit}</span>
                        <span className={`pos-mobile-product-meta ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-500'}`}>
                          {isOutOfStock ? 'Hết hàng' : `Tồn: ${available}`}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {inCart ? (
                        <div className="inline-flex items-center rounded-xl border border-rose-300 bg-white p-1">
                          <button
                            onClick={() => updateQuantity(inCart.id, -1)}
                            className="h-7 w-7 rounded-md text-slate-500"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-slate-900 tabular-nums">{inCart.quantity}</span>
                          <button
                            onClick={() => updateQuantity(inCart.id, 1)}
                            disabled={inCart.quantity >= inCart.maxStock}
                            className="h-7 w-7 rounded-md text-slate-700 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
                          disabled={isOutOfStock}
                          onClick={() => chooseProductForSale(product)}
                          aria-label="Thêm vào giỏ"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="grid grid-cols-[76px_minmax(0,1fr)_58px_62px_105px_30px] gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Mã hàng</span><span>Tên hàng</span><span>ĐVT</span><span className="text-right">Tồn</span><span className="text-right">Giá bán</span><span />
            </div>
            {filteredProducts.map(product => {
              const inCart = cart.find((line) => line.productId === product.id);
              const units = productUnits(product);
              const available = Number(product.availableStock ?? product.stock);
              const price = displayPrice(product);
              const out = available <= 0;
              const low = available > 0 && available <= product.lowStockThreshold;
              return (
                <button key={product.id} type="button" disabled={out} onClick={() => chooseProductForSale(product)} className={`grid w-full grid-cols-[76px_minmax(0,1fr)_58px_62px_105px_30px] items-center gap-1 border-b border-slate-100 px-2 py-1.5 text-left text-[11px] last:border-0 ${out ? 'cursor-not-allowed opacity-50' : 'hover:bg-sky-50'} ${inCart ? 'bg-sky-50/70' : 'bg-white'}`}>
                  <span className="truncate font-mono text-[10px] text-slate-500">{product.sku}</span>
                  <span className="min-w-0 truncate font-medium text-slate-800">{product.name}</span>
                  <span className="flex min-w-0 items-center gap-0.5 text-[10px] text-slate-500"><span className="truncate">{product.unit}</span>{units.length > 1 && <span className="rounded bg-sky-50 px-0.5 text-[8px] font-semibold text-sky-700">+{units.length - 1}</span>}</span>
                  <span className={`text-right tabular-nums ${out ? 'text-rose-600' : low ? 'text-amber-600' : 'text-slate-700'}`}>{out ? 'Hết' : available}</span>
                  <span className="text-right font-semibold tabular-nums text-sky-700">{formatCompactCurrency(price)}</span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${inCart ? 'bg-sky-600 text-white' : 'border border-slate-200 text-slate-500'}`}>{inCart ? inCart.quantity : '+'}</span>
                </button>
              );
            })}
          </div>

          {(catalogLoading || catalogError || (catalogTotal > 0 && catalogProducts.length < catalogTotal)) && (
            <div className="mt-2 flex min-h-7 items-center justify-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
              {catalogError ? catalogError : catalogLoading ? 'Đang tải thêm hàng hóa…' : `Đã tải ${catalogProducts.length.toLocaleString('vi-VN')} / ${catalogTotal.toLocaleString('vi-VN')} sản phẩm · Cuộn để tải thêm`}
            </div>
          )}
          
          {filteredProducts.length === 0 && (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-slate-200 p-6 text-center space-y-3">
              <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-lg bg-slate-100 flex items-center justify-center shadow-inner">
                <Search className="h-7 w-7 sm:h-9 sm:w-9 opacity-10" />
              </div>
              <p className="font-black text-slate-300 uppercase tracking-[0.3em] text-[8px] sm:text-[10px]">Dữ liệu trống</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="hidden min-w-0 w-full flex-none lg:flex lg:self-stretch lg:w-[320px] xl:w-[360px] 2xl:w-[400px] flex-col min-h-0 bg-white relative lg:shadow-[-20px_0_60px_rgba(0,0,0,0.03)] z-40 shrink-0">
        <div className="p-3 lg:p-2 border-b border-slate-100 flex justify-between items-center bg-white lg:sticky lg:top-0 z-40 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-2">
            <div className={`h-8 w-8 lg:h-7 lg:w-7 rounded-md bg-sky-600 text-white flex items-center justify-center transition-transform duration-300 ${cartPulse ? 'scale-110' : 'scale-100'}`}>
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 lg:h-3.5 lg:w-3.5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 tracking-tight text-sm lg:text-xs leading-none">Chi tiết đơn bán</h2>
              <p className="text-xs lg:text-[10px] text-slate-400 mt-1">{cart.length} sản phẩm</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowOrderContext((prev) => !prev)}
              aria-label={`Khách hàng và bảng giá: ${selectedCustomer?.name || 'Khách lẻ'}`}
              aria-expanded={showOrderContext}
              title="Khách hàng và bảng giá"
              className={`relative flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${showOrderContext ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-700'}`}
            >
              <User className="h-3.5 w-3.5" />
              {selectedCustomer && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="h-8 px-2.5 sm:px-3 rounded-lg text-slate-400 hover:text-rose-700 font-medium transition-all text-xs ring-1 ring-slate-100"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {showOrderContext && <div className="border-b border-slate-100 bg-slate-50/70 p-3 lg:p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Khách hàng</span>
            {selectedCustomer && <button type="button" onClick={() => selectCustomer(null)} className="text-[11px] text-sky-700 hover:underline">Bán khách lẻ</button>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCustomerPicker(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left text-xs hover:border-sky-400">
              <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-slate-800">{selectedCustomer?.name || 'Khách lẻ / khách ngoài'}</span>
            </button>
            <button type="button" onClick={() => { setShowCustomerPicker(true); setShowAddCustomer(true); }} disabled={isCashier} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 disabled:cursor-not-allowed disabled:opacity-40" title="Thêm khách hàng">
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
            <span className="text-slate-500">Công nợ hiện tại</span>
            <span className={`font-semibold tabular-nums ${selectedCustomer?.totalDebt ? 'text-rose-600' : 'text-emerald-700'}`}>{formatCurrency(selectedCustomer?.totalDebt || 0)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-slate-500">Bảng giá</span>
            <select value={selectedPriceListId} onChange={(e) => setSelectedPriceListId(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs">
              {priceLists.map((list: any) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </div>
        </div>}
        
        <div className="flex-none h-auto lg:flex-1 lg:overflow-y-auto p-2 sm:p-3 lg:p-1.5 space-y-1.5 sm:space-y-2 lg:space-y-1.5">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-300 p-3 text-center space-y-2">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg bg-slate-50 flex items-center justify-center shadow-inner">
                <ShoppingCart className="h-8 w-8 sm:h-10 sm:w-10 opacity-5" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-slate-400 text-xs">Giỏ đang trống</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 sm:space-y-2 pb-2">
               {cart.map(item => (
                 <POSCartItem 
                   key={item.id}
                   item={item}
                   onUpdateQuantity={updateQuantity}
                   onRemove={removeFromCart}
                   onDuplicate={duplicateCartLine}
                   onUpdateNote={updateLineNote}
                   onUpdateDiscount={updateLineDiscount}
                   units={productUnits(products.find((product) => product.id === item.productId) || ({} as Product))}
                   onChangeUnit={updateLineUnit}
                 />
               ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-50 bg-white p-2 shadow-[0_-12px_30px_rgba(0,0,0,0.04)] sm:p-3 lg:p-1.5">
          <div className="mb-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={startNewOrder}
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${activeOrderTab === 'live' ? 'border-sky-600 bg-sky-100 text-sky-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}
            >
              Đơn hiện tại
            </button>
            {drafts.slice(0, 5).map((draft) => (
              <div key={draft.id} className={`flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 ${activeOrderTab === draft.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                <button
                  onClick={() => loadDraft(draft)}
                  className="text-[11px] text-slate-700"
                >
                  {draft.name}
                </button>
                <button
                  onClick={() => removeDraft(draft.id)}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label="Xóa đơn nháp"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mb-1.5 grid grid-cols-[1.15fr_.85fr_1.3fr] gap-1 lg:mb-1">
            <select
              value={orderDiscountType}
              onChange={(e) => setOrderDiscountType(e.target.value as 'percent' | 'amount')}
              className="h-7 min-w-0 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] lg:h-6"
            >
              <option value="amount">Giảm tổng (đ)</option>
              <option value="percent">Giảm tổng (%)</option>
            </select>
            <Input
              type="number"
              value={orderDiscountValue || ''}
              onChange={(e) => setOrderDiscountValue(Number(e.target.value))}
              placeholder="Giảm giá đơn"
              className="h-7 min-w-0 text-[11px] lg:h-6"
            />
            <Input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Ghi chú đơn"
              className="h-7 min-w-0 text-[11px] lg:h-6"
            />
          </div>
          <div className="mb-1.5 flex items-center justify-between gap-2 lg:mb-1">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-slate-500">Phải thu</p>
              <div className="text-lg font-semibold leading-none tabular-nums text-slate-900 sm:text-xl">{formatCurrency(finalAmount)}</div>
              {orderDiscountAmount > 0 && (
                <p className="text-[10px] text-emerald-700">Đã giảm {formatCurrency(orderDiscountAmount)}</p>
              )}
            </div>
            <Button variant="outline" className="h-7 shrink-0 px-2 text-[11px]" disabled={cart.length === 0} onClick={saveDraft}>Lưu đơn</Button>
          </div>
          <Button 
            className="group relative h-9 w-full overflow-hidden rounded-md bg-sky-600 text-sm font-semibold text-white shadow-md shadow-sky-900/15 transition-all hover:bg-sky-700 active:scale-[0.98] lg:h-8"
            disabled={cart.length === 0}
            onClick={openPaymentStep}
          >
            <span className="relative z-10 flex items-center gap-2">
              Thanh toán <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 lg:h-4 lg:w-4 group-hover:translate-x-2 transition-transform duration-500" />
            </span>
          </Button>
        </div>
      </div>

      {!mobileProductPickerOpen && (
        <div className="pos-mobile-ui fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 p-3 lg:hidden">
          <div className="rounded-t-xl border border-slate-200 bg-white px-3 pt-2 pb-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">Tổng tiền hàng</span>
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-sky-300 px-2 text-sm font-medium text-sky-700">
                  {cart.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDraftsSheet(true)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-lg border ${showDraftsSheet || drafts.length > 0 ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500'}`}
                  aria-label={`Chuyển đơn hàng, ${drafts.length} đơn nháp`}
                  title="Chuyển đơn hàng"
                >
                  <ClipboardList className="h-4 w-4" />
                  {drafts.length > 0 && <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-semibold text-white">{drafts.length}</span>}
                </button>
                <span className="pos-mobile-total text-2xl font-semibold text-slate-900 tabular-nums">{formatCurrency(finalAmount)}</span>
              </div>
            </div>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMobileOrderNote((visible) => !visible)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg border ${showMobileOrderNote || orderNote.trim() ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500'}`}
                aria-label="Ghi chú chung cho đơn hàng"
                aria-expanded={showMobileOrderNote}
                title="Ghi chú chung cho đơn hàng"
              >
                <MessageSquare className="h-4 w-4" />
                {orderNote.trim() && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-600" />}
              </button>
            </div>
            {showMobileOrderNote && (
              <textarea
                autoFocus
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
                placeholder="Ghi chú chung cho đơn hàng"
                rows={2}
                className="mb-2 w-full resize-none rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" disabled={cart.length === 0} onClick={saveDraft}>
                Lưu tạm
              </Button>
              <Button className="h-11" disabled={cart.length === 0} onClick={openPaymentStep}>
                Thanh toán
              </Button>
            </div>
          </div>
        </div>
      )}

      {renderMobileOrderItemsSheet()}
      {renderMobileDraftsSheet()}

      {showCustomerPicker && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-900/40 p-3" onClick={() => { setShowCustomerPicker(false); setShowAddCustomer(false); }}>
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{showAddCustomer ? 'Thêm khách hàng' : 'Chọn khách hàng'}</h3>
                <p className="text-[11px] text-slate-500">Có thể bán ngay cho khách lẻ</p>
              </div>
              <button type="button" onClick={() => { setShowCustomerPicker(false); setShowAddCustomer(false); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            {showAddCustomer ? (
              <div className="space-y-2 p-4">
                <Input autoFocus value={newCustomer.name} onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))} placeholder="Tên khách hàng *" className="h-9 text-xs" />
                <Input value={newCustomer.phone} onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Số điện thoại *" className="h-9 text-xs" />
                <Input value={newCustomer.address} onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))} placeholder="Địa chỉ" className="h-9 text-xs" />
                {formError && <p className="text-xs text-rose-600">{formError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCustomer(false)}>Quay lại</Button>
                  <Button type="button" size="sm" onClick={handleCreateCustomer} disabled={isCashier}>Lưu và chọn</Button>
                </div>
              </div>
            ) : (
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input autoFocus value={customerSearchTerm} onChange={(event) => setCustomerSearchTerm(event.target.value)} placeholder="Tìm tên hoặc số điện thoại" className="h-9 pl-8 text-xs" />
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAddCustomer(true)} disabled={isCashier} title="Thêm khách hàng"><UserPlus className="h-3.5 w-3.5" /></Button>
                </div>
                <button type="button" onClick={() => selectCustomer(null)} className="mt-3 flex w-full items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-800">
                  <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Khách lẻ / khách ngoài</span><span>Không ghi nợ</span>
                </button>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-100">
                  {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                    <button type="button" key={customer.id} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50">
                      <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-800">{customer.name}</span><span className="block text-[11px] text-slate-500">{customer.phone}</span></span>
                      <span className={`ml-3 shrink-0 text-xs font-semibold tabular-nums ${customer.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatCurrency(customer.totalDebt || 0)}</span>
                    </button>
                  )) : customerSearchTerm ? <p className="px-3 py-4 text-center text-xs text-slate-500">Không tìm thấy khách hàng phù hợp.</p> : <p className="px-3 py-4 text-center text-xs text-slate-500">Chưa có khách hàng.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
