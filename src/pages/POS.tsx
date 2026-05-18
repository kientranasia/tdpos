import { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Customer, PaymentMethod, InvoiceItem, Invoice } from '../types';
import { formatCurrency } from '../lib/utils';
import { Search, X, CheckCircle, ShoppingCart, Wallet, TrendingUp, Package, Printer, ChevronRight, AlertCircle, Plus, MapPin, Phone, User, ScanLine, Camera } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { v4 as uuid } from 'uuid';

// Components
import { POSProductCard } from '../components/pos/POSProductCard';
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
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const isCashier = currentUser?.role === 'cashier';

  const invoiceRef = useRef<HTMLDivElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<number | null>(null);
  const scannerBufferRef = useRef('');
  const scannerLastKeyTimeRef = useRef(0);
  const addedPulseTimerRef = useRef<number | null>(null);
  const cartPulseTimerRef = useRef<number | null>(null);
  const draftStorageKey = activeTenant?.id ? `tdpos_pos_drafts_${activeTenant.id}` : 'tdpos_pos_drafts';

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
  const orderDiscountAmount = useMemo(() => {
    if (orderDiscountType === 'percent') {
      return Math.min(totalAmount, Math.max(0, (totalAmount * (Number(orderDiscountValue) || 0)) / 100));
    }
    return Math.min(totalAmount, Math.max(0, Number(orderDiscountValue) || 0));
  }, [orderDiscountType, orderDiscountValue, totalAmount]);
  const finalAmount = Math.max(0, totalAmount - orderDiscountAmount);

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
    setMobileCartOpen(false);
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
      <div className="flex h-full flex-col bg-slate-900/5 lg:bg-slate-50">
        <div className="hidden p-6 lg:flex items-center justify-between sticky top-0 z-40 border-b border-sky-100/30 bg-white">
          <Button variant="ghost" size="sm" onClick={() => setStep('cart')} className="h-11 px-5 rounded-lg font-medium text-slate-600 hover:text-sky-700 flex items-center gap-2">
            <ChevronRight className="h-5 w-5 rotate-180" /> Trở lại
          </Button>
          <h2 className="font-semibold text-slate-900 text-lg">Thanh toán</h2>
          <div className="h-10 w-10"></div>
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-0 overflow-y-auto lg:static lg:inset-auto lg:p-6 lg:space-y-10 lg:max-w-2xl lg:mx-auto lg:w-full lg:animate-in lg:slide-in-from-bottom-4 lg:duration-500">
            <div className="mt-3 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl lg:mt-0 lg:rounded-lg lg:p-6 lg:shadow-none">
              <div className="mb-4 flex items-center justify-between lg:hidden">
                <Button variant="ghost" size="sm" onClick={() => setStep('cart')} className="h-9 px-3 rounded-lg font-medium text-slate-600 hover:text-sky-700 flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 rotate-180" /> Trở lại
                </Button>
                <h2 className="font-semibold text-slate-900">Thanh toán</h2>
                <div className="w-14" />
              </div>

        {formError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {formError}
          </div>
        )}
        <div className="bg-slate-50 p-4 lg:p-6 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-xs font-medium text-slate-500 leading-none mb-1">Khách cần trả</p>
              <div className="text-3xl font-semibold text-sky-700 tabular-nums leading-none">{formatCurrency(finalAmount)}</div>
              {orderDiscountAmount > 0 && (
                <p className="text-xs text-emerald-700">Giảm: {formatCurrency(orderDiscountAmount)}</p>
              )}
            </div>
            <div className="h-14 w-14 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 shadow-inner">
              <Wallet className="h-7 w-7" />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-medium text-slate-500 pl-1">Khách hàng</h3>
            <div className="relative">
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-focus-within:text-sky-600 transition-colors" />
                <Input 
                   className="h-12 pl-12 pr-12 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-sky-500/20 transition-all font-medium text-slate-900 text-sm placeholder:text-slate-400" 
                   placeholder="Tìm theo tên hoặc số điện thoại"
                   value={customerSearchTerm}
                   onChange={(e) => {
                     setCustomerSearchTerm(e.target.value);
                     setShowCustomerResults(true);
                   }}
                   onFocus={() => setShowCustomerResults(true)}
                />
                {selectedCustomer && (
                   <button 
                     onClick={() => {
                       setSelectedCustomer(null);
                       setCustomerSearchTerm('');
                     }}
                     className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all"
                   >
                     <X className="h-4 w-4" />
                   </button>
                )}
              </div>

              {showCustomerResults && customerSearchTerm && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-2xl border border-slate-50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                  {filteredCustomers.length > 0 ? (
                    <div className="divide-y divide-slate-50">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          className="w-full p-5 hover:bg-sky-50 text-left transition-colors flex items-center justify-between group"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearchTerm(c.name);
                            setShowCustomerResults(false);
                          }}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.phone}</div>
                          </div>
                          <div className="h-8 w-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-all">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Không tìm thấy khách hàng
                    </div>
                  )}
                </div>
              )}

              {!customerSearchTerm && !selectedCustomer && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-center gap-3 px-6">
                    <div className="h-2 w-2 rounded-full bg-slate-200 animate-pulse" />
                    <p className="text-xs text-slate-500">Mặc định: Khách vãng lai</p>
                  </div>
                  
                  {!showAddCustomer && (
                    <Button 
                      onClick={() => setShowAddCustomer(true)}
                      disabled={isCashier}
                      className="mx-6 h-11 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-700 border-none shadow-none text-sm gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Thêm khách hàng mới</span>
                    </Button>
                  )}
                </div>
              )}

              {showAddCustomer && (
                <div className="mt-4 bg-sky-50/50 rounded-lg p-6 border border-sky-100/50 space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex justify-between items-center px-2">
                    <h4 className="text-xs font-semibold text-sky-800">Đăng ký khách mới</h4>
                    <button onClick={() => setShowAddCustomer(false)} className="text-sky-400 hover:text-red-500 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-300" />
                      <Input 
                        placeholder="Nhập tên khách hàng" 
                        className="h-12 pl-12 rounded-lg border-sky-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.name}
                        onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-300" />
                      <Input 
                        placeholder="Nhập số điện thoại" 
                        className="h-12 pl-12 rounded-lg border-sky-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.phone}
                        onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                      />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-300" />
                      <Input 
                        placeholder="Địa chỉ (không bắt buộc)" 
                        className="h-12 pl-12 rounded-lg border-sky-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.address}
                        onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                      />
                    </div>
                    <Button 
                      className="w-full h-12 rounded-lg bg-sky-600 hover:bg-sky-700 font-semibold text-white shadow-lg shadow-sky-900/20"
                      onClick={handleCreateCustomer}
                    >
                      Lưu & Chọn khách hàng
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Click outside backdrop for results */}
            {showCustomerResults && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowCustomerResults(false)}
              />
            )}
            
            {selectedCustomer && (
               <div className="flex items-center justify-between p-6 rounded-lg bg-orange-50 border border-orange-100/50 backdrop-blur-sm animate-in slide-in-from-top-4 duration-500">
                 <div className="flex items-center gap-5">
                   <div className="h-14 w-14 rounded-lg bg-white shadow-sm flex items-center justify-center text-orange-600">
                     <AlertCircle className="h-6 w-6" />
                   </div>
                   <div>
                     <span className="text-xs font-medium text-orange-800 block opacity-70 mb-1">Số dư nợ cũ</span>
                     <span className="font-semibold text-2xl text-orange-600 tabular-nums">{formatCurrency(selectedCustomer.totalDebt)}</span>
                   </div>
                 </div>
               </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-medium text-slate-500 pl-1">Hình thức thanh toán</h3>
            <div className="grid grid-cols-3 gap-3 px-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-lg border-2 transition-all duration-300 ${
                  paymentMethod === 'cash' 
                  ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-lg shadow-sky-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-lg transition-all duration-500 ${paymentMethod === 'cash' ? 'bg-sky-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span className="font-medium text-xs">Tiền mặt</span>
              </button>
              
              <button
                onClick={() => setPaymentMethod('transfer')}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-lg border-2 transition-all duration-300 ${
                  paymentMethod === 'transfer' 
                  ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-lg shadow-sky-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-lg transition-all duration-500 ${paymentMethod === 'transfer' ? 'bg-sky-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="font-medium text-xs">Chuyển khoản</span>
              </button>

              <button
                onClick={() => setPaymentMethod('debt')}
                disabled={isCashier}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-lg border-2 transition-all duration-300 ${
                  paymentMethod === 'debt' 
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-lg shadow-orange-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-lg transition-all duration-500 ${paymentMethod === 'debt' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="font-medium text-xs">Ghi nợ</span>
              </button>
            </div>
            
            {paymentMethod === 'debt' && !selectedCustomer && (
              <div className="mx-2 bg-orange-50 border border-orange-100 p-4 rounded-lg flex items-center gap-3 animate-bounce">
                <AlertCircle className="h-5 w-5 text-orange-600 shrink-0" />
                <p className="text-orange-700 text-xs font-medium leading-tight">Vui lòng chọn khách hàng để ghi nợ.</p>
            </div>
          )}
          </div>
        </div>
        </div>

        <div className="p-4 sm:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-100 fixed bottom-0 left-0 right-0 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="max-w-2xl mx-auto">
            <Button 
              className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold rounded-lg shadow-xl shadow-sky-900/30 bg-sky-600 hover:bg-sky-700 active:scale-[0.98] transition-all group relative overflow-hidden" 
              onClick={handleCheckout}
              disabled={paymentMethod === 'debt' && !selectedCustomer}
            >
              <span className="relative z-10">Hoàn tất giao dịch</span>
              <div className="absolute inset-0 bg-gradient-to-r from-sky-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            </Button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full lg:flex-row bg-slate-50 overflow-y-auto lg:overflow-hidden font-sans relative">
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
          <div className="hidden lg:flex items-center justify-between gap-4 pb-2">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg">
                <ShoppingCart className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-page-title">Bán hàng POS</h1>
                <p className="text-page-subtitle">Tìm và lên đơn nhanh theo tồn kho thực tế</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">
                <Package className="h-4 w-4" />
                {inventorySummary.total} SP
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">
                Còn hàng: {inventorySummary.inStockCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700">
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
          <div className="mb-2 grid grid-cols-2 gap-2 lg:hidden">
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

          <div className="space-y-2 lg:hidden">
            {mobileVisibleProducts.map((product) => {
              const inCart = cart.find((line) => line.productId === product.id);
              const isOutOfStock = product.stock <= 0;
              const isLowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;
              return (
                <div key={product.id} className={`rounded-lg border bg-white p-3 ${isOutOfStock ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">SP</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.sku}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-sky-700 tabular-nums">{formatCurrency(product.sellingPrice)}</span>
                        <span className={`status-chip ${isOutOfStock ? 'status-chip-danger' : isLowStock ? 'status-chip-warning' : 'status-chip-info'}`}>
                          {isOutOfStock ? 'Hết hàng' : `${product.stock} ${product.unit}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    {inCart ? (
                      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="h-8 w-8 rounded-md text-slate-500 hover:bg-white"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-slate-900 tabular-nums">{inCart.quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          disabled={inCart.quantity >= inCart.maxStock}
                          className="h-8 w-8 rounded-md bg-sky-600 text-white disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <Button
                        className="h-9 px-3 text-sm"
                        disabled={isOutOfStock}
                        onClick={() => addToCart(product)}
                      >
                        Thêm
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden lg:grid lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            {filteredProducts.map(product => (
              <POSProductCard 
                key={product.id}
                product={product}
                onClick={() => addToCart(product)}
                isAdded={lastAddedProductId === product.id}
              />
            ))}
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
        <div className="p-4 sm:p-8 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-xl lg:sticky lg:top-0 z-40 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transition-transform duration-300 ${cartPulse ? 'scale-110' : 'scale-100'}`}>
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 tracking-tight text-base sm:text-lg leading-none">Giỏ hàng</h2>
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
        <button
          onClick={() => setMobileCartOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-sky-500/20 bg-sky-600 px-4 py-3 text-white shadow-lg shadow-sky-900/25"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-sm font-semibold">Giỏ hàng ({cart.length})</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(finalAmount)}</span>
        </button>
      </div>

      {mobileCartOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Giỏ hàng</h3>
                <p className="text-xs text-slate-500">{cart.length} sản phẩm</p>
              </div>
              <button onClick={() => setMobileCartOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Giỏ đang trống.</p>
              ) : (
                cart.map((item) => (
                  <POSCartItem
                    key={item.productId}
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeFromCart}
                    onUpdateDiscount={updateLineDiscount}
                  />
                ))
              )}
            </div>

            <div className="border-t border-slate-100 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={orderDiscountType}
                  onChange={(e) => setOrderDiscountType(e.target.value as 'percent' | 'amount')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="amount">Giảm tổng (đ)</option>
                  <option value="percent">Giảm tổng (%)</option>
                </select>
                <Input
                  type="number"
                  value={orderDiscountValue || ''}
                  onChange={(e) => setOrderDiscountValue(Number(e.target.value))}
                  placeholder="Giảm giá đơn"
                  className="h-10 text-sm"
                />
                <Input
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  placeholder="Ghi chú đơn"
                  className="col-span-2 h-10 text-sm"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Phải thu</span>
                <span className="text-lg font-semibold text-slate-900 tabular-nums">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" disabled={cart.length === 0} onClick={saveDraft}>
                  Lưu đơn
                </Button>
                <Button
                  className="h-11"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setMobileCartOpen(false);
                    setStep('payment');
                  }}
                >
                  Thanh toán
                </Button>
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
