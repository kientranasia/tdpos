import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { usersApi } from '../lib/api';
import { User } from '../types';
import { Save, ShieldCheck, Store, Users } from 'lucide-react';

type SettingsTab = 'profile' | 'system' | 'users';

export default function Settings() {
  const { activeTenant, currentUser, updateTenant } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: activeTenant?.name || '',
    legalName: activeTenant?.legalName || '',
    address: activeTenant?.address || '',
    phone: activeTenant?.phone || '',
    invoicePrefix: activeTenant?.invoicePrefix || 'INV',
    lowStockThreshold: activeTenant?.settings?.lowStockThresholdDefault || 10,
    allowDebt: activeTenant?.settings?.debtPolicy?.allowDebt ?? true,
    maxDebtAmount: activeTenant?.settings?.debtPolicy?.maxDebtAmount || 50000000,
    maxDebtDays: activeTenant?.settings?.debtPolicy?.maxDebtDays || 30,
    openTime: activeTenant?.settings?.workingHours?.open || '07:00',
    closeTime: activeTenant?.settings?.workingHours?.close || '18:00',
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

  const isOwner = currentUser?.role === 'owner';
  const maxUsers = activeTenant?.maxUsers || 1;
  const usedUsers = tenantUsers.length;
  const seatsLeft = Math.max(0, maxUsers - usedUsers);
  const canCreateMoreUsers = usedUsers < maxUsers;

  useEffect(() => {
    setFormData({
      name: activeTenant?.name || '',
      legalName: activeTenant?.legalName || '',
      address: activeTenant?.address || '',
      phone: activeTenant?.phone || '',
      invoicePrefix: activeTenant?.invoicePrefix || 'INV',
      lowStockThreshold: activeTenant?.settings?.lowStockThresholdDefault || 10,
      allowDebt: activeTenant?.settings?.debtPolicy?.allowDebt ?? true,
      maxDebtAmount: activeTenant?.settings?.debtPolicy?.maxDebtAmount || 50000000,
      maxDebtDays: activeTenant?.settings?.debtPolicy?.maxDebtDays || 30,
      openTime: activeTenant?.settings?.workingHours?.open || '07:00',
      closeTime: activeTenant?.settings?.workingHours?.close || '18:00',
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

  const packageInfo = useMemo(() => ({
    code: activeTenant?.packageCode || 'starter_1',
    name: activeTenant?.packageName || 'Starter 1',
    price: activeTenant?.packagePriceMonthly || 150000,
  }), [activeTenant]);

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
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cài đặt hệ thống</h1>
          <p className="text-sm text-slate-500">Quản trị thông tin tenant, chính sách vận hành và user theo gói.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="h-10 px-4 text-sm font-medium">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saveMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveMessage}</div>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('profile')} className={`h-9 px-3 rounded-lg text-sm ${activeTab === 'profile' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
          Hồ sơ
        </button>
        <button onClick={() => setActiveTab('system')} className={`h-9 px-3 rounded-lg text-sm ${activeTab === 'system' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
          Hệ thống
        </button>
        <button onClick={() => setActiveTab('users')} className={`h-9 px-3 rounded-lg text-sm ${activeTab === 'users' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
          Users & Gói
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
        </div>
      )}

      {activeTab === 'users' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Users className="h-4 w-4" />
            <h2 className="text-base font-semibold">Users theo gói</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Gói hiện tại</p>
              <p className="font-semibold text-slate-900">{packageInfo.name}</p>
              <p className="text-slate-500">{packageInfo.code}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Số user</p>
              <p className="font-semibold text-slate-900">{usedUsers}/{maxUsers}</p>
              <p className="text-slate-500">Còn lại {seatsLeft} user</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Phí tháng</p>
              <p className="font-semibold text-slate-900">{Number(packageInfo.price || 0).toLocaleString('vi-VN')}đ</p>
            </div>
          </div>

          {!isOwner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Chỉ Owner mới có quyền quản lý user theo gói.
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
                </select>
                <Button onClick={handleCreateUser} disabled={!canCreateMoreUsers} className="h-10 text-sm font-medium">
                  {canCreateMoreUsers ? 'Thêm user' : 'Đã đạt giới hạn gói'}
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
        </div>
      )}
    </div>
  );
}
