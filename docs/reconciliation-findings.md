# Findings đối soát liên module

- Thời điểm chạy: 2026-11-16T15:13:37.400Z
- API: https://localhost:6688
- Phạm vi ngày: đầu kỳ → hiện tại
- Số liệu đã đọc: 7 hóa đơn, 12726 sản phẩm, 485 khách hàng, 171 nhà cung cấp, 6915 biến động kho.

## Kết quả: 2 finding

### 1. [P2] Sổ công nợ không giải thích được số dư khách hàng (DEBT_LEDGER_BALANCE)

Tổng ledger ròng -494000, số dư hồ sơ 1400195140. Có thể là số dư đầu kỳ/legacy chưa có chứng từ ledger.

Evidence: `{"ledger":-494000,"customers":1400195140}`

### 2. [P2] Công nợ nhà cung cấp lệch sổ chi tiết (PAYABLE_LEDGER_BALANCE)

Tổng ledger ròng 19720, hồ sơ nhà cung cấp 365351209.

Evidence: `{"ledger":19720,"suppliers":365351209}`

## Các kiểm tra đã đạt

- **availability.health**: API health: ok
- **report.invoice_count**: 7 hóa đơn được đối chiếu theo kỳ.
- **report.revenue**: 666000.
- **report.collected**: 207000.
- **report.receivable**: 463000.
- **report.cashIncome**: 857000.
- **report.cashExpense**: 8108000.
- **report.payment_methods**: Tổng theo phương thức thanh toán khớp.
- **customer.debt_total**: 1400195140.
- **dashboard.debt_total**: 1400195140.
- **product.summary_count**: 12726 sản phẩm active.
- **stock.current_balance**: Tồn hiện tại khớp biến động mới nhất theo sản phẩm.
