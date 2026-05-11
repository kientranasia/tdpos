import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { mockTenants } from '../data/mock';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Leaf } from 'lucide-react';

export default function Login({ isRegister = false }: { isRegister?: boolean }) {
  const { setActiveTenant } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState(isRegister ? '' : 'admin@lienminh.vn');
  const [password, setPassword] = useState(isRegister ? '' : '123456');
  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      // Create draft tenant and go to onboarding
      setActiveTenant({
        id: `T${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        name: storeName,
        status: 'pending_setup',
        phone: '',
        address: '',
        legalName: '',
        invoicePrefix: '',
        settings: {
          lowStockThresholdDefault: 10,
          enabledPaymentMethods: ['cash'],
          debtPolicy: {
            allowDebt: true,
            maxDebtAmount: 0,
            maxDebtDays: 0
          },
          workingHours: {
            open: '08:00',
            close: '17:00'
          },
          defaultLanguage: 'vi'
        }
      });
      navigate('/onboarding');
    } else {
      // Simulate login success - set default tenant
      setActiveTenant(mockTenants[0]);
      navigate('/app/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-100/30 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-slate-200/50 blur-[120px]"></div>
      </div>

      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-xl shadow-emerald-900/10 mb-6 group transition-all duration-500 hover:scale-110">
            <div className="h-10 w-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white">
              <Leaf className="h-6 w-6" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 font-display tracking-tight mb-2 uppercase italic tracking-tighter">TDPOS</h1>
          <p className="text-slate-500 font-medium">
            {isRegister ? 'Khởi tạo hệ thống quản lý cho cửa hàng của bạn' : 'Hệ thống quản lý vật tư nông nghiệp hiện đại'}
          </p>
        </div>

        <div className="bg-white p-10 rounded-[40px] shadow-2xl shadow-emerald-900/5 border border-white">
          <form onSubmit={handleLogin} className="space-y-6">
            {isRegister && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Họ và tên</label>
                  <Input 
                    required
                    className="h-14 px-5 rounded-2xl border-none bg-slate-50 shadow-inner font-semibold"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Tên cửa hàng</label>
                  <Input 
                    required
                    className="h-14 px-5 rounded-2xl border-none bg-slate-50 shadow-inner font-semibold"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Vật tư nông nghiệp TDPOS" 
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email đăng nhập</label>
              <Input 
                required
                type="email" 
                className="h-14 px-5 rounded-2xl border-none bg-slate-50 shadow-inner font-semibold"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tdpos.vn" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
              <Input 
                required
                type="password" 
                className="h-14 px-5 rounded-2xl border-none bg-slate-50 shadow-inner font-semibold"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
              />
            </div>
            
            {!isRegister && (
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Ghi nhớ</span>
                </label>
                <button type="button" className="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors">Quên mật khẩu?</button>
              </div>
            )}

            <Button type="submit" className="w-full h-16 text-lg font-black uppercase tracking-widest rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-900/20 active:scale-[0.98] transition-all">
              {isRegister ? 'Tạo tài khoản ngay' : 'Đăng nhập ngay'}
            </Button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400 font-medium">
              {isRegister ? (
                <>Đã có tài khoản? <button onClick={() => navigate('/login')} className="text-emerald-600 font-bold hover:underline">Đăng nhập</button></>
              ) : (
                <>Bạn chưa có tài khoản? <button onClick={() => navigate('/register')} className="text-emerald-600 font-bold hover:underline">Đăng ký ngay</button></>
              )}
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Powered by TRANDAO Investment</span>
          </div>
        </div>
      </div>
    </div>
  );
}
