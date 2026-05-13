import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Boxes } from 'lucide-react';
import { authApi } from '../lib/api';

export default function Login({ isRegister = false }: { isRegister?: boolean }) {
  const { setActiveTenant, setCurrentUser } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const session = isRegister
        ? await authApi.register(fullName, email, password, storeName)
        : await authApi.login(email, password);

      authApi.saveSession(session.token);
      setActiveTenant(session.tenant);
      setCurrentUser(session.user);
      navigate(session.tenant?.status === 'pending_setup' ? '/onboarding' : '/app/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-sky-100/30 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-slate-200/50 blur-[120px]"></div>
      </div>

      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-lg bg-white shadow-xl shadow-sky-900/10 mb-6 group transition-all duration-500 hover:scale-110">
            <div className="h-10 w-10 rounded-lg bg-sky-600 flex items-center justify-center text-white">
              <Boxes className="h-6 w-6" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 font-display tracking-tight mb-2 uppercase italic tracking-tighter">TDPOS</h1>
          <p className="text-slate-500 font-medium">
            {isRegister ? 'Khởi tạo workspace quản trị cho doanh nghiệp của bạn' : 'Nền tảng POS và vận hành SaaS đa lĩnh vực'}
          </p>
        </div>

        <div className="bg-white p-10 rounded-lg shadow-2xl shadow-sky-900/5 border border-white">
          <form onSubmit={handleLogin} className="space-y-6">
            {isRegister && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Họ và tên</label>
                  <Input 
                    required
                    className="h-14 px-5 rounded-lg border-none bg-slate-50 shadow-inner font-semibold"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ví dụ: Trần Văn Kiên" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Tên cửa hàng</label>
                  <Input 
                    required
                    className="h-14 px-5 rounded-lg border-none bg-slate-50 shadow-inner font-semibold"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ví dụ: Cửa hàng Trần Đào POS" 
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email đăng nhập</label>
              <Input 
                required
                type="email" 
                className="h-14 px-5 rounded-lg border-none bg-slate-50 shadow-inner font-semibold"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email đăng nhập" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
              <Input 
                required
                type="password" 
                className="h-14 px-5 rounded-lg border-none bg-slate-50 shadow-inner font-semibold"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'Tạo mật khẩu (tối thiểu 6 ký tự)' : 'Nhập mật khẩu tài khoản'} 
              />
            </div>
            
            {!isRegister && (
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span className="text-sm font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Ghi nhớ</span>
                </label>
                <button type="button" className="text-sm font-bold text-sky-600 hover:text-sky-700 transition-colors">Quên mật khẩu?</button>
              </div>
            )}

            <Button type="submit" className="w-full h-16 text-lg font-black uppercase tracking-widest rounded-lg bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-900/20 active:scale-[0.98] transition-all">
              {submitting ? 'Đang xử lý...' : isRegister ? 'Tạo tài khoản ngay' : 'Đăng nhập ngay'}
            </Button>
            {error && (
              <p className="text-center text-sm font-bold text-red-500">{error}</p>
            )}
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400 font-medium">
              {isRegister ? (
                <>Đã có tài khoản? <button onClick={() => navigate('/login')} className="text-sky-600 font-bold hover:underline">Đăng nhập</button></>
              ) : (
                <>Bạn chưa có tài khoản? <button onClick={() => navigate('/register')} className="text-sky-600 font-bold hover:underline">Đăng ký ngay</button></>
              )}
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cloud POS Platform</span>
          </div>
        </div>
      </div>
    </div>
  );
}
