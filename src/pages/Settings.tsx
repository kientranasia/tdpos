import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { backupsApi, licenseApi, permissionsApi, systemApi, usersApi } from '../lib/api';
import { User } from '../types';
import { Save, Settings2, ShieldCheck, Store, Users } from 'lucide-react';

type SettingsTab = 'profile' | 'system' | 'invoice' | 'users';

export default function Settings() {
  const { activeTenant, currentUser, updateTenant } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: activeTenant?.name || '',
    legalName: activeTenant?.legalName || '',
    taxInfo: activeTenant?.taxInfo || '',
    address: activeTenant?.address || '',
    phone: activeTenant?.phone || '',
    invoicePrefix: activeTenant?.invoicePrefix || 'INV',
    lowStockThreshold: activeTenant?.settings?.lowStockThresholdDefault || 10,
    allowDebt: activeTenant?.settings?.debtPolicy?.allowDebt ?? true,
    maxDebtAmount: activeTenant?.settings?.debtPolicy?.maxDebtAmount || 50000000,
    maxDebtDays: activeTenant?.settings?.debtPolicy?.maxDebtDays || 30,
    openTime: activeTenant?.settings?.workingHours?.open || '07:00',
    closeTime: activeTenant?.settings?.workingHours?.close || '18:00',
    invoiceStoreDisplayName: activeTenant?.settings?.invoice?.storeDisplayName || '',
    invoiceHeaderLine1: activeTenant?.settings?.invoice?.headerLine1 || '',
    invoiceHeaderLine2: activeTenant?.settings?.invoice?.headerLine2 || '',
    invoiceShowAddress: activeTenant?.settings?.invoice?.showAddress ?? true,
    invoiceShowPhone: activeTenant?.settings?.invoice?.showPhone ?? true,
    invoiceShowCustomerPhone: activeTenant?.settings?.invoice?.showCustomerPhone ?? true,
    invoiceShowOperator: activeTenant?.settings?.invoice?.showOperator ?? true,
    invoiceShowOrderNote: activeTenant?.settings?.invoice?.showOrderNote ?? true,
    invoiceFooterNote: activeTenant?.settings?.invoice?.footerNote || 'Cảm ơn quý khách và hẹn gặp lại.',
    invoicePrintSize: activeTenant?.settings?.invoice?.printSize || 'receipt_80mm',
  });

  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'cashier',
  });
  const [editingUserId, setEditingUserId] = useState('');
  const [editingForm, setEditingForm] = useState({
    name: '',
    phone: '',
    role: 'cashier',
    status: 'active',
    password: '',
  });
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [taxProfile, setTaxProfile] = useState({ name: 'Mặc định', taxMethod: 'Chưa cấu hình', defaultTaxRate: 0, taxCode: '' });
  const [backups, setBackups] = useState<any[]>([]);
  const [licenseToken, setLicenseToken] = useState('');
  const [operationMessage, setOperationMessage] = useState('');
  const [permissionUser, setPermissionUser] = useState<User | null>(null);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);

  const isOwner = currentUser?.role === 'owner';
  const canCreateMoreUsers = true;

  useEffect(() => {
    setFormData({
      name: activeTenant?.name || '',
      legalName: activeTenant?.legalName || '',
      taxInfo: activeTenant?.taxInfo || '',
      address: activeTenant?.address || '',
      phone: activeTenant?.phone || '',
      invoicePrefix: activeTenant?.invoicePrefix || 'INV',
      lowStockThreshold: activeTenant?.settings?.lowStockThresholdDefault || 10,
      allowDebt: activeTenant?.settings?.debtPolicy?.allowDebt ?? true,
      maxDebtAmount: activeTenant?.settings?.debtPolicy?.maxDebtAmount || 50000000,
      maxDebtDays: activeTenant?.settings?.debtPolicy?.maxDebtDays || 30,
      openTime: activeTenant?.settings?.workingHours?.open || '07:00',
      closeTime: activeTenant?.settings?.workingHours?.close || '18:00',
      invoiceStoreDisplayName: activeTenant?.settings?.invoice?.storeDisplayName || '',
      invoiceHeaderLine1: activeTenant?.settings?.invoice?.headerLine1 || '',
      invoiceHeaderLine2: activeTenant?.settings?.invoice?.headerLine2 || '',
      invoiceShowAddress: activeTenant?.settings?.invoice?.showAddress ?? true,
      invoiceShowPhone: activeTenant?.settings?.invoice?.showPhone ?? true,
      invoiceShowCustomerPhone: activeTenant?.settings?.invoice?.showCustomerPhone ?? true,
      invoiceShowOperator: activeTenant?.settings?.invoice?.showOperator ?? true,
      invoiceShowOrderNote: activeTenant?.settings?.invoice?.showOrderNote ?? true,
      invoiceFooterNote: activeTenant?.settings?.invoice?.footerNote || 'Cảm ơn quý khách và hẹn gặp lại.',
      invoicePrintSize: activeTenant?.settings?.invoice?.printSize || 'receipt_80mm',
    });
  }, [activeTenant]);

  const loadTenantUsers = async () => {
    if (!isOwner) return;
    setUsersLoading(true);
    setUserError('');
    try {
      const users = await usersApi.list(activeTenant?.id);
      setTenantUsers(users);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Không thể tải danh sách user.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadTenantUsers();
  }, [isOwner, activeTenant?.id]);

  useEffect(() => {
    if (activeTab !== 'system') return;
    Promise.all([systemApi.status(), backupsApi.list(), systemApi.taxProfile()]).then(([status, backupRows, profile]) => {
      setSystemStatus(status);
      setBackups(backupRows);
      setTaxProfile({ name: profile.name || 'Mặc định', taxMethod: profile.taxMethod || 'Chưa cấu hình', defaultTaxRate: Number(profile.defaultTaxRate) || 0, taxCode: profile.taxCode || '' });
    }).catch((err) => setOperationMessage(err instanceof Error ? err.message : 'Không thể tải trạng thái hệ thống.'));
  }, [activeTab]);

  const createBackup = async () => {
    try {
      const backup = await backupsApi.create();
      setBackups((prev) => [backup, ...prev]);
      setOperationMessage('Đã tạo bản sao lưu dữ liệu.');
    } catch (err) { setOperationMessage(err instanceof Error ? err.message : 'Không thể tạo bản sao lưu.'); }
  };

  const saveTaxProfile = async () => {
    try { await systemApi.updateTaxProfile(taxProfile); setOperationMessage('Đã lưu cấu hình dữ liệu thuế.'); }
    catch (err) { setOperationMessage(err instanceof Error ? err.message : 'Không thể lưu cấu hình thuế.'); }
  };

  const restoreBackup = async (backupId: string) => {
    if (!window.confirm('Khôi phục sẽ thay thế dữ liệu hiện tại và khởi động lại máy chủ. Tiếp tục?')) return;
    try {
      await backupsApi.restore(backupId);
      setOperationMessage('Đã yêu cầu khôi phục. Máy chủ đang khởi động lại...');
    } catch (err) { setOperationMessage(err instanceof Error ? err.message : 'Không thể khôi phục bản sao lưu.'); }
  };

  const activateLicense = async () => {
    try {
      const license = await licenseApi.activate(licenseToken.trim());
      setSystemStatus((prev: any) => ({ ...prev, license }));
      setLicenseToken('');
      setOperationMessage('Đã kích hoạt license HKDCare.');
    } catch (err) { setOperationMessage(err instanceof Error ? err.message : 'Không thể kích hoạt license.'); }
  };

  const openPermissions = async (user: User) => {
    setPermissionUser(user);
    try { setPermissionRows(await permissionsApi.getForUser(user.id)); }
    catch (err) { setUserError(err instanceof Error ? err.message : 'Không thể tải phân quyền.'); }
  };

  const savePermissions = async () => {
    if (!permissionUser) return;
    try {
      await permissionsApi.saveForUser(permissionUser.id, permissionRows.map((permission) => ({ code: permission.code, allowed: Boolean(permission.allowed) })));
      setUserError('Đã lưu phân quyền.');
    } catch (err) { setUserError(err instanceof Error ? err.message : 'Không thể lưu phân quyền.'); }
  };

  const handleSave = async () => {
    setError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      await updateTenant({
        ...formData,
        settings: {
          ...activeTenant?.settings,
          lowStockThresholdDefault: Number(formData.lowStockThreshold) || 10,
          debtPolicy: {
            ...activeTenant?.settings?.debtPolicy,
            allowDebt: !!formData.allowDebt,
            maxDebtAmount: Number(formData.maxDebtAmount) || 0,
            maxDebtDays: Number(formData.maxDebtDays) || 0,
          },
          workingHours: {
            open: formData.openTime,
            close: formData.closeTime,
          },
          invoice: {
            storeDisplayName: formData.invoiceStoreDisplayName?.trim() || '',
            headerLine1: formData.invoiceHeaderLine1?.trim() || '',
            headerLine2: formData.invoiceHeaderLine2?.trim() || '',
            showAddress: !!formData.invoiceShowAddress,
            showPhone: !!formData.invoiceShowPhone,
            showCustomerPhone: !!formData.invoiceShowCustomerPhone,
            showOperator: !!formData.invoiceShowOperator,
            showOrderNote: !!formData.invoiceShowOrderNote,
            footerNote: formData.invoiceFooterNote?.trim() || '',
            printSize: formData.invoicePrintSize as 'a5' | 'receipt_80mm',
          },
        },
      });
      setSaveMessage('Đã lưu cấu hình.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu cấu hình.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!isOwner) return;
    setUserError('');
    if (!userForm.name || !userForm.email || !userForm.password) {
      setUserError('Vui lòng nhập đầy đủ tên, email, mật khẩu.');
      return;
    }
    try {
      await usersApi.create(userForm);
      setUserForm({ name: '', email: '', phone: '', password: '', role: 'cashier' });
      await loadTenantUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Không thể tạo user.');
    }
  };

  const openEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditingForm({
      name: user.name || '',
      phone: user.phone || '',
      role: user.role,
      status: user.status,
      password: '',
    });
  };

  const handleUpdateUser = async () => {
    if (!editingUserId) return;
    setUserError('');
    try {
      await usersApi.update(editingUserId, {
        name: editingForm.name,
        phone: editingForm.phone,
        role: editingForm.role,
        status: editingForm.status,
        password: editingForm.password || undefined,
      });
      setEditingUserId('');
      await loadTenantUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Không thể cập nhật user.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!user?.id) return;
    if (!confirm(`Xoá user ${user.name}?`)) return;
    setUserError('');
    try {
      await usersApi.delete(user.id);
      await loadTenantUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Không thể xoá user.');
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-100/60">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="hidden items-center gap-4 lg:flex">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
              <Settings2 className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-page-title">Cài đặt hệ thống</h1>
      <p className="text-page-subtitle">Quản trị hộ kinh doanh, nhân viên và chính sách vận hành.</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="h-11 px-5 text-base font-semibold">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {saveMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveMessage}</div>}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveTab('profile')} className={`h-10 px-4 rounded-lg text-sm ${activeTab === 'profile' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              Hồ sơ
            </button>
            <button onClick={() => setActiveTab('system')} className={`h-10 px-4 rounded-lg text-sm ${activeTab === 'system' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              Hệ thống
            </button>
            <button onClick={() => setActiveTab('users')} className={`h-10 px-4 rounded-lg text-sm ${activeTab === 'users' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              Nhân viên & quyền
            </button>
            <button onClick={() => setActiveTab('invoice')} className={`h-10 px-4 rounded-lg text-sm ${activeTab === 'invoice' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              Hóa đơn
            </button>
          </div>

          {activeTab === 'profile' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Store className="h-4 w-4" />
            <h2 className="text-base font-semibold">Hồ sơ cửa hàng</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="Tên cửa hàng" />
            <Input value={formData.legalName} onChange={(e) => setFormData((prev) => ({ ...prev, legalName: e.target.value }))} placeholder="Tên pháp lý" />
            <Input value={formData.taxInfo} onChange={(e) => setFormData((prev) => ({ ...prev, taxInfo: e.target.value }))} placeholder="Mã số thuế" />
            <Input value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Số điện thoại" />
            <Input value={formData.invoicePrefix} onChange={(e) => setFormData((prev) => ({ ...prev, invoicePrefix: e.target.value }))} placeholder="Tiền tố hóa đơn" />
          </div>
          <Input value={formData.address} onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))} placeholder="Địa chỉ cửa hàng" />
        </div>
          )}

          {activeTab === 'system' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-4 w-4" />
            <h2 className="text-base font-semibold">Vận hành & công nợ</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Ngưỡng tồn kho thấp</label>
              <Input type="number" value={formData.lowStockThreshold} onChange={(e) => setFormData((prev) => ({ ...prev, lowStockThreshold: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Hạn mức công nợ mặc định (đ)</label>
              <Input type="number" value={formData.maxDebtAmount} onChange={(e) => setFormData((prev) => ({ ...prev, maxDebtAmount: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Số ngày nợ tối đa</label>
              <Input type="number" value={formData.maxDebtDays} onChange={(e) => setFormData((prev) => ({ ...prev, maxDebtDays: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Cho phép bán công nợ</label>
              <select className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={formData.allowDebt ? 'yes' : 'no'} onChange={(e) => setFormData((prev) => ({ ...prev, allowDebt: e.target.value === 'yes' }))}>
                <option value="yes">Có</option>
                <option value="no">Không</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">Máy chủ mạng nội bộ</p>
              <p className="mt-1 text-xs text-slate-500">{systemStatus?.hostname || 'Đang tải...'} · {systemStatus?.addresses?.join(', ') || 'Chưa nhận diện IP'}</p>
              <p className="mt-1 text-xs text-sky-700">http://hkd.care</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">License</p>
              <p className="mt-1 text-xs text-slate-500">Trạng thái: {systemStatus?.license?.status || 'unlicensed'}</p>
              <div className="mt-2 flex gap-2"><Input value={licenseToken} onChange={(e) => setLicenseToken(e.target.value)} placeholder="Dán license token" className="h-8 text-xs"/><Button size="sm" onClick={activateLicense} disabled={!licenseToken.trim()}>Kích hoạt</Button></div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between"><div><p className="font-medium text-slate-900">Dữ liệu thuế</p><p className="text-xs text-slate-500">Chỉ lưu cấu hình để xuất dữ liệu; HKDCare không tự kết luận nghĩa vụ thuế.</p></div><Button size="sm" variant="outline" onClick={saveTaxProfile}>Lưu</Button></div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3"><Input value={taxProfile.taxCode} onChange={(e) => setTaxProfile((prev) => ({ ...prev, taxCode: e.target.value }))} placeholder="Mã số thuế" /><Input value={taxProfile.taxMethod} onChange={(e) => setTaxProfile((prev) => ({ ...prev, taxMethod: e.target.value }))} placeholder="Phương pháp quản lý thuế" /><Input type="number" min="0" max="100" value={taxProfile.defaultTaxRate} onChange={(e) => setTaxProfile((prev) => ({ ...prev, defaultTaxRate: Number(e.target.value) || 0 }))} placeholder="Thuế suất mặc định (%)" /></div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between"><div><p className="font-medium text-slate-900">Sao lưu dữ liệu</p><p className="text-xs text-slate-500">Tạo bản sao SQLite trên máy chủ local.</p></div><Button size="sm" variant="outline" onClick={createBackup}>Tạo bản sao lưu</Button></div>
            {backups.slice(0, 5).map((backup) => <div key={backup.id} className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{new Date(backup.createdAt).toLocaleString('vi-VN')} · {Math.round(backup.sizeBytes / 1024)} KB</span><Button size="sm" variant="outline" onClick={() => restoreBackup(backup.id)}>Khôi phục</Button></div>)}
          </div>
          {operationMessage && <p className="text-xs text-sky-700">{operationMessage}</p>}
        </div>
          )}

          {activeTab === 'invoice' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2 text-slate-900"><Store className="h-4 w-4" /><h2 className="text-base font-semibold">Cấu hình in hóa đơn</h2></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input value={formData.invoiceStoreDisplayName} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceStoreDisplayName: e.target.value }))} placeholder="Tên hiển thị trên hóa đơn" />
                <select className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={formData.invoicePrintSize} onChange={(e) => setFormData((prev) => ({ ...prev, invoicePrintSize: e.target.value }))}><option value="receipt_80mm">Khổ K80</option><option value="a5">Khổ A5</option></select>
                <Input value={formData.invoiceHeaderLine1} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceHeaderLine1: e.target.value }))} placeholder="Dòng đầu hóa đơn" />
                <Input value={formData.invoiceHeaderLine2} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceHeaderLine2: e.target.value }))} placeholder="Dòng phụ hóa đơn" />
              </div>
              <Input value={formData.invoiceFooterNote} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceFooterNote: e.target.value }))} placeholder="Lời cảm ơn / chính sách đổi trả" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <label><input type="checkbox" checked={formData.invoiceShowAddress} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceShowAddress: e.target.checked }))} /> Hiện địa chỉ</label>
                <label><input type="checkbox" checked={formData.invoiceShowPhone} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceShowPhone: e.target.checked }))} /> Hiện số điện thoại</label>
                <label><input type="checkbox" checked={formData.invoiceShowCustomerPhone} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceShowCustomerPhone: e.target.checked }))} /> Hiện SĐT khách hàng</label>
                <label><input type="checkbox" checked={formData.invoiceShowOperator} onChange={(e) => setFormData((prev) => ({ ...prev, invoiceShowOperator: e.target.checked }))} /> Hiện nhân viên</label>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Users className="h-4 w-4" />
            <h2 className="text-base font-semibold">Nhân viên & phân quyền</h2>
          </div>

          {!isOwner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Chỉ quản trị mới có quyền quản lý nhân viên và phân quyền.
            </div>
          )}

          {userError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{userError}</div>
          )}

          {isOwner && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">Tạo user mới (Manager/Cashier)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input value={userForm.name} onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Tên nhân sự" />
                <Input value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email đăng nhập" />
                <Input value={userForm.phone} onChange={(e) => setUserForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Số điện thoại" />
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Mật khẩu" />
                <select className="h-10 rounded-md border border-gray-300 px-3 text-sm" value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="cashier">Nhân viên bán hàng</option>
                  <option value="manager">Quản lý</option>
                  <option value="warehouse">Nhân viên kho</option>
                </select>
                <Button onClick={handleCreateUser} disabled={!canCreateMoreUsers} className="h-10 text-sm font-medium">
                  Thêm nhân viên
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Tên</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Vai trò</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                  <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>Đang tải...</td></tr>
                ) : tenantUsers.length === 0 ? (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>Chưa có user.</td></tr>
                ) : (
                  tenantUsers.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{user.name}</td>
                      <td className="px-3 py-2">{user.email}</td>
                      <td className="px-3 py-2">{user.role}</td>
                      <td className="px-3 py-2">{user.status}</td>
                      <td className="px-3 py-2">
                        {isOwner && user.role !== 'owner' ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openPermissions(user)}>Quyền</Button>
                            <Button size="sm" variant="outline" onClick={() => openEditUser(user)}>Sửa</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteUser(user)}>Xoá</Button>
                          </div>
                        ) : (
                          <p className="text-right text-xs text-slate-400">-</p>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {editingUserId && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-medium text-slate-900">Cập nhật user</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input value={editingForm.name} onChange={(e) => setEditingForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Tên user" />
                <Input value={editingForm.phone} onChange={(e) => setEditingForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Số điện thoại" />
                <select className="h-10 rounded-md border border-gray-300 px-3 text-sm" value={editingForm.role} onChange={(e) => setEditingForm((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="cashier">Nhân viên bán hàng</option>
                  <option value="manager">Quản lý</option>
                  <option value="warehouse">Nhân viên kho</option>
                </select>
                <select className="h-10 rounded-md border border-gray-300 px-3 text-sm" value={editingForm.status} onChange={(e) => setEditingForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
                <Input type="password" value={editingForm.password} onChange={(e) => setEditingForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Mật khẩu mới (không bắt buộc)" />
                <div className="flex items-center gap-2">
                  <Button onClick={handleUpdateUser}>Lưu user</Button>
                  <Button variant="outline" onClick={() => setEditingUserId('')}>Huỷ</Button>
                </div>
              </div>
            </div>
          )}
          {permissionUser && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-900">Phân quyền: {permissionUser.name}</p><p className="text-xs text-slate-500">Bật/tắt quyền theo module và thao tác.</p></div><Button size="sm" onClick={savePermissions}>Lưu quyền</Button></div>
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {permissionRows.map((permission) => <label key={permission.code} className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1.5 text-xs text-slate-700"><input type="checkbox" checked={Boolean(permission.allowed)} onChange={(e) => setPermissionRows((prev) => prev.map((row) => row.code === permission.code ? { ...row, allowed: e.target.checked } : row))}/><span>{permission.label}</span><span className="ml-auto font-mono text-[10px] text-slate-400">{permission.code}</span></label>)}
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
