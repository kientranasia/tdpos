import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Users, CreditCard, ShieldCheck, Search, ExternalLink, RefreshCw, TrendingUp, BarChart3, Target, Store } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { adminApi } from '../lib/api';

type AdminTab = 'overview' | 'tenants' | 'subscriptions' | 'packages' | 'users' | 'audit';
const tenantStatuses = ['all', 'active', 'trial', 'onboarding', 'pending_setup', 'suspended'];
const subscriptionStatuses = ['all', 'pending_review', 'active', 'expired', 'cancelled'];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [usersTenantFilter, setUsersTenantFilter] = useState('all');
  const [email, setEmail] = useState('admin@tdpos.vn');
  const [password, setPassword] = useState('admin123');
  const [adminUser, setAdminUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTenantDetail, setActiveTenantDetail] = useState<any | null>(null);
  const [activeTenantUsers, setActiveTenantUsers] = useState<{ tenant: any; users: any[] } | null>(null);
  const [actionLoadingKey, setActionLoadingKey] = useState<string>('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    tenantName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    phone: '',
    address: '',
  });
  const [userForm, setUserForm] = useState({
    tenantId: '',
    name: '',
    email: '',
    password: '',
    role: 'cashier',
    phone: '',
  });
  const [editingUserForm, setEditingUserForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    role: 'cashier',
    status: 'active',
    password: '',
  });
  const [packageForm, setPackageForm] = useState({
    code: '',
    name: '',
    maxUsers: 1,
    priceMonthly: 150000,
    isDefault: true,
  });

  const loadAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const [admin, adminStats, tenantList, globalUserList, subList, pkgList, logs] = await Promise.all([
        adminApi.me(),
        adminApi.stats(),
        adminApi.tenants.list({ status: statusFilter }),
        adminApi.users.list(),
        adminApi.subscriptions.list({ status: subscriptionFilter }),
        adminApi.packages.list(),
        adminApi.auditLogs.list({ limit: '120' }),
      ]);
      setAdminUser(admin);
      setStats(adminStats);
      setTenants(tenantList);
      setGlobalUsers(globalUserList);
      setSubscriptions(subList);
      setPackages(pkgList);
      setAuditLogs(logs);
    } catch (err) {
      adminApi.clearSession();
      setAdminUser(null);
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminApi.getToken()) {
      loadAdminData();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminUser) loadAdminData();
  }, [statusFilter, subscriptionFilter]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = await adminApi.login(email, password);
      adminApi.saveSession(session.token);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập admin thất bại.');
      setLoading(false);
    }
  };

  const handleTenantStatus = async (tenantId: string, status: string) => {
    try {
      await adminApi.tenants.setStatus(tenantId, status);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái tenant.');
    }
  };

  const handleCreateTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.tenantName || !createForm.ownerName || !createForm.ownerEmail || !createForm.ownerPassword) {
      setError('Vui lòng nhập đầy đủ thông tin tenant và owner.');
      return;
    }
    try {
      await adminApi.tenants.create({
        tenant: {
          name: createForm.tenantName,
          phone: createForm.phone,
          address: createForm.address,
          status: 'trial',
          invoicePrefix: 'INV',
        },
        owner: {
          name: createForm.ownerName,
          email: createForm.ownerEmail,
          password: createForm.ownerPassword,
          phone: createForm.phone,
        },
      });
      setCreateForm({ tenantName: '', ownerName: '', ownerEmail: '', ownerPassword: '', phone: '', address: '' });
      await loadAdminData();
      setActiveTab('tenants');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo tenant.');
    }
  };

  const handleReviewSubscription = async (tenantId: string, decision: 'approve' | 'reject') => {
    const resolvedTenantId = tenantId?.trim();
    if (!resolvedTenantId) {
      setError('Subscription action failed: missing tenant id.');
      return;
    }
    try {
      setActionLoadingKey(`review-${resolvedTenantId}-${decision}`);
      await adminApi.subscriptions.review(resolvedTenantId, decision, decision === 'approve' ? 'Approved by admin' : 'Rejected by admin');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể review subscription.');
    } finally {
      setActionLoadingKey('');
    }
  };

  const handleRenewSubscription = async (tenantId: string) => {
    const resolvedTenantId = tenantId?.trim();
    if (!resolvedTenantId) {
      setError('Renew failed: missing tenant id.');
      return;
    }
    try {
      setActionLoadingKey(`renew-${resolvedTenantId}`);
      await adminApi.subscriptions.renew(resolvedTenantId);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gia hạn subscription.');
    } finally {
      setActionLoadingKey('');
    }
  };

  const handleOpenTenantDetail = async (tenantId: string) => {
    try {
      const detail = await adminApi.tenants.get(tenantId);
      setActiveTenantDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải chi tiết tenant.');
    }
  };

  const handleOpenTenantUsers = async (tenant: any) => {
    try {
      const users = await adminApi.users.list(tenant.id);
      setActiveTenantUsers({ tenant, users });
      setUserForm((prev) => ({ ...prev, tenantId: tenant.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách user.');
    }
  };

  const handleCreateTenantUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userForm.tenantId || !userForm.name || !userForm.email || !userForm.password) {
      setError('Vui lòng nhập đủ thông tin user.');
      return;
    }
    try {
      setCreatingUser(true);
      await adminApi.users.create(userForm);
      if (activeTenantUsers) {
        const users = await adminApi.users.list(activeTenantUsers.tenant.id);
        setActiveTenantUsers({ ...activeTenantUsers, users });
      }
      setGlobalUsers(await adminApi.users.list());
      await loadAdminData();
      setUserForm((prev) => ({ ...prev, name: '', email: '', password: '', phone: '', role: 'cashier' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminApi.users.delete(userId);
      if (activeTenantUsers) {
        const users = await adminApi.users.list(activeTenantUsers.tenant.id);
        setActiveTenantUsers({ ...activeTenantUsers, users });
      }
      setGlobalUsers(await adminApi.users.list());
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xoá user.');
    }
  };

  const openEditUser = (user: any) => {
    setEditingUserForm({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'cashier',
      status: user.status || 'active',
      password: '',
    });
  };

  const closeEditUser = () => {
    setEditingUserForm({
      id: '',
      name: '',
      email: '',
      phone: '',
      role: 'cashier',
      status: 'active',
      password: '',
    });
  };

  const handleUpdateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUserForm.id || !editingUserForm.name || !editingUserForm.email) {
      setError('Thiếu thông tin user để cập nhật.');
      return;
    }
    try {
      setUpdatingUser(true);
      const payload: any = {
        name: editingUserForm.name,
        email: editingUserForm.email,
        phone: editingUserForm.phone,
        role: editingUserForm.role,
        status: editingUserForm.status,
      };
      if (editingUserForm.password.trim()) {
        payload.password = editingUserForm.password.trim();
      }
      await adminApi.users.update(editingUserForm.id, payload);
      if (activeTenantUsers) {
        const users = await adminApi.users.list(activeTenantUsers.tenant.id);
        setActiveTenantUsers({ ...activeTenantUsers, users });
      }
      setGlobalUsers(await adminApi.users.list());
      await loadAdminData();
      closeEditUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật user.');
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleAssignPackage = async (tenantId: string, packageCode: string) => {
    try {
      setActionLoadingKey(`package-${tenantId}`);
      await adminApi.tenants.update(tenantId, { packageCode });
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật gói.');
    } finally {
      setActionLoadingKey('');
    }
  };

  const handleCreatePackage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!packageForm.code || !packageForm.name || packageForm.maxUsers <= 0 || packageForm.priceMonthly <= 0) {
      setError('Vui lòng nhập đầy đủ thông tin gói.');
      return;
    }
    try {
      setSavingPackage(true);
      await adminApi.packages.create(packageForm);
      const pkgList = await adminApi.packages.list();
      setPackages(pkgList);
      setPackageForm({ code: '', name: '', maxUsers: 1, priceMonthly: 150000, isDefault: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo package.');
    } finally {
      setSavingPackage(false);
    }
  };

  const handleSetDefaultPackage = async (pkg: any) => {
    try {
      await adminApi.packages.update(pkg.id, { isDefault: true });
      const pkgList = await adminApi.packages.list();
      setPackages(pkgList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đặt gói mặc định.');
    }
  };

  const handleDeletePackage = async (pkg: any) => {
    try {
      await adminApi.packages.delete(pkg.id);
      const pkgList = await adminApi.packages.list();
      setPackages(pkgList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xoá package.');
    }
  };

  const filteredTenants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter((tenant) =>
      tenant.name?.toLowerCase().includes(term) ||
      tenant.id?.toLowerCase().includes(term) ||
      tenant.email?.toLowerCase().includes(term) ||
      tenant.phone?.includes(term)
    );
  }, [searchTerm, tenants]);

  const filteredSubscriptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return subscriptions;
    return subscriptions.filter((sub) =>
      sub.tenantName?.toLowerCase().includes(term) ||
      sub.tenantId?.toLowerCase().includes(term)
    );
  }, [searchTerm, subscriptions]);

  const filteredGlobalUsers = useMemo(() => {
    const usersByTenant = usersTenantFilter === 'all'
      ? globalUsers
      : globalUsers.filter((user) => user.tenantId === usersTenantFilter);
    const term = searchTerm.trim().toLowerCase();
    if (!term) return usersByTenant;
    return usersByTenant.filter((user) =>
      user.name?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.tenantName?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term)
    );
  }, [globalUsers, usersTenantFilter, searchTerm]);

  const filteredAuditLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return auditLogs;
    return auditLogs.filter((log) =>
      log.action?.toLowerCase().includes(term) ||
      log.entityType?.toLowerCase().includes(term) ||
      log.entityId?.toLowerCase().includes(term) ||
      log.tenantId?.toLowerCase().includes(term)
    );
  }, [searchTerm, auditLogs]);

  const overviewInsights = useMemo(() => {
    const activeTenants = tenants.filter((t) => t.status === 'active');
    const trialTenants = tenants.filter((t) => t.subscriptionStatus === 'trial');
    const payingTenants = tenants.filter((t) => t.subscriptionStatus === 'active');
    const pendingReview = subscriptions.filter((s) => s.status === 'pending_review').length;
    const expiredTenants = tenants.filter((t) => ['expired', 'cancelled'].includes(t.subscriptionStatus)).length;
    const totalMrr = payingTenants.reduce((sum, t) => sum + (t.packagePriceMonthly || t.subscriptionPriceMonthly || 0), 0);
    const arpu = payingTenants.length ? Math.round(totalMrr / payingTenants.length) : 0;
    const seatUtilization = tenants.length
      ? Math.round((tenants.reduce((sum, t) => sum + (t.userCount || 0), 0) / Math.max(1, tenants.reduce((sum, t) => sum + (t.maxUsers || 1), 0))) * 100)
      : 0;

    const packageMixMap = tenants.reduce<Record<string, { name: string; tenants: number; mrr: number }>>((acc, t) => {
      const code = t.packageCode || 'starter_1';
      if (!acc[code]) {
        acc[code] = { name: t.packageName || code, tenants: 0, mrr: 0 };
      }
      acc[code].tenants += 1;
      acc[code].mrr += (t.packagePriceMonthly || t.subscriptionPriceMonthly || 0);
      return acc;
    }, {});

    const packageMix = (Object.entries(packageMixMap) as Array<[string, { name: string; tenants: number; mrr: number }]>)
      .map(([code, value]) => ({ code, name: value.name, tenants: value.tenants, mrr: value.mrr }))
      .sort((a, b) => b.tenants - a.tenants);

    const topMerchants = [...tenants]
      .sort((a, b) => (b.invoiceCount || 0) - (a.invoiceCount || 0))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        name: t.name,
        packageName: t.packageName || 'Starter 1',
        mrr: t.packagePriceMonthly || t.subscriptionPriceMonthly || 0,
        invoiceCount: t.invoiceCount || 0,
        userRatio: `${t.userCount || 0}/${t.maxUsers || 1}`,
        status: t.subscriptionStatus || 'trial',
      }));

    const countBy = (values: string[]) => {
      const map = values.reduce<Record<string, number>>((acc, value) => {
        const key = value?.trim() || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    };

    const insightsSource = tenants.map((t) => t.settings?.insights || {});
    const industryMix = countBy(insightsSource.map((i) => i.industry || 'Chưa khai báo'));
    const businessModelMix = countBy(insightsSource.map((i) => i.businessModel || 'Chưa khai báo'));
    const staffSizeMix = countBy(insightsSource.map((i) => i.staffSize || 'Chưa khai báo'));
    const goalMix = countBy(insightsSource.map((i) => i.primaryGoal || 'Chưa khai báo'));
    const channelMix = countBy(
      insightsSource.flatMap((i) => (Array.isArray(i.salesChannels) && i.salesChannels.length ? i.salesChannels : ['Chưa khai báo']))
    );

    return {
      activeTenants: activeTenants.length,
      trialTenants: trialTenants.length,
      payingTenants: payingTenants.length,
      pendingReview,
      expiredTenants,
      totalMrr,
      arpu,
      seatUtilization,
      packageMix,
      topMerchants,
      industryMix,
      businessModelMix,
      staffSizeMix,
      goalMix,
      channelMix,
    };
  }, [tenants, subscriptions]);

  if (!adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-6 rounded-lg border border-white/10 bg-white/5 p-8 shadow-2xl">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-sky-600">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-black uppercase italic tracking-tight">Admin CPanel</h1>
            <p className="text-sm font-bold text-slate-400">Quản trị tenant, subscription và audit log.</p>
          </div>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-14 rounded-lg border-white/10 bg-white/10 font-bold text-white" placeholder="admin@tdpos.vn" required />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-14 rounded-lg border-white/10 bg-white/10 font-bold text-white" placeholder="Mật khẩu" required />
          <Button type="submit" className="h-14 w-full rounded-lg bg-sky-600 font-black uppercase tracking-widest hover:bg-sky-700">
            {loading ? 'Đang kiểm tra...' : 'Đăng nhập'}
          </Button>
          {error && <p className="text-center text-sm font-bold text-red-400">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {activeTenantDetail && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-slate-950 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-tight">Tenant Detail</h3>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => setActiveTenantDetail(null)}>Close</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><p className="text-slate-500 text-xs uppercase">Name</p><p className="font-bold">{activeTenantDetail.name || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Email</p><p className="font-bold">{activeTenantDetail.email || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Phone</p><p className="font-bold">{activeTenantDetail.phone || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Address</p><p className="font-bold">{activeTenantDetail.address || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Status</p><p className="font-bold uppercase">{activeTenantDetail.status || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Subscription</p><p className="font-bold uppercase">{activeTenantDetail.subscriptionStatus || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Plan</p><p className="font-bold">{activeTenantDetail.subscriptionPlan || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Price</p><p className="font-bold">{formatCurrency(activeTenantDetail.subscriptionPriceMonthly || 150000)}/tháng</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Users</p><p className="font-bold">{activeTenantDetail.users?.length || 0}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Created</p><p className="font-bold">{activeTenantDetail.createdAt ? new Date(activeTenantDetail.createdAt).toLocaleString('vi-VN') : '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Industry</p><p className="font-bold">{activeTenantDetail.settings?.insights?.industry || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Business model</p><p className="font-bold">{activeTenantDetail.settings?.insights?.businessModel || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Staff size</p><p className="font-bold">{activeTenantDetail.settings?.insights?.staffSize || '-'}</p></div>
              <div><p className="text-slate-500 text-xs uppercase">Monthly orders est.</p><p className="font-bold">{activeTenantDetail.settings?.insights?.monthlyOrdersEstimate || '-'}</p></div>
              <div className="md:col-span-2"><p className="text-slate-500 text-xs uppercase">Sales channels</p><p className="font-bold">{Array.isArray(activeTenantDetail.settings?.insights?.salesChannels) && activeTenantDetail.settings?.insights?.salesChannels.length ? activeTenantDetail.settings?.insights?.salesChannels.join(', ') : '-'}</p></div>
              <div className="md:col-span-2"><p className="text-slate-500 text-xs uppercase">Primary goal</p><p className="font-bold">{activeTenantDetail.settings?.insights?.primaryGoal || '-'}</p></div>
            </div>
          </div>
        </div>
      )}
      {activeTenantUsers && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-lg border border-white/10 bg-slate-950 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Tenant Users</h3>
                <p className="text-xs text-slate-400">
                  {activeTenantUsers.tenant.name} · {activeTenantUsers.users.length}/{activeTenantUsers.tenant.maxUsers || 5} users
                </p>
              </div>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => setActiveTenantUsers(null)}>Close</Button>
            </div>

            <form onSubmit={handleCreateTenantUser} className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Input value={userForm.name} onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Tên user" className="h-10 bg-white/5 border-white/10 text-white" />
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-10 bg-white/5 border-white/10 text-white" />
              <Input value={userForm.phone} onChange={(e) => setUserForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="h-10 bg-white/5 border-white/10 text-white" />
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Password" className="h-10 bg-white/5 border-white/10 text-white" />
              <select value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm">
                <option value="manager">manager</option>
                <option value="cashier">cashier</option>
                <option value="owner">owner</option>
              </select>
              <Button type="submit" disabled={creatingUser} className="h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-xs font-black uppercase">
                {creatingUser ? 'Creating...' : 'Add user'}
              </Button>
            </form>

            <div className="max-h-[340px] overflow-y-auto border border-white/10 rounded-lg">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeTenantUsers.users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 text-sm">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{user.email}</td>
                      <td className="px-4 py-3 text-xs uppercase text-sky-300">{user.role}</td>
                      <td className="px-4 py-3 text-xs uppercase text-slate-300">{user.status}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditUser(user)}>Edit</Button>
                        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleDeleteUser(user.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {editingUserForm.id && (
        <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleUpdateUser} className="w-full max-w-xl rounded-lg border border-white/10 bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-tight">Edit User / Reset Password</h3>
              <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={closeEditUser}>Close</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={editingUserForm.name} onChange={(e) => setEditingUserForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="h-10 bg-white/5 border-white/10 text-white" />
              <Input type="email" value={editingUserForm.email} onChange={(e) => setEditingUserForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-10 bg-white/5 border-white/10 text-white" />
              <Input value={editingUserForm.phone} onChange={(e) => setEditingUserForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="h-10 bg-white/5 border-white/10 text-white" />
              <select value={editingUserForm.role} onChange={(e) => setEditingUserForm((prev) => ({ ...prev, role: e.target.value }))} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm">
                <option value="owner">owner</option>
                <option value="manager">manager</option>
                <option value="cashier">cashier</option>
              </select>
              <select value={editingUserForm.status} onChange={(e) => setEditingUserForm((prev) => ({ ...prev, status: e.target.value }))} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm">
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
              <Input
                type="password"
                value={editingUserForm.password}
                onChange={(e) => setEditingUserForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="New password (optional)"
                className="h-10 bg-white/5 border-white/10 text-white"
              />
            </div>
            <p className="text-xs text-slate-400">To reset password, enter a new password above and save.</p>
            <Button type="submit" disabled={updatingUser} className="h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-xs font-black uppercase">
              {updatingUser ? 'Updating...' : 'Save Changes'}
            </Button>
          </form>
        </div>
      )}

      <div className="w-72 bg-slate-950 border-r border-white/5 flex flex-col p-6 space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="h-10 w-10 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-sky-600/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <span className="font-black text-xl tracking-tighter uppercase italic">ADMIN CPANEL</span>
        </div>
        <nav className="flex-1 space-y-1">
          {[
            { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { id: 'tenants' as const, label: 'Tenants', icon: Users },
            { id: 'subscriptions' as const, label: 'Subscriptions', icon: CreditCard },
            { id: 'packages' as const, label: 'Packages', icon: CreditCard },
            { id: 'users' as const, label: 'Users', icon: Users },
            { id: 'audit' as const, label: 'Audit Logs', icon: ShieldCheck },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-lg transition-all font-black text-xs uppercase tracking-widest ${
                activeTab === item.id ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20' : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 px-10 border-b border-white/5 flex items-center justify-between bg-slate-950/50 backdrop-blur-xl gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <Input
              placeholder="Search tenant, subscription, action..."
              className="h-14 pl-14 rounded-lg bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-bold focus:ring-sky-500/20"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={loadAdminData} variant="ghost" className="h-11 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logged in as</p>
              <p className="text-sm font-black text-sky-400 uppercase italic">{adminUser.name}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-10 space-y-8">
          {error && <p className="text-sm font-bold text-red-400">{error}</p>}

          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                {[
                  { label: 'MRR (Package)', val: formatCurrency(overviewInsights.totalMrr), hint: 'Doanh thu gói theo tháng', color: 'text-emerald-400', icon: TrendingUp },
                  { label: 'ARPU', val: formatCurrency(overviewInsights.arpu), hint: 'Doanh thu TB / merchant trả phí', color: 'text-sky-400', icon: BarChart3 },
                  { label: 'Paying Merchants', val: overviewInsights.payingTenants, hint: `${overviewInsights.trialTenants} trial • ${overviewInsights.pendingReview} chờ duyệt`, color: 'text-blue-400', icon: Store },
                  { label: 'Seat Utilization', val: `${overviewInsights.seatUtilization}%`, hint: 'Mức dùng user seat toàn hệ thống', color: 'text-amber-400', icon: Target },
                ].map((item) => (
                  <div key={item.label} className="p-5 bg-slate-950 border border-white/5 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</p>
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <p className={`text-2xl font-black tracking-tight ${item.color}`}>{item.val}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{item.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Top Merchants Insight</h3>
                    <span className="text-[10px] text-slate-500">Theo số đơn & gói hiện tại</span>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                        <th className="px-6 py-3">Merchant</th>
                        <th className="px-6 py-3">Package</th>
                        <th className="px-6 py-3">MRR</th>
                        <th className="px-6 py-3">Orders</th>
                        <th className="px-6 py-3">Users</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {overviewInsights.topMerchants.map((m) => (
                        <tr key={m.id}>
                          <td className="px-6 py-3 text-sm font-bold text-white">{m.name}</td>
                          <td className="px-6 py-3 text-xs text-slate-300">{m.packageName}</td>
                          <td className="px-6 py-3 text-xs text-emerald-300">{formatCurrency(m.mrr)}</td>
                          <td className="px-6 py-3 text-xs text-sky-300">{m.invoiceCount}</td>
                          <td className="px-6 py-3 text-xs text-slate-300">{m.userRatio}</td>
                          <td className="px-6 py-3 text-xs uppercase text-amber-300">{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-950 rounded-lg border border-white/10 p-5 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Package Mix</h3>
                  <div className="space-y-3">
                    {overviewInsights.packageMix.map((pkg) => (
                      <div key={pkg.code} className="rounded-lg bg-white/5 border border-white/5 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-white">{pkg.name}</p>
                          <p className="text-xs text-slate-400">{pkg.tenants} merchants</p>
                        </div>
                        <p className="text-xs text-emerald-300 mt-1">{formatCurrency(pkg.mrr)}/tháng</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-white/10 text-xs text-slate-400 space-y-1">
                    <p>Active: <span className="text-sky-300 font-bold">{overviewInsights.activeTenants}</span></p>
                    <p>Expired/Cancelled: <span className="text-red-300 font-bold">{overviewInsights.expiredTenants}</span></p>
                    <p>Pending review: <span className="text-amber-300 font-bold">{overviewInsights.pendingReview}</span></p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {[
                  { title: 'Industry Mix', data: overviewInsights.industryMix },
                  { title: 'Business Model Mix', data: overviewInsights.businessModelMix },
                  { title: 'Staff Size Mix', data: overviewInsights.staffSizeMix },
                  { title: 'Primary Goal Mix', data: overviewInsights.goalMix },
                  { title: 'Sales Channel Mix', data: overviewInsights.channelMix },
                ].map((block) => (
                  <div key={block.title} className="bg-slate-950 rounded-lg border border-white/10 p-5 space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">{block.title}</h3>
                    <div className="space-y-2">
                      {block.data.map((item) => (
                        <div key={`${block.title}-${item.label}`} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 p-3">
                          <p className="text-sm text-white">{item.label}</p>
                          <p className="text-xs font-black text-sky-300">{item.count} tenants</p>
                        </div>
                      ))}
                      {block.data.length === 0 && (
                        <p className="text-xs text-slate-500">No data yet.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateTenant} className="bg-slate-950 rounded-lg border border-white/10 p-6 space-y-4">
                <h3 className="text-lg font-black uppercase italic tracking-tight">Tạo Tenant Mới</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input value={createForm.tenantName} onChange={(e) => setCreateForm(prev => ({ ...prev, tenantName: e.target.value }))} placeholder="Tên tenant" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                  <Input value={createForm.phone} onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Số điện thoại" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                  <Input value={createForm.address} onChange={(e) => setCreateForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Địa chỉ" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                  <Input value={createForm.ownerName} onChange={(e) => setCreateForm(prev => ({ ...prev, ownerName: e.target.value }))} placeholder="Tên owner" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                  <Input value={createForm.ownerEmail} onChange={(e) => setCreateForm(prev => ({ ...prev, ownerEmail: e.target.value }))} placeholder="Email owner" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                  <Input type="password" value={createForm.ownerPassword} onChange={(e) => setCreateForm(prev => ({ ...prev, ownerPassword: e.target.value }))} placeholder="Mật khẩu owner" className="h-11 rounded-lg bg-white/5 border-white/10 text-white" />
                </div>
                <Button type="submit" className="h-11 rounded-lg bg-sky-600 hover:bg-sky-700 font-black uppercase tracking-widest">Tạo tenant</Button>
              </form>
            </>
          )}

          {activeTab === 'tenants' && (
            <div className="bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-xs font-black uppercase tracking-widest text-slate-300">
                  {tenantStatuses.map((status) => <option key={status} value={status} className="bg-slate-950">{status}</option>)}
                </select>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-4">Tenant</th><th className="px-6 py-4">Email</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Users</th><th className="px-6 py-4">Package</th><th className="px-6 py-4">Subscription</th><th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-6 py-4">
                        <p className="font-black text-white uppercase">{tenant.name}</p>
                        <p className="text-xs text-slate-500">{tenant.id}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-300">{tenant.email || '-'}</td>
                      <td className="px-6 py-4"><span className="text-xs font-black text-sky-400 uppercase">{tenant.status}</span></td>
                      <td className="px-6 py-4 text-xs text-slate-300">{tenant.userCount || 0}/{tenant.maxUsers || 1}</td>
                      <td className="px-6 py-4">
                        <select
                          defaultValue={tenant.packageCode || 'starter_1'}
                          onChange={(e) => handleAssignPackage(tenant.id, e.target.value)}
                          className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-slate-300"
                          disabled={actionLoadingKey === `package-${tenant.id}`}
                        >
                          {packages.map((pkg) => (
                            <option key={pkg.code} value={pkg.code} className="bg-slate-950">
                              {pkg.name} · {pkg.maxUsers} users · {formatCurrency(pkg.priceMonthly)}/tháng
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-black text-amber-300 uppercase">{tenant.subscriptionStatus || 'trial'}</p>
                        <p className="text-xs text-slate-500">{tenant.subscriptionPlan || 'yearly'} · {formatCurrency(tenant.subscriptionPriceMonthly || 150000)}/tháng</p>
                      </td>
                      <td className="px-6 py-4 flex gap-2">
                        <Button variant="ghost" className="h-9 px-3 rounded-lg text-xs" onClick={() => handleTenantStatus(tenant.id, tenant.status === 'suspended' ? 'active' : 'suspended')}>
                          {tenant.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </Button>
                        <Button variant="ghost" className="h-9 px-3 rounded-lg text-xs" onClick={() => handleRenewSubscription(tenant.id)}>
                          Activate 1y
                        </Button>
                        <Button variant="ghost" className="h-9 px-3 rounded-lg text-xs" onClick={() => handleOpenTenantUsers(tenant)}>Users</Button>
                        <Button variant="ghost" className="h-9 px-3 rounded-lg text-xs" onClick={() => handleOpenTenantDetail(tenant.id)}><ExternalLink className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <select
                  value={usersTenantFilter}
                  onChange={(e) => setUsersTenantFilter(e.target.value)}
                  className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-xs font-black uppercase tracking-widest text-slate-300"
                >
                  <option value="all" className="bg-slate-950">all tenants</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id} className="bg-slate-950">
                      {tenant.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  {filteredGlobalUsers.length} users
                </p>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-4">User</th><th className="px-6 py-4">Role</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Tenant</th><th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredGlobalUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-white">{user.name || '-'}</p>
                        <p className="text-xs text-slate-400">{user.email || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-black uppercase text-sky-300">{user.role || '-'}</td>
                      <td className="px-6 py-4 text-xs uppercase text-slate-300">{user.status || '-'}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-white">{user.tenantName || '-'}</p>
                        <p className="text-xs text-slate-500">{user.tenantEmail || user.tenantId}</p>
                      </td>
                      <td className="px-6 py-4 flex gap-2">
                        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditUser(user)}>Edit</Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            const tenantRef = tenants.find((tenant) => tenant.id === user.tenantId);
                            if (tenantRef) handleOpenTenantUsers(tenantRef);
                          }}
                        >
                          Tenant Users
                        </Button>
                        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleDeleteUser(user.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="space-y-6">
              <form onSubmit={handleCreatePackage} className="bg-slate-950 rounded-lg border border-white/10 p-6 grid grid-cols-1 md:grid-cols-6 gap-3">
                <Input value={packageForm.code} onChange={(e) => setPackageForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="code (vd: starter_1)" className="h-10 rounded-lg bg-white/5 border-white/10 text-white" />
                <Input value={packageForm.name} onChange={(e) => setPackageForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Tên gói" className="h-10 rounded-lg bg-white/5 border-white/10 text-white" />
                <Input type="number" min={1} value={packageForm.maxUsers} onChange={(e) => setPackageForm((prev) => ({ ...prev, maxUsers: Number(e.target.value) }))} placeholder="Max users" className="h-10 rounded-lg bg-white/5 border-white/10 text-white" />
                <Input type="number" min={1} value={packageForm.priceMonthly} onChange={(e) => setPackageForm((prev) => ({ ...prev, priceMonthly: Number(e.target.value) }))} placeholder="Giá/tháng" className="h-10 rounded-lg bg-white/5 border-white/10 text-white" />
                <label className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={packageForm.isDefault} onChange={(e) => setPackageForm((prev) => ({ ...prev, isDefault: e.target.checked }))} />
                  Default
                </label>
                <Button type="submit" disabled={savingPackage} className="h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-xs font-black uppercase">
                  {savingPackage ? 'Saving...' : 'Create Package'}
                </Button>
              </form>

              <div className="bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                      <th className="px-6 py-4">Code</th><th className="px-6 py-4">Name</th><th className="px-6 py-4">Users</th><th className="px-6 py-4">Price</th><th className="px-6 py-4">Default</th><th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {packages.map((pkg) => (
                      <tr key={pkg.id}>
                        <td className="px-6 py-4 text-xs text-slate-300">{pkg.code}</td>
                        <td className="px-6 py-4 text-sm font-bold">{pkg.name}</td>
                        <td className="px-6 py-4 text-sm text-sky-300">{pkg.maxUsers}</td>
                        <td className="px-6 py-4 text-sm text-amber-300">{formatCurrency(pkg.priceMonthly)}/tháng</td>
                        <td className="px-6 py-4 text-xs">{pkg.isDefault ? '✅' : '-'}</td>
                        <td className="px-6 py-4 flex gap-2">
                          {!pkg.isDefault && (
                            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleSetDefaultPackage(pkg)}>Set Default</Button>
                          )}
                          {!pkg.isDefault && (
                            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleDeletePackage(pkg)}>Delete</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <div className="bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
              <div className="p-6 border-b border-white/5">
                <select value={subscriptionFilter} onChange={(e) => setSubscriptionFilter(e.target.value)} className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-xs font-black uppercase tracking-widest text-slate-300">
                  {subscriptionStatuses.map((status) => <option key={status} value={status} className="bg-slate-950">{status}</option>)}
                </select>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-4">Tenant</th><th className="px-6 py-4">Plan</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredSubscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="px-6 py-4">
                        <p className="font-black text-white">{sub.tenantName}</p>
                        <p className="text-xs text-slate-500">{sub.tenantId}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-300">{sub.plan} · {formatCurrency(sub.priceMonthly)}/tháng</td>
                      <td className="px-6 py-4 text-xs font-black uppercase text-amber-300">{sub.status}</td>
                      <td className="px-6 py-4 flex gap-2">
                        <Button
                          variant="ghost"
                          className="h-9 px-3 rounded-lg text-xs"
                          disabled={actionLoadingKey !== ''}
                          onClick={() => handleReviewSubscription(sub.tenantId || sub.tenant_id, 'approve')}
                        >
                          {actionLoadingKey === `review-${sub.tenantId || sub.tenant_id}-approve` ? 'Updating...' : 'Approve'}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 px-3 rounded-lg text-xs"
                          disabled={actionLoadingKey !== ''}
                          onClick={() => handleReviewSubscription(sub.tenantId || sub.tenant_id, 'reject')}
                        >
                          {actionLoadingKey === `review-${sub.tenantId || sub.tenant_id}-reject` ? 'Updating...' : 'Reject'}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 px-3 rounded-lg text-xs"
                          disabled={actionLoadingKey !== ''}
                          onClick={() => handleRenewSubscription(sub.tenantId || sub.tenant_id)}
                        >
                          {actionLoadingKey === `renew-${sub.tenantId || sub.tenant_id}` ? 'Updating...' : 'Renew 1y'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="bg-slate-950 rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-4">Time</th><th className="px-6 py-4">Action</th><th className="px-6 py-4">Entity</th><th className="px-6 py-4">Tenant</th><th className="px-6 py-4">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-4 text-xs font-black text-sky-300 uppercase">{log.action}</td>
                      <td className="px-6 py-4 text-xs text-slate-300">{log.entityType}:{log.entityId}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{log.tenantId || '-'}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{log.actorId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
