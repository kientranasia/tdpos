import { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Customer, PaymentMethod, InvoiceItem, Invoice } from '../types';
import { formatCurrency } from '../lib/utils';
import { Search, X, CheckCircle, ShoppingCart, Users, Wallet, TrendingUp, Package, Printer, ChevronRight, AlertCircle, Plus, MapPin, Phone, User } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { toPng } from 'html-to-image';
import download from 'downloadjs';

// Components
import { POSProductCard } from '../components/pos/POSProductCard';
import { POSCartItem } from '../components/pos/POSCartItem';
import { POSInvoiceModal } from '../components/pos/POSInvoiceModal';

export default function POS() {
  const { products, customers, activeTenant, currentUser, addInvoice, updateProductStock, updateCustomerDebt, addCustomer, categories: appCategories } = useApp();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<(InvoiceItem & { maxStock: number })[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [step, setStep] = useState<'cart' | 'payment' | 'success'>('cart');
  const [lastInvoiceId, setLastInvoiceId] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<InvoiceItem[]>([]);

  const invoiceRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    return ['All', ...appCategories.map(c => c.name)];
  }, [appCategories]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) || 
      c.phone.includes(customerSearchTerm)
    ).slice(0, 5);
  }, [customers, customerSearchTerm]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        );
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        invoiceId: '',
        productId: product.id,
        productName: product.name,
        price: product.sellingPrice,
        quantity: 1,
        total: product.sellingPrice,
        maxStock: product.stock
      }];
    });
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

  const handleCheckout = () => {
    if (!activeTenant || !currentUser || cart.length === 0) return;
    if (paymentMethod === 'debt' && !selectedCustomer) {
      alert("Vui lòng chọn khách hàng để ghi nợ");
      return;
    }

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      tenantId: activeTenant.id,
      customerId: selectedCustomer?.id || null,
      createdBy: currentUser.id,
      totalAmount,
      discount: 0,
      finalAmount: totalAmount,
      paidAmount: paymentMethod === 'debt' ? 0 : totalAmount,
      debtAmount: paymentMethod === 'debt' ? totalAmount : 0,
      paymentMethod,
      status: paymentMethod === 'debt' ? 'unpaid' : 'completed',
      createdAt: new Date().toISOString()
    };

    addInvoice(newInvoice);
    cart.forEach(item => {
      updateProductStock(item.productId, item.quantity);
    });
    
    if (paymentMethod === 'debt' && selectedCustomer) {
      updateCustomerDebt(selectedCustomer.id, totalAmount, 'increase');
    }

    setLastInvoiceId(newInvoice.id);
    setCurrentInvoice(newInvoice);
    const itemsWithInvoiceId = cart.map(item => ({ ...item, invoiceId: newInvoice.id }));
    setCurrentInvoiceItems(itemsWithInvoiceId);
    
    setStep('success');
    setCart([]);
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
  };

  const handleCreateCustomer = () => {
    if (!newCustomer.name || !newCustomer.phone || !activeTenant) {
      alert("Vui lòng nhập tên và số điện thoại");
      return;
    }

    const customer: Customer = {
      id: `C${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
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

  if (step === 'success') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 bg-slate-50 text-center animate-in fade-in zoom-in duration-300">
        <div className="h-28 w-28 rounded-full bg-emerald-100 flex items-center justify-center mb-8 shadow-sm ring-4 ring-emerald-50">
          <CheckCircle className="h-14 w-14 text-emerald-600" />
        </div>
        <h2 className="text-4xl font-black text-slate-900 font-display mb-3 tracking-tighter uppercase">Thành công!</h2>
        <p className="text-slate-500 font-medium mb-10 text-lg">Mã hóa đơn <span className="text-emerald-700 font-bold">{lastInvoiceId}</span> đã được ghi nhận.</p>
        
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <Button 
            className="h-16 rounded-[24px] bg-emerald-600 hover:bg-emerald-700 shadow-2xl shadow-emerald-900/40 font-black text-xl uppercase tracking-widest transition-all hover:scale-105 active:scale-95" 
            onClick={() => setShowInvoice(true)}
          >
            <Printer className="mr-2 h-6 w-6" /> Xuất hóa đơn
          </Button>
          <Button 
            variant="ghost" 
            className="h-14 rounded-2xl text-slate-400 font-black uppercase tracking-widest hover:text-slate-900" 
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
      <div className="flex flex-col h-full bg-slate-50">
        <div className="p-6 glass flex items-center justify-between sticky top-0 z-40 border-b border-emerald-100/30">
          <Button variant="ghost" size="sm" onClick={() => setStep('cart')} className="h-12 px-6 rounded-2xl font-black text-slate-500 uppercase tracking-widest hover:text-emerald-700 flex items-center gap-2">
            <ChevronRight className="h-5 w-5 rotate-180" /> Trở lại
          </Button>
          <h2 className="font-black text-slate-900 font-display text-xl tracking-tight uppercase">Thanh toán</h2>
          <div className="h-10 w-10"></div>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-10 max-w-2xl mx-auto w-full pb-40 animate-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-emerald-900/5 border border-white flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none mb-1">Tổng cộng hóa đơn</p>
              <div className="text-3xl font-black text-emerald-700 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(totalAmount)}</div>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner">
              <Wallet className="h-7 w-7" />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] pl-6">Xác nhận khách hàng</h3>
            <div className="relative">
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
                <Input 
                   className="h-14 pl-14 pr-12 rounded-[24px] border-none bg-white shadow-lg shadow-emerald-900/5 ring-1 ring-slate-100 focus:ring-4 focus:ring-emerald-500/20 transition-all font-bold text-slate-900 text-lg placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
                   placeholder="TÌM THEO TÊN HOẶC SĐT..."
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
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                  {filteredCustomers.length > 0 ? (
                    <div className="divide-y divide-slate-50">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          className="w-full p-5 hover:bg-emerald-50 text-left transition-colors flex items-center justify-between group"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearchTerm(c.name);
                            setShowCustomerResults(false);
                          }}
                        >
                          <div>
                            <div className="font-black text-slate-900 uppercase italic tracking-tight">{c.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 font-mono">{c.phone}</div>
                          </div>
                          <div className="h-8 w-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-300 font-black uppercase tracking-widest text-[9px]">
                      Không tìm thấy khách hàng
                    </div>
                  )}
                </div>
              )}

              {!customerSearchTerm && !selectedCustomer && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-center gap-3 px-6">
                    <div className="h-2 w-2 rounded-full bg-slate-200 animate-pulse" />
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Đang mặc định: Khách vãng lai</p>
                  </div>
                  
                  {!showAddCustomer && (
                    <Button 
                      onClick={() => setShowAddCustomer(true)}
                      className="mx-6 h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-none shadow-none font-black text-[10px] uppercase tracking-widest gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Thêm khách hàng mới</span>
                    </Button>
                  )}
                </div>
              )}

              {showAddCustomer && (
                <div className="mt-4 bg-emerald-50/50 rounded-[40px] p-6 border border-emerald-100/50 space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex justify-between items-center px-2">
                    <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Đăng ký khách mới</h4>
                    <button onClick={() => setShowAddCustomer(false)} className="text-emerald-400 hover:text-red-500 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
                      <Input 
                        placeholder="TÊN KHÁCH HÀNG..." 
                        className="h-12 pl-12 rounded-2xl border-emerald-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.name}
                        onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
                      <Input 
                        placeholder="SỐ ĐIỆN THOẠI..." 
                        className="h-12 pl-12 rounded-2xl border-emerald-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.phone}
                        onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                      />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
                      <Input 
                        placeholder="ĐỊA CHỈ (KHÔNG BẮT BUỘC)..." 
                        className="h-12 pl-12 rounded-2xl border-emerald-100 bg-white placeholder:text-slate-200 text-sm font-bold"
                        value={newCustomer.address}
                        onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                      />
                    </div>
                    <Button 
                      className="w-full h-14 rounded-[20px] bg-emerald-600 hover:bg-emerald-700 font-black text-white uppercase tracking-widest shadow-lg shadow-emerald-900/20"
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
               <div className="flex items-center justify-between p-6 rounded-[32px] bg-orange-50 border border-orange-100/50 backdrop-blur-sm animate-in slide-in-from-top-4 duration-500">
                 <div className="flex items-center gap-5">
                   <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-orange-600">
                     <AlertCircle className="h-6 w-6" />
                   </div>
                   <div>
                     <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest block opacity-50 mb-1">Số dư nợ cũ</span>
                     <span className="font-black text-2xl text-orange-600 tabular-nums tracking-tighter">{formatCurrency(selectedCustomer.totalDebt)}</span>
                   </div>
                 </div>
               </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] pl-6">Hình thức thanh toán</h3>
            <div className="grid grid-cols-3 gap-3 px-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-3xl border-2 transition-all duration-300 ${
                  paymentMethod === 'cash' 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-xl transition-all duration-500 ${paymentMethod === 'cash' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span className="font-black text-[10px] uppercase tracking-tight">Tiền mặt</span>
              </button>
              
              <button
                onClick={() => setPaymentMethod('transfer')}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-3xl border-2 transition-all duration-300 ${
                  paymentMethod === 'transfer' 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-xl transition-all duration-500 ${paymentMethod === 'transfer' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="font-black text-[10px] uppercase tracking-tight">Chuyển khoản</span>
              </button>

              <button
                onClick={() => setPaymentMethod('debt')}
                className={`group flex flex-col items-center justify-center gap-3 p-4 rounded-3xl border-2 transition-all duration-300 ${
                  paymentMethod === 'debt' 
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-lg shadow-orange-900/10' 
                  : 'border-white bg-white text-slate-400 hover:border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-3 rounded-xl transition-all duration-500 ${paymentMethod === 'debt' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-50'}`}>
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="font-black text-[10px] uppercase tracking-tight">Ghi nợ</span>
              </button>
            </div>
            
            {paymentMethod === 'debt' && !selectedCustomer && (
              <div className="mx-2 bg-orange-50 border border-orange-100 p-4 rounded-2xl flex items-center gap-3 animate-bounce">
                <AlertCircle className="h-5 w-5 text-orange-600 shrink-0" />
                <p className="text-orange-700 text-[9px] font-black uppercase tracking-widest leading-tight">Vui lòng chọn khách hàng để ghi nợ!</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-white/80 backdrop-blur-xl border-t border-slate-100 fixed bottom-0 left-0 right-0 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="max-w-2xl mx-auto">
            <Button 
              className="w-full h-14 sm:h-16 text-lg sm:text-xl font-black rounded-2xl sm:rounded-3xl shadow-xl shadow-emerald-900/30 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all uppercase tracking-[0.15em] group relative overflow-hidden" 
              onClick={handleCheckout}
              disabled={paymentMethod === 'debt' && !selectedCustomer}
            >
              <span className="relative z-10">Hoàn tất giao dịch</span>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full lg:flex-row bg-slate-50 overflow-y-auto lg:overflow-hidden font-sans relative">
      {/* Product List Section */}
      <div className="w-full lg:flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200/50 bg-slate-50 relative shrink-0">
          <div className="p-3 sm:p-5 space-y-3 bg-white/80 backdrop-blur-xl sticky top-0 z-40 border-b border-slate-100 shadow-sm shrink-0">
          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
            <Input 
              className="h-10 sm:h-12 pl-12 rounded-xl border-none bg-slate-100/50 shadow-inner focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-xs sm:text-sm placeholder:text-slate-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest" 
              placeholder="QUÉT MÃ HOẶC TÌM KIẾM..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 sm:h-10 px-4 sm:px-6 rounded-xl sm:rounded-2xl font-black whitespace-nowrap transition-all text-[8px] sm:text-[9px] uppercase tracking-widest shadow-sm shrink-0 ${
                  selectedCategory === cat 
                  ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/20 ring-4 ring-emerald-50' 
                  : 'bg-white text-slate-400 hover:bg-slate-50 ring-1 ring-slate-100'
                }`}
              >
                {cat === 'All' ? 'Tất cả' : cat}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 lg:overflow-y-auto p-3 sm:p-6 pb-20 lg:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-6">
            {filteredProducts.map(product => (
              <POSProductCard 
                key={product.id}
                product={product}
                onClick={() => addToCart(product)}
              />
            ))}
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-slate-200 p-8 text-center space-y-4">
              <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-3xl sm:rounded-[40px] bg-slate-100 flex items-center justify-center shadow-inner">
                <Search className="h-8 w-8 sm:h-10 sm:w-10 opacity-10" />
              </div>
              <p className="font-black text-slate-300 uppercase tracking-[0.3em] text-[8px] sm:text-[10px]">Dữ liệu trống</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[350px] xl:w-[380px] 2xl:w-[420px] flex flex-col min-h-0 bg-white relative lg:shadow-[-20px_0_60px_rgba(0,0,0,0.03)] z-40 shrink-0">
        <div className="p-4 sm:p-8 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-xl lg:sticky lg:top-0 z-40 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 font-display tracking-tight text-base sm:text-lg uppercase leading-none">Giỏ hàng</h2>
              <p className="text-[7px] sm:text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">{cart.length} sản phẩm</p>
            </div>
          </div>
          {cart.length > 0 && (
            <button 
              onClick={() => setCart([])} 
              className="h-8 sm:h-10 px-3 sm:px-5 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 font-black transition-all text-[8px] sm:text-[9px] uppercase tracking-widest ring-1 ring-slate-100"
            >
              Xóa
            </button>
          )}
        </div>
        
        <div className="flex-none h-auto lg:flex-1 lg:overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-300 p-4 text-center space-y-4">
              <div className="h-20 w-20 sm:h-32 sm:w-32 rounded-[40px] sm:rounded-[56px] bg-slate-50 flex items-center justify-center shadow-inner">
                <ShoppingCart className="h-10 w-10 sm:h-14 sm:w-14 opacity-5" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-slate-400 uppercase tracking-[0.2em] text-[8px] sm:text-[10px]">Giỏ đang trống</p>
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
                 />
               ))}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-50 bg-white shadow-[0_-20px_60px_rgba(0,0,0,0.04)] shrink-0">
          <div className="flex justify-between items-end mb-4 sm:mb-6">
            <div className="space-y-1">
              <p className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1 opacity-60">Phải thu</p>
              <div className="text-xl sm:text-3xl font-black text-slate-900 font-display tabular-nums tracking-tighter leading-none">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
          <Button 
            className="w-full h-12 sm:h-16 text-base sm:text-xl font-black rounded-xl sm:rounded-2xl shadow-xl shadow-emerald-900/20 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white uppercase tracking-widest group relative overflow-hidden" 
            disabled={cart.length === 0}
            onClick={() => setStep('payment')}
          >
            <span className="relative z-10 flex items-center gap-2">
              Thanh toán <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 group-hover:translate-x-2 transition-transform duration-500" />
            </span>
          </Button>
        </div>
      </div>

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
