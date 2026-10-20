import React, { useEffect, useState } from 'react';
import { Edit3, Layers, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatPriceListAdjustment, getPriceListAdjustment } from '../../lib/priceLists';

export type InventoryCategory = { id: string; name: string };
export type InventoryUnit = { id: string; name: string; inUseCount?: number };
export type InventoryPriceList = {
  id: string;
  name: string;
  customerType?: string;
  markupMode?: 'percent' | 'amount';
  markupValue?: number;
  markupPercent?: number;
  isDefault?: boolean;
};

type ManagerModalFrameProps = {
  open: boolean;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
};

function ManagerModalFrame({ open, title, subtitle, icon, children, onClose }: ManagerModalFrameProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">{icon}</div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              <p className="text-[11px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Đóng ${title}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
        <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  );
}

type CategoryManagerModalProps = {
  open: boolean;
  categories: InventoryCategory[];
  onClose: () => void;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (category: InventoryCategory) => Promise<boolean>;
};

export function CategoryManagerModal({ open, categories, onClose, onAdd, onRename, onDelete }: CategoryManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setNewName('');
      setEditingId(null);
      setEditingName('');
      setMessage('');
    }
  }, [open]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const success = await onAdd(name);
    if (success) {
      setNewName('');
      setMessage('Đã thêm danh mục.');
    } else {
      setMessage('Không thể thêm danh mục.');
    }
  };

  const handleRename = async (category: InventoryCategory) => {
    const name = editingName.trim();
    if (!name) return;
    const success = await onRename(category.id, name);
    if (success) {
      setEditingId(null);
      setEditingName('');
      setMessage('Đã cập nhật danh mục.');
    } else {
      setMessage('Không thể đổi tên danh mục. Tên có thể đã tồn tại hoặc bạn chưa có quyền.');
    }
  };

  const handleDelete = async (category: InventoryCategory) => {
    if (!window.confirm(`Xóa danh mục "${category.name}"?`)) return;
    const success = await onDelete(category);
    setMessage(success ? 'Đã xóa danh mục.' : 'Không thể xóa danh mục đang được sử dụng hoặc bạn chưa có quyền.');
  };

  return (
    <ManagerModalFrame
      open={open}
      title="Quản lý danh mục"
      subtitle="Nhóm sản phẩm dùng để phân loại hàng hóa"
      icon={<Layers className="h-4 w-4" />}
      onClose={onClose}
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">Thêm danh mục</p>
        <div className="flex gap-2">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} className="h-9 min-w-0 flex-1 bg-white text-xs" placeholder="Ví dụ: Đồ gia dụng" />
          <Button type="button" onClick={() => void handleAdd()} disabled={!newName.trim()} className="h-9 px-3 text-xs">Thêm</Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700">Danh mục đã khai báo</p>
          <span className="text-[11px] text-slate-400">{categories.length}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {categories.map((category) => editingId === category.id ? (
            <div key={category.id} className="flex items-center gap-2 bg-slate-50 px-3 py-2">
              <Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} className="h-8 min-w-0 flex-1 bg-white text-xs" />
              <button type="button" onClick={() => void handleRename(category)} className="rounded-md px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100">Lưu</button>
              <button type="button" onClick={() => { setEditingId(null); setEditingName(''); }} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200">Hủy</button>
            </div>
          ) : (
            <div key={category.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate text-xs font-medium text-slate-700">{category.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => { setEditingId(category.id); setEditingName(category.name); setMessage(''); }} className="rounded-md p-1.5 text-sky-700 hover:bg-sky-50" aria-label={`Sửa danh mục ${category.name}`} title="Sửa danh mục"><Edit3 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void handleDelete(category)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" aria-label={`Xóa danh mục ${category.name}`} title="Xóa danh mục"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {!categories.length && <p className="px-3 py-4 text-center text-[11px] text-slate-400">Chưa có danh mục.</p>}
        </div>
      </div>
      {message && <p className="rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700">{message}</p>}
    </ManagerModalFrame>
  );
}

type UnitManagerModalProps = {
  open: boolean;
  units: InventoryUnit[];
  onClose: () => void;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (unit: InventoryUnit) => Promise<boolean>;
};

export function UnitManagerModal({ open, units, onClose, onAdd, onRename, onDelete }: UnitManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setNewName('');
      setEditingId(null);
      setEditingName('');
      setMessage('');
    }
  }, [open]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const success = await onAdd(name);
    if (success) {
      setNewName('');
      setMessage('Đã thêm đơn vị tính.');
    } else {
      setMessage('Không thể thêm đơn vị tính.');
    }
  };

  const handleRename = async (unit: InventoryUnit) => {
    const name = editingName.trim();
    if (!name) return;
    const success = await onRename(unit.id, name);
    if (success) {
      setEditingId(null);
      setEditingName('');
      setMessage('Đã đổi tên đơn vị tính.');
    } else {
      setMessage('Không thể đổi tên đơn vị tính.');
    }
  };

  const handleDelete = async (unit: InventoryUnit) => {
    if (Number(unit.inUseCount) > 0) {
      setMessage('Đơn vị đang được dùng bởi sản phẩm hoặc biến thể. Hãy đổi đơn vị trước khi xóa.');
      return;
    }
    if (!window.confirm(`Xóa đơn vị tính "${unit.name}"?`)) return;
    const success = await onDelete(unit);
    setMessage(success ? 'Đã xóa đơn vị tính.' : 'Không thể xóa đơn vị tính.');
  };

  return (
    <ManagerModalFrame
      open={open}
      title="Quản lý đơn vị tính"
      subtitle="Đơn vị cơ sở và biến thể dùng trong sản phẩm"
      icon={<Layers className="h-4 w-4" />}
      onClose={onClose}
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">Thêm đơn vị tính</p>
        <div className="flex gap-2">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} className="h-9 min-w-0 flex-1 bg-white text-xs" placeholder="Ví dụ: Cuộn, Mét, Thùng" />
          <Button type="button" onClick={() => void handleAdd()} disabled={!newName.trim()} className="h-9 px-3 text-xs">Thêm</Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700">Đơn vị đã khai báo</p>
          <span className="text-[11px] text-slate-400">{units.length}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {units.map((unit) => editingId === unit.id ? (
            <div key={unit.id} className="flex items-center gap-2 bg-slate-50 px-3 py-2">
              <Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} className="h-8 min-w-0 flex-1 bg-white text-xs" />
              <button type="button" onClick={() => void handleRename(unit)} className="rounded-md px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100">Lưu</button>
              <button type="button" onClick={() => { setEditingId(null); setEditingName(''); }} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200">Hủy</button>
            </div>
          ) : (
            <div key={unit.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{unit.name}</p>
                {Number(unit.inUseCount) > 0 && <p className="text-[10px] text-slate-400">Đang dùng ở {unit.inUseCount} sản phẩm/biến thể</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => { setEditingId(unit.id); setEditingName(unit.name); setMessage(''); }} className="rounded-md p-1.5 text-sky-700 hover:bg-sky-50" aria-label={`Sửa đơn vị ${unit.name}`} title="Sửa đơn vị"><Edit3 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void handleDelete(unit)} disabled={Number(unit.inUseCount) > 0} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Xóa đơn vị ${unit.name}`} title={Number(unit.inUseCount) > 0 ? 'Hãy đổi đơn vị đang sử dụng trước' : 'Xóa đơn vị'}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {!units.length && <p className="px-3 py-4 text-center text-[11px] text-slate-400">Chưa có đơn vị được lưu. Các đơn vị của sản phẩm sẽ tự xuất hiện sau khi lưu.</p>}
        </div>
      </div>
      {message && <p className="rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700">{message}</p>}
      <p className="text-[11px] text-slate-500">Biến thể bán hàng được chỉnh sửa hoặc xóa trong phần <b>Biến thể bán hàng</b> khi mở sửa sản phẩm.</p>
    </ManagerModalFrame>
  );
}

type PriceListManagerModalProps = {
  open: boolean;
  priceLists: InventoryPriceList[];
  onClose: () => void;
  onCreate: (name: string, customerType: string, markupMode: 'percent' | 'amount', markupValue: number) => Promise<boolean>;
  onRename: (id: string, name: string, customerType: string, markupMode: 'percent' | 'amount', markupValue: number) => Promise<boolean>;
  onDelete: (list: InventoryPriceList) => Promise<boolean>;
};

const customerTypeLabel = (value?: string) => value === 'loyal' ? 'Thân thiết' : value === 'retail' ? 'Bán lẻ' : 'Mọi nhóm khách';

export function PriceListManagerModal({ open, priceLists, onClose, onCreate, onRename, onDelete }: PriceListManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState('all');
  const [newMarkupMode, setNewMarkupMode] = useState<'percent' | 'amount'>('percent');
  const [newMarkupValue, setNewMarkupValue] = useState<number | string>(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCustomerType, setEditingCustomerType] = useState('all');
  const [editingMarkupMode, setEditingMarkupMode] = useState<'percent' | 'amount'>('percent');
  const [editingMarkupValue, setEditingMarkupValue] = useState<number | string>(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setNewName('');
      setNewCustomerType('all');
      setNewMarkupMode('percent');
      setNewMarkupValue(0);
      setEditingId(null);
      setEditingName('');
      setEditingCustomerType('all');
      setEditingMarkupMode('percent');
      setEditingMarkupValue(0);
      setMessage('');
    }
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const success = await onCreate(name, newCustomerType, newMarkupMode, Number(newMarkupValue) || 0);
    if (success) {
      setNewName('');
      setNewCustomerType('all');
      setNewMarkupMode('percent');
      setNewMarkupValue(0);
      setMessage('Đã tạo bảng giá mới.');
    } else {
      setMessage('Không thể tạo bảng giá.');
    }
  };

  const handleRename = async (list: InventoryPriceList) => {
    const name = editingName.trim();
    if (!name) return;
    const success = await onRename(list.id, name, editingCustomerType, editingMarkupMode, Number(editingMarkupValue) || 0);
    if (success) {
      setEditingId(null);
      setEditingName('');
      setMessage('Đã cập nhật bảng giá.');
    } else {
      setMessage('Không thể cập nhật bảng giá.');
    }
  };

  const handleDelete = async (list: InventoryPriceList) => {
    if (list.isDefault) {
      setMessage('Không thể xóa bảng giá mặc định.');
      return;
    }
    if (!window.confirm(`Xóa bảng giá "${list.name}"? Các giá đã nhập trong bảng này cũng sẽ bị xóa.`)) return;
    const success = await onDelete(list);
    setMessage(success ? 'Đã xóa bảng giá.' : 'Không thể xóa bảng giá.');
  };

  return (
    <ManagerModalFrame
      open={open}
      title="Quản lý bảng giá"
      subtitle="Tạo nhóm giá để chọn nhanh tại POS"
      icon={<Settings2 className="h-4 w-4" />}
      onClose={onClose}
    >
      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <div><h3 className="text-xs font-semibold text-slate-900">Bảng giá hiện có</h3><p className="text-[11px] text-slate-500">Giá từng sản phẩm được nhập trong ma trận đơn vị/biến thể; % hoặc số tiền là giá gợi ý.</p></div>
          <span className="text-[11px] font-medium text-slate-400">{priceLists.length} bảng</span>
        </div>
        <div className="divide-y divide-slate-100">
          {priceLists.map((list) => editingId === list.id ? (
            <div key={list.id} className="space-y-2 bg-slate-50 px-3 py-2">
              <Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} className="h-8 bg-white text-xs" />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_96px_auto_auto]">
                <select value={editingCustomerType} onChange={(event) => setEditingCustomerType(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs">
                  <option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option>
                </select>
                <select value={editingMarkupMode} onChange={(event) => setEditingMarkupMode(event.target.value as 'percent' | 'amount')} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs" aria-label="Kiểu điều chỉnh giá">
                  <option value="percent">Theo %</option>
                  <option value="amount">Theo tiền</option>
                </select>
                <div className="relative">
                  <Input type="number" min={editingMarkupMode === 'percent' ? '-100' : undefined} value={editingMarkupValue} onChange={(event) => setEditingMarkupValue(event.target.value)} className="h-8 bg-white pr-8 text-right text-xs" aria-label={editingMarkupMode === 'percent' ? 'Tỷ lệ giá so với giá cơ sở' : 'Số tiền cộng thêm so với giá cơ sở'} />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{editingMarkupMode === 'percent' ? '%' : 'đ'}</span>
                </div>
                <Button type="button" className="h-8 px-2 text-xs" onClick={() => void handleRename(list)}>Lưu</Button>
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setEditingId(null)}>Hủy</Button>
              </div>
            </div>
          ) : (
            <div key={list.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{list.name}</p>
                <p className="text-[11px] text-slate-400">{list.isDefault ? 'Mặc định · Giá cơ sở' : `${customerTypeLabel(list.customerType)} · ${formatPriceListAdjustment(list)}`}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => { const adjustment = getPriceListAdjustment(list); setEditingId(list.id); setEditingName(list.name); setEditingCustomerType(list.customerType || 'all'); setEditingMarkupMode(adjustment.mode); setEditingMarkupValue(adjustment.value); setMessage(''); }} className="rounded-md p-1.5 text-sky-700 hover:bg-sky-50" aria-label={`Sửa bảng giá ${list.name}`} title="Sửa bảng giá"><Edit3 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void handleDelete(list)} disabled={Boolean(list.isDefault)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Xóa bảng giá ${list.name}`} title={list.isDefault ? 'Không thể xóa bảng giá mặc định' : 'Xóa bảng giá'}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {priceLists.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">Chưa có bảng giá nào.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-900">Thêm bảng giá</h3>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_145px_105px_96px_auto]">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ví dụ: Giá cơ quan" className="h-9 bg-white text-xs" />
          <select value={newCustomerType} onChange={(event) => setNewCustomerType(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">
            <option value="all">Mọi nhóm khách</option><option value="retail">Bán lẻ</option><option value="loyal">Khách thân thiết</option>
          </select>
          <select value={newMarkupMode} onChange={(event) => setNewMarkupMode(event.target.value as 'percent' | 'amount')} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs" aria-label="Kiểu điều chỉnh giá mới">
            <option value="percent">Theo %</option>
            <option value="amount">Theo tiền</option>
          </select>
          <div className="relative">
            <Input type="number" min={newMarkupMode === 'percent' ? '-100' : undefined} value={newMarkupValue} onChange={(event) => setNewMarkupValue(event.target.value)} className="h-9 bg-white pr-8 text-right text-xs" placeholder="0" aria-label={newMarkupMode === 'percent' ? 'Tăng giá theo phần trăm' : 'Cộng tiền so với giá cơ sở'} />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{newMarkupMode === 'percent' ? '%' : 'đ'}</span>
          </div>
          <Button type="button" onClick={() => void handleCreate()} disabled={!newName.trim()} className="h-9 px-3 text-xs">Tạo bảng</Button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">Chọn Theo % để nhập 10 hoặc -10; chọn Theo tiền để cộng trực tiếp số tiền vào giá cơ sở.</p>
      </div>
      {message && <p className="rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700">{message}</p>}
    </ManagerModalFrame>
  );
}
