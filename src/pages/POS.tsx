import { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Customer, PaymentMethod, InvoiceItem, Invoice } from '../types';
import { formatCurrency } from '../lib/utils';
import { Search, X, CheckCircle, ShoppingCart, Wallet, TrendingUp, Package, Printer, ChevronRight, AlertCircle, Plus, MapPin, Phone, User, UserPlus, ScanLine, Camera, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { v4 as uuid } from 'uuid';

// Components
import { POSCartItem } from '../components/pos/POSCartItem';
import { POSInvoiceModal } from '../components/pos/POSInvoiceModal';

type CartLine = InvoiceItem & { maxStock: number; discountPercent?: number };
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

export default function POS() {
  const { products, customers, activeTenant, currentUser, addInvoice, addCustomer, categories: appCategories } = useApp();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [mobileSortKey, setMobileSortKey] = useState<'default' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'name_asc'>('default');
  const [mobileStockFilter, setMobileStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [orderNote, setOrderNote] = useState('');
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [orderDiscountValue, setOrderDiscountValue] = useState(0);
  const [drafts, setDrafts] = useState<OrderDraft[]>([]);
  const [activeOrderTab, setActiveOrderTab] = useState<'live' | string>('live');
  const [step, setStep] = useState<'cart' | 'payment' | 'success'>('cart');
  const [lastInvoiceId, setLastInvoiceId] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<InvoiceItem[]>([]);
  const [formError, setFormError] = useState('');
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);
  const [cartPulse, setCartPulse] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanHint, setScanHint] = useState('');
  const [showSalesInfoModal, setShowSalesInfoModal] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showOrderItemsSheet, setShowOrderItemsSheet] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);
  const isCashier = currentUser?.role === 'cashier';

  const invoiceRef = useRef<HTMLDivElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<number | null>(null);
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
    const keyword = searchTerm.trim().toLowerCase();
    return products.filter(p => {
      const matchSearch =
        !keyword ||
        p.name.toLowerCase().includes(keyword) ||
        p.sku.toLowerCase().includes(keyword) ||
        (p.barcode || '').toLowerCase().includes(keyword);
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
        rows.sort((a, b) => a.sellingPrice - b.sellingPrice);
        break;
      case 'price_desc':
        rows.sort((a, b) => b.sellingPrice - a.sellingPrice);
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
  }, [filteredProducts, mobileSortKey, mobileStockFilter]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) || 
      c.phone.includes(customerSearchTerm)
    ).slice(0, 5);
  }, [customers, customerSearchTerm]);

  const inventorySummary = useMemo(() => {
    const inStockCount = products.filter((p) => p.stock > 0).length;
    const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
    return { total: products.length, inStockCount, lowStockCount };
  }, [products]);

  const findProductByScanCode = (rawCode: string) => {
    const code = rawCode.trim().toLowerCase();
    if (!code) return null;
    return (
      products.find((p) => (p.barcode || '').trim().toLowerCase() === code) ||
      products.find((p) => p.sku.trim().toLowerCase() === code) ||
      null
    );
  };

  const handleScannedCode = (code: string) => {
    const matched = findProductByScanCode(code);
    if (!matched) {
      setSearchTerm(code);
      setScanHint(`Không tìm thấy mã: ${code}`);
      return;
    }
    addToCart(matched);
    setSearchTerm(matched.name);
    setScanHint(`Đã thêm: ${matched.name}`);
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;

    let wasAdded = false;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        wasAdded = true;
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        );
      }
      wasAdded = true;
      return [...prev, {
        id: uuid(),
        invoiceId: '',
        productId: product.id,
        productName: product.name,
        price: product.sellingPrice,
        taxRate: product.taxRate || 0,
        quantity: 1,
        total: product.sellingPrice,
        maxStock: product.stock,
        discountPercent: 0,
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

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQ = item.quantity + delta;
        if (newQ <= 0) return item; 
        if (newQ > item.maxStock) return item;
        return { ...item, quantity: newQ, total: newQ * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
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

  const updateLineDiscount = (productId: string, discountPercent: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.productId !== productId) return item;
      const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
      const rawTotal = item.price * item.quantity;
      const discountedTotal = rawTotal - (rawTotal * pct) / 100;
      return { ...item, discountPercent: pct, total: Math.max(0, discountedTotal) };
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
    setOrderNote('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setFormError('');
  };

  const loadDraft = (draft: OrderDraft) => {
    setCart(draft.cart);
    setSelectedCustomer(draft.customerId ? customers.find((c) => c.id === draft.customerId) || null : null);
    setPaymentMethod(draft.paymentMethod);
    setOrderNote(draft.orderNote || '');
    setOrderDiscountType(draft.orderDiscountType || 'amount');
    setOrderDiscountValue(draft.orderDiscountValue || 0);
    setStep('cart');
    setActiveOrderTab(draft.id);
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
    setOrderNote('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setStep('cart');
    setActiveOrderTab('live');
  };

  const handleCheckout = () => {
    setFormError('');
    if (!activeTenant || !currentUser || cart.length === 0) return;
    if (paymentMethod === 'debt' && !selectedCustomer) {
      setFormError('Vui lòng chọn khách hàng để ghi nợ.');
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
      paidAmount: paymentMethod === 'debt' ? 0 : finalAmount,
      debtAmount: paymentMethod === 'debt' ? finalAmount : 0,
      paymentMethod,
      status: paymentMethod === 'debt' ? 'unpaid' : 'completed',
      note: orderNote?.trim() || '',
      createdAt: new Date().toISOString()
    };

    addInvoice(newInvoice, cart.map((item) => ({
      ...item,
      discountPercent: item.discountPercent || 0,
    })));

    setLastInvoiceId(newInvoice.id);
    setCurrentInvoice(newInvoice);
    const itemsWithInvoiceId = cart.map(item => ({ ...item, invoiceId: newInvoice.id }));
    setCurrentInvoiceItems(itemsWithInvoiceId);
    
    setStep('success');
    setCart([]);
    setOrderDiscountValue(0);
    setOrderNote('');
    if (activeOrderTab !== 'live') {
      setDrafts((prev) => prev.filter((d) => d.id !== activeOrderTab));
      setActiveOrderTab('live');
    }
  };

  const resetPOS = () => {
    setStep('cart');
    setSelectedCustomer(null);
    setSelectedCategory('All');
    setSearchTerm('');
    setCustomerSearchTerm('');
    setShowCustomerResults(false);
    setShowAddCustomer(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setShowInvoice(false);
    setFormError('');
    setOrderDiscountType('amount');
    setOrderDiscountValue(0);
    setOrderNote('');
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

    addCustomer(customer);
    setSelectedCustomer(customer);
    setCustomerSearchTerm(customer.name);
    setShowAddCustomer(false);
    setNewCustomer({ name: '', phone: '', address: '' });
  };

  const selectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setCustomerSearchTerm(customer?.name || '');
    setShowCustomerResults(false);
    setShowCustomerPicker(false);
  };

  const handleExportImage = () => {
    if (invoiceRef.current === null) return;
    
    toPng(invoiceRef.current, { cacheBust: true })
      .then((dataUrl) => {
        download(dataUrl, `HoaDon_${lastInvoiceId}.png`);
      })
      .catch((err) => {
        console.error('Export image error:', err);
      });
  };

  const handlePrint = () => {
    window.print();
  };

  const stopCameraScanner = () => {
    if (scannerIntervalRef.current) {
      window.clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((t) => t.stop());
      scannerStreamRef.current = null;
    }
  };

  const closeScannerModal = () => {
    stopCameraScanner();
    setShowScannerModal(false);
  };

  const openCameraScanner = async () => {
    setScanError('');
    setScanHint('');
    if (!('BarcodeDetector' in window)) {
      setScanError('Thiết bị chưa hỗ trợ BarcodeDetector. Vui lòng dùng máy quét mã vạch hoặc Chrome mới.');
      setShowScannerModal(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      scannerStreamRef.current = stream;
      setShowScannerModal(true);
      window.setTimeout(() => {
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
          void scannerVideoRef.current.play();
        }
      }, 40);
    } catch {
      setScanError('Không mở được camera. Hãy cấp quyền camera hoặc dùng máy quét mã vạch.');
      setShowScannerModal(true);
    }
  };

  useEffect(() => {
    if (!showScannerModal || !scannerVideoRef.current || !('BarcodeDetector' in window)) return;
    const detector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
    });

    scannerIntervalRef.current = window.setInterval(async () => {
      try {
        if (!scannerVideoRef.current) return;
        const barcodes = await detector.detect(scannerVideoRef.current);
        if (barcodes?.length) {
          const code = barcodes[0]?.rawValue || '';
          if (code) {
            handleScannedCode(code);
            closeScannerModal();
          }
        }
      } catch {
        // ignore frame-level detect error
      }
    }, 320);

    return () => {
      if (scannerIntervalRef.current) {
        window.clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
    };
  }, [showScannerModal, products]);

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
          handleScannedCode(code);
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

  useEffect(() => () => stopCameraScanner(), []);

  if (step === 'success') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 bg-slate-50 text-center animate-in fade-in zoom-in duration-300">
        <div className="h-28 w-28 rounded-full bg-sky-100 flex items-center justify-center mb-8 shadow-sm ring-4 ring-sky-50">
          <CheckCircle className="h-14 w-14 text-sky-600" />
        </div>
        <h2 className="text-3xl font-semibold text-slate-900 mb-3">Thanh toán thành công</h2>
        <p className="text-slate-500 mb-10 text-base">Mã hóa đơn <span className="text-sky-700 font-semibold">{lastInvoiceId}</span> đã được ghi nhận.</p>
        
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <Button 
            className="h-14 rounded-lg bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-900/30 text-base font-semibold transition-all hover:scale-[1.01] active:scale-100" 
            onClick={() => setShowInvoice(true)}
          >
            <Printer className="mr-2 h-6 w-6" /> Xuất hóa đơn
          </Button>
          <Button 
            variant="ghost" 
            className="h-12 rounded-lg text-slate-500 font-medium hover:text-slate-900" 
            onClick={resetPOS}
          >
            Bán đơn tiếp theo
          </Button>
        </div>

        <POSInvoiceModal 
          ref={invoiceRef}
          isOpen={showInvoice}
          onClose={() => setShowInvoice(false)}
          lastInvoiceId={lastInvoiceId}
          activeTenant={activeTenant}
          selectedCustomer={selectedCustomer}
          paymentMethod={paymentMethod}
          currentInvoiceItems={currentInvoiceItems}
          currentInvoice={currentInvoice}
          onExportImage={handleExportImage}
          onPrint={handlePrint}
        />
      </div>
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

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Tổng tiền hàng</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-300 px-1.5 text-xs text-slate-600">{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Giảm giá (%)</span>
                <input
                  type="number"
                  value={orderDiscountType === 'percent' ? orderDiscountValue : 0}
                  onChange={(e) => {
                    setOrderDiscountType('percent');
                    setOrderDiscountValue(Number(e.target.value) || 0);
                  }}
                  className="h-10 w-28 border-b border-slate-300 bg-transparent text-right text-[17px] outline-none"
                />
              </div>
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Khách cần trả</span>
                <span className="font-semibold text-sky-600 tabular-nums">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-[17px]">
                <span className="text-slate-900">Khách thanh toán</span>
                <span className="tabular-nums">{formatCurrency(finalAmount)}</span>
              </div>

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
                      onClick={() => setPaymentMethod(method.key as PaymentMethod)}
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
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex items-center justify-between">
              <span className="text-[17px] text-slate-900">Giao hàng</span>
              <button
                type="button"
                aria-label="Toggle giao hàng"
                onClick={() => setIsDelivery((v) => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${isDelivery ? 'bg-sky-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${isDelivery ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        {showOrderItemsSheet && (
          <div className="fixed inset-0 z-[120] bg-slate-900/40 lg:hidden" onClick={() => setShowOrderItemsSheet(false)}>
            <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Hàng hóa trong đơn</h3>
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <div className="font-medium text-slate-900">{item.productName}</div>
                      <div className="text-sm text-slate-500">{formatCurrency(item.price)} x {item.quantity}</div>
                    </div>
                    <div className="text-base font-semibold tabular-nums">{formatCurrency(item.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto w-full max-w-2xl">
            <Button
              className="h-12 w-full rounded-xl bg-sky-600 text-base font-semibold text-white hover:bg-sky-700"
              onClick={handleCheckout}
              disabled={paymentMethod === 'debt' && !selectedCustomer}
            >
              Hoàn thành
            </Button>
          </div>
        </div>
        </div>
    );
  }

  return (
    <div className="erp-compact flex flex-col h-full lg:flex-row bg-slate-50 overflow-y-auto lg:overflow-hidden font-sans relative">
      {showScannerModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Quét mã vạch</h3>
              <button onClick={closeScannerModal} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg bg-slate-950 overflow-hidden aspect-video flex items-center justify-center">
                {scanError ? (
                  <div className="px-4 text-center text-sm text-rose-300">{scanError}</div>
                ) : (
                  <video ref={scannerVideoRef} className="h-full w-full object-cover" muted playsInline />
                )}
              </div>
              <p className="text-xs text-slate-500">
                Đưa mã vạch vào giữa khung để tự động thêm vào giỏ.
              </p>
              <Button variant="outline" className="w-full" onClick={closeScannerModal}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product List Section */}
      <div className="w-full lg:flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200/50 bg-slate-50 relative shrink-0">
        <div className="p-3 sm:p-4 space-y-3 bg-white sticky top-0 z-40 border-b border-slate-200 shadow-sm shrink-0">
          <div className="hidden lg:flex items-center justify-between gap-4 pb-1">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-600 text-white">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900">Tạo chứng từ bán hàng</h1>
                <p className="text-[11px] text-slate-500">Tìm hàng, kiểm tra tồn và thêm vào đơn</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                <Package className="h-4 w-4" />
                {inventorySummary.total} SP
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                Còn hàng: {inventorySummary.inStockCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                Sắp hết: {inventorySummary.lowStockCount}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
              <Input 
                className="h-10 sm:h-11 pl-12 rounded-lg border border-slate-200 bg-white focus:ring-4 focus:ring-sky-500/10 transition-all font-medium text-sm placeholder:text-slate-400" 
                placeholder="Quét mã hoặc tìm sản phẩm" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Button
              onClick={() => setShowSalesInfoModal(true)}
              variant="outline"
              className="h-10 sm:h-11 px-3 sm:px-4 rounded-lg border-slate-200 bg-white text-slate-700"
              title="Thông tin bán hàng"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              onClick={openCameraScanner}
              variant="outline"
              className="h-10 sm:h-11 px-3 sm:px-4 rounded-lg border-slate-200 bg-white text-slate-700"
              title="Quét bằng camera"
            >
              <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
              <ScanLine className="h-4 w-4 sm:h-5 sm:w-5 ml-1" />
            </Button>
          </div>
          {scanHint && <p className="text-xs text-sky-700">{scanHint}</p>}

          <div className="lg:hidden rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button type="button" onClick={() => setShowCustomerPicker(true)} className="h-11 w-full px-3 flex items-center justify-between border-b border-slate-100">
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800"><User className="h-4 w-4 text-slate-400" /><span className="truncate">{selectedCustomer?.name || 'Khách lẻ / khách ngoài'}</span></span>
              <span className="flex items-center gap-2 text-xs text-slate-500">Nợ: {formatCurrency(selectedCustomer?.totalDebt || 0)} <ChevronRight className="h-4 w-4 text-slate-400" /></span>
            </button>
            <div className="h-10 w-full px-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">Bảng giá chung · {currentUser?.name || 'Nhân viên'}</span>
              {selectedCustomer && <button type="button" onClick={() => selectCustomer(null)} className="text-xs text-sky-700">Bán khách lẻ</button>}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 sm:h-9 px-4 sm:px-5 rounded-lg font-medium whitespace-nowrap transition-all text-xs shadow-sm shrink-0 ${
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
        
        <div className="flex-1 lg:overflow-y-auto p-3 pb-28 sm:p-4 sm:pb-28 lg:pb-4">
          <div className="mb-2 lg:hidden">
            <button
              onClick={() => setShowMobileFilters((v) => !v)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
            </button>
            {showMobileFilters && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={mobileSortKey}
                  onChange={(e) => setMobileSortKey(e.target.value as any)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
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
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                >
                  <option value="all">Tất cả tồn kho</option>
                  <option value="in_stock">Còn hàng</option>
                  <option value="low_stock">Sắp hết</option>
                  <option value="out_of_stock">Hết hàng</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-0 lg:hidden rounded-lg border border-slate-200 bg-white overflow-hidden">
            {mobileVisibleProducts.map((product) => {
              const inCart = cart.find((line) => line.productId === product.id);
              const isOutOfStock = product.stock <= 0;
              const isLowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;
              return (
                <div key={product.id} className={`px-3 py-2.5 border-b border-slate-100 last:border-b-0 ${isOutOfStock ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">SP</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Chọn gợi ý bán</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[18px] leading-none font-semibold text-sky-700 tabular-nums">{formatCurrency(product.sellingPrice)}</span>
                        <span className={`text-[11px] ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-500'}`}>
                          {isOutOfStock ? 'Hết hàng' : `Tồn: ${product.stock}`}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {inCart ? (
                        <div className="inline-flex items-center rounded-xl border border-rose-300 bg-white p-1">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            className="h-7 w-7 rounded-md text-slate-500"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-slate-900 tabular-nums">{inCart.quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
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
                          onClick={() => addToCart(product)}
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

          <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="grid grid-cols-[90px_minmax(0,1fr)_55px_75px_105px_38px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Mã hàng</span><span>Tên hàng</span><span>ĐVT</span><span className="text-right">Tồn</span><span className="text-right">Giá bán</span><span />
            </div>
            {filteredProducts.map(product => {
              const inCart = cart.find((line) => line.productId === product.id);
              const out = product.stock <= 0;
              const low = product.stock > 0 && product.stock <= product.lowStockThreshold;
              return (
                <button key={product.id} type="button" disabled={out} onClick={() => addToCart(product)} className={`grid w-full grid-cols-[90px_minmax(0,1fr)_55px_75px_105px_38px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs last:border-0 ${out ? 'cursor-not-allowed opacity-50' : 'hover:bg-sky-50'} ${inCart ? 'bg-sky-50/70' : 'bg-white'}`}>
                  <span className="truncate font-mono text-[11px] text-slate-500">{product.sku}</span>
                  <span className="min-w-0 truncate font-medium text-slate-800">{product.name}</span>
                  <span className="text-slate-500">{product.unit}</span>
                  <span className={`text-right tabular-nums ${out ? 'text-rose-600' : low ? 'text-amber-600' : 'text-slate-700'}`}>{out ? 'Hết' : product.stock}</span>
                  <span className="text-right font-semibold tabular-nums text-sky-700">{formatCurrency(product.sellingPrice)}</span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md ${inCart ? 'bg-sky-600 text-white' : 'border border-slate-200 text-slate-500'}`}>{inCart ? inCart.quantity : '+'}</span>
                </button>
              );
            })}
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-slate-200 p-8 text-center space-y-4">
              <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-lg sm:rounded-lg bg-slate-100 flex items-center justify-center shadow-inner">
                <Search className="h-8 w-8 sm:h-10 sm:w-10 opacity-10" />
              </div>
              <p className="font-black text-slate-300 uppercase tracking-[0.3em] text-[8px] sm:text-[10px]">Dữ liệu trống</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="hidden w-full lg:flex lg:w-[350px] xl:w-[380px] 2xl:w-[420px] flex-col min-h-0 bg-white relative lg:shadow-[-20px_0_60px_rgba(0,0,0,0.03)] z-40 shrink-0">
        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-white lg:sticky lg:top-0 z-40 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`h-8 w-8 rounded-md bg-sky-600 text-white flex items-center justify-center transition-transform duration-300 ${cartPulse ? 'scale-110' : 'scale-100'}`}>
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 tracking-tight text-sm leading-none">Chi tiết đơn bán</h2>
              <p className="text-xs text-slate-400 mt-1">{cart.length} sản phẩm</p>
            </div>
          </div>
          {cart.length > 0 && (
            <button 
              onClick={() => setCart([])} 
              className="h-8 sm:h-10 px-3 sm:px-5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 font-medium transition-all text-xs ring-1 ring-slate-100"
            >
              Xóa
            </button>
          )}
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 p-3">
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
        </div>
        
        <div className="flex-none h-auto lg:flex-1 lg:overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-300 p-4 text-center space-y-4">
              <div className="h-20 w-20 sm:h-32 sm:w-32 rounded-lg sm:rounded-lg bg-slate-50 flex items-center justify-center shadow-inner">
                <ShoppingCart className="h-10 w-10 sm:h-14 sm:w-14 opacity-5" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-slate-400 text-xs">Giỏ đang trống</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3 pb-4">
               {cart.map(item => (
                 <POSCartItem 
                   key={item.productId}
                   item={item}
                   onUpdateQuantity={updateQuantity}
                   onRemove={removeFromCart}
                   onUpdateDiscount={updateLineDiscount}
                 />
               ))}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-50 bg-white shadow-[0_-20px_60px_rgba(0,0,0,0.04)] shrink-0">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={startNewOrder}
              className={`shrink-0 rounded-lg border px-2 py-1 text-xs ${activeOrderTab === 'live' ? 'border-sky-600 bg-sky-100 text-sky-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}
            >
              Đơn hiện tại
            </button>
            {drafts.slice(0, 5).map((draft) => (
              <div key={draft.id} className={`shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1 ${activeOrderTab === draft.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                <button
                  onClick={() => loadDraft(draft)}
                  className="text-xs text-slate-700"
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
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              value={orderDiscountType}
              onChange={(e) => setOrderDiscountType(e.target.value as 'percent' | 'amount')}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="amount">Giảm tổng (đ)</option>
              <option value="percent">Giảm tổng (%)</option>
            </select>
            <Input
              type="number"
              value={orderDiscountValue || ''}
              onChange={(e) => setOrderDiscountValue(Number(e.target.value))}
              placeholder="Giảm giá đơn"
              className="h-9 text-sm"
            />
            <Input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Ghi chú đơn"
              className="col-span-2 h-9 text-sm"
            />
          </div>
          <div className="flex justify-between items-end mb-4 sm:mb-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 pl-1">Phải thu</p>
              <div className="text-xl sm:text-3xl font-semibold text-slate-900 tabular-nums leading-none">{formatCurrency(finalAmount)}</div>
              {orderDiscountAmount > 0 && (
                <p className="text-xs text-emerald-700">Đã giảm: {formatCurrency(orderDiscountAmount)}</p>
              )}
            </div>
            <Button variant="outline" className="h-10 text-sm" disabled={cart.length === 0} onClick={saveDraft}>Lưu đơn</Button>
          </div>
          <Button 
            className="w-full h-12 sm:h-16 text-base sm:text-lg font-semibold rounded-lg sm:rounded-lg shadow-xl shadow-sky-900/20 bg-sky-600 hover:bg-sky-700 active:scale-[0.98] transition-all text-white group relative overflow-hidden" 
            disabled={cart.length === 0}
            onClick={() => setStep('payment')}
          >
            <span className="relative z-10 flex items-center gap-2">
              Thanh toán <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 group-hover:translate-x-2 transition-transform duration-500" />
            </span>
          </Button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 p-3 lg:hidden">
        <div className="rounded-t-xl border border-slate-200 bg-white px-3 pt-2 pb-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">Tổng tiền hàng</span>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-sky-300 px-2 text-sm font-medium text-sky-700">
                {cart.length}
              </span>
            </div>
            <span className="text-2xl font-semibold text-slate-900 tabular-nums">{formatCurrency(finalAmount)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" disabled={cart.length === 0} onClick={saveDraft}>
              Lưu tạm
            </Button>
            <Button className="h-11" disabled={cart.length === 0} onClick={() => setStep('payment')}>
              Thanh toán
            </Button>
          </div>
        </div>
      </div>

      {showCustomerPicker && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-900/40 p-3" onClick={() => { setShowCustomerPicker(false); setShowAddCustomer(false); }}>
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
              <div className="p-4">
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
                  )) : customerSearchTerm ? <p className="px-3 py-4 text-center text-xs text-slate-500">Không tìm thấy khách hàng phù hợp.</p> : <p className="px-3 py-4 text-center text-xs text-slate-500">Nhập tên hoặc số điện thoại để tìm.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSalesInfoModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/40 lg:hidden">
          <div className="h-full w-full bg-slate-100">
            <div className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between">
              <button onClick={() => setShowSalesInfoModal(false)} className="text-slate-500">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-xl font-semibold text-slate-900">Thông tin bán hàng</h3>
              <button onClick={() => setShowSalesInfoModal(false)} className="text-sky-600 font-medium">Xong</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                <div className="h-14 px-4 flex items-center justify-between">
                  <span className="text-slate-700">Người bán</span>
                  <span className="text-slate-900 font-medium">{currentUser?.name || 'N/A'}</span>
                </div>
                <div className="h-14 px-4 flex items-center justify-between">
                  <span className="text-slate-700">Kênh bán</span>
                  <span className="text-slate-900 font-medium">Bán trực tiếp</span>
                </div>
                <div className="h-14 px-4 flex items-center justify-between">
                  <span className="text-slate-700">Thời gian</span>
                  <span className="text-slate-900 font-medium">{new Date().toLocaleString('vi-VN')}</span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value.slice(0, 1000))}
                  placeholder="Ghi chú..."
                  className="w-full h-40 resize-none outline-none text-base text-slate-800 placeholder:text-slate-400"
                />
                <div className="text-right text-sm text-slate-500">{orderNote.length}/1000</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * {
            visibility: hidden;
            background: white !important;
          }
          #printable-invoice, #printable-invoice * {
            visibility: visible;
          }
          #printable-invoice {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            padding: 20px;
            margin: 0;
            background: white;
            z-index: 9999;
          }
        }
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
