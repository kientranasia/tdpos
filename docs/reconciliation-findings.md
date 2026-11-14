# Findings đối soát liên module

- Thời điểm chạy: 2026-11-14T08:07:52.742Z
- API: https://localhost:6688
- Phạm vi ngày: đầu kỳ → hiện tại
- Số liệu đã đọc: 2 hóa đơn, 12726 sản phẩm, 1 khách hàng, 1 nhà cung cấp, 6905 biến động kho.

## Kết quả: 9 finding

### 1. [P1] Số hóa đơn giữa báo cáo và dữ liệu gốc không khớp (REPORT_INVOICE_COUNT)

Dữ liệu gốc 2, chi tiết báo cáo 2, summary 0.

Evidence: `{"invoiceRows":2,"reportSales":2}`

### 2. [P1] Báo cáo lệch revenue (REPORT_REVENUE)

Giá trị báo cáo 0, tính từ dữ liệu gốc 478000.

Evidence: `{"report":0,"source":478000}`

### 3. [P1] Báo cáo lệch collected (REPORT_COLLECTED)

Giá trị báo cáo 0, tính từ dữ liệu gốc 15000.

Evidence: `{"report":0,"source":15000}`

### 4. [P1] Báo cáo lệch receivable (REPORT_RECEIVABLE)

Giá trị báo cáo 0, tính từ dữ liệu gốc 463000.

Evidence: `{"report":0,"source":463000}`

### 5. [P1] Báo cáo lệch cashIncome (REPORT_CASHINCOME)

Giá trị báo cáo 0, tính từ dữ liệu gốc 15000.

Evidence: `{"report":0,"source":15000}`

### 6. [P1] Lệch tổng theo phương thức Tiền mặt (PAYMENT_METHOD_TOTAL)

Dữ liệu gốc 15000, chi tiết báo cáo 0.

Evidence: `{"label":"Tiền mặt","source":15000,"report":0}`

### 7. [P1] Lệch tổng theo phương thức Công nợ (PAYMENT_METHOD_TOTAL)

Dữ liệu gốc 463000, chi tiết báo cáo 0.

Evidence: `{"label":"Công nợ","source":463000,"report":0}`

### 8. [P1] Công nợ khách hàng không khớp báo cáo (CUSTOMER_DEBT_TOTAL)

Tổng hồ sơ khách hàng 463000, báo cáo 0.

Evidence: `{"customers":463000}`

### 9. [P1] Tồn hàng không khớp giao dịch kho gần nhất (STOCK_MOVEMENT_CURRENT)

4 giao dịch gần nhất có tồn sau giao dịch khác tồn hiện tại.

Evidence: `{"samples":[{"productId":"b0b97fff-51ae-4d5e-9627-843a78b76b58","afterStock":2,"currentStock":0},{"productId":"f198f94d-4ba4-42c3-b0ca-a5697c47db0a","afterStock":3,"currentStock":0},{"productId":"5b709e42-f1b4-4251-a029-2d780b3a30be","afterStock":54,"currentStock":53},{"productId":"34d01a58-0f61-4926-a556-3971bb2e835f","afterStock":4,"currentStock":0}]}`

## Các kiểm tra đã đạt

- **availability.health**: API health: ok
- **report.cashExpense**: 0.
- **dashboard.debt_total**: 463000.
- **debt.ledger_balance**: 463000.
- **payable.ledger_balance**: 0.
- **product.summary_count**: 12726 sản phẩm active.
