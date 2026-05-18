# TDPOS Go-Live Checklist (Sprint 1)

> Mục tiêu: đạt baseline ổn định để deploy dùng thử (UAT/Production).  
> Trạng thái chuẩn: `PASS` / `FAIL` / `BLOCKED` / `N/A`

## 1) Thông tin chung

- Release name:
- Sprint window:
- UAT URL:
- Production URL:
- Release owner:
- QA owner:
- Engineering owner:

## 2) Checklist chi tiết

| ID | Area | Item | Owner | Due Date | Status | Evidence/Notes |
|---|---|---|---|---|---|---|
| SEC-01 | Security | Tenant isolation test: user A không đọc/ghi được data tenant B |  |  |  |  |
| SEC-02 | Security | Role permissions đúng theo owner/manager/cashier/warehouse |  |  |  |  |
| SEC-03 | Security | Login guard/rate-limit cho `/api/auth/login` và `/api/admin/login` |  |  |  |  |
| SEC-04 | Security | JWT secret + env production validated |  |  |  |  |
| POS-01 | POS | Add/update/remove cart item hoạt động ổn định |  |  |  |  |
| POS-02 | POS | Checkout cash/transfer/debt chính xác |  |  |  |  |
| POS-03 | POS | Invoice lưu đúng tổng tiền/giảm giá/ghi chú/người thao tác |  |  |  |  |
| POS-04 | POS | Barcode scan bằng camera mobile hoạt động |  |  |  |  |
| POS-05 | POS | Barcode scan bằng USB/Bluetooth scanner hoạt động |  |  |  |  |
| POS-06 | POS | Draft order save/load/remove hoạt động |  |  |  |  |
| INV-01 | Inventory | CRUD sản phẩm (sku/barcode/unit/category/price/stock) |  |  |  |  |
| INV-02 | Inventory | Nhập/xuất/kiểm kê cập nhật tồn kho chính xác |  |  |  |  |
| INV-03 | Inventory | Lịch sử kho hiển thị metadata đầy đủ (type, sku, actor, delta, time) |  |  |  |  |
| INV-04 | Inventory | Import CSV/XLSX: tải mẫu + preview + row select + apply |  |  |  |  |
| DEBT-01 | Debt | Ledger công nợ tăng/giảm đúng logic, không âm sai |  |  |  |  |
| DEBT-02 | Debt | Thu nợ cập nhật đúng customer profile + timeline |  |  |  |  |
| SUB-01 | Subscription | Trial 14 ngày + access gating đúng |  |  |  |  |
| SUB-02 | Subscription | Request nâng cấp tạo record + feedback rõ ràng |  |  |  |  |
| ADM-01 | Admin | Tenant management (create/edit/status) |  |  |  |  |
| ADM-02 | Admin | Package management (price/max users/default) |  |  |  |  |
| ADM-03 | Admin | Subscription review (approve/reject/renew) |  |  |  |  |
| ADM-04 | Admin | User management + reset password |  |  |  |  |
| ADM-05 | Admin | Audit log ghi nhận hành động chính |  |  |  |  |
| UX-01 | UIUX | Mobile/tablet không bị đè content với footer/header |  |  |  |  |
| UX-02 | UIUX | Header/action bar đồng bộ desktop toàn app |  |  |  |  |
| UX-03 | UIUX | Popup/flow không dead-end (bấm được tiếp) |  |  |  |  |
| OPS-01 | Ops | Docker UAT chạy đúng port/env |  |  |  |  |
| OPS-02 | Ops | Docker Production chạy đúng port/env |  |  |  |  |
| OPS-03 | Ops | `/api/health` phản hồi OK |  |  |  |  |
| OPS-04 | Ops | Bootstrap admin từ `.env` hoạt động |  |  |  |  |
| OPS-05 | Ops | Backup + restore DB test thành công ít nhất 1 lần |  |  |  |  |

## 3) Smoke test nhanh trước khi cut release

1. Đăng nhập owner tenant.
2. Tạo sản phẩm có barcode.
3. Quét mã thêm vào POS, tạo hóa đơn.
4. Kiểm tra trừ tồn kho + log kho.
5. Tạo đơn ghi nợ và thu nợ một phần.
6. Verify công nợ khách hàng.
7. Verify admin nhìn thấy tenant/subscription/audit log.
8. Verify mobile/tablet layout cho POS, Kho, Công nợ.

## 4) Blockers & quyết định

| Date | Blocker | Impact | Decision | Owner |
|---|---|---|---|---|
|  |  |  |  |  |

## 5) Release sign-off

- Product sign-off:
- QA sign-off:
- Engineering sign-off:
- Go-live decision: `GO / NO-GO`

