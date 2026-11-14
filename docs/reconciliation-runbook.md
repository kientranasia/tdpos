# Kịch bản rà soát liên kết dữ liệu HKD Smart

Bộ kiểm tra này chỉ đọc dữ liệu qua API, không tạo, sửa hoặc xóa chứng từ. Có thể chạy trên bản offline SQLite hoặc bản SaaS PostgreSQL.

## Phạm vi kiểm tra

- Hóa đơn: số lượng, doanh thu, đã thu, công nợ phát sinh, phương thức thanh toán.
- Báo cáo: đối chiếu summary và danh sách chứng từ bán với dữ liệu hóa đơn.
- Khách hàng: tổng công nợ hồ sơ, báo cáo và dashboard.
- Nhà cung cấp: số dư phải trả với sổ phải trả.
- Hàng hóa: tổng số sản phẩm, tồn hiện tại và biến động kho gần nhất.
- API health, đăng nhập và quyền đọc dữ liệu.

## Chạy local HTTPS

```bash
HKDPLUS_BASE_URL=https://localhost:6688 \
HKDPLUS_SMOKE_EMAIL='email-tài-khoản' \
HKDPLUS_SMOKE_PASSWORD='mật-khẩu' \
HKDPLUS_TLS_INSECURE=true \
npm run test:reconciliation
```

Nếu dùng HTTP hoặc chứng thư hợp lệ, bỏ `HKDPLUS_TLS_INSECURE=true`. Có thể giới hạn khoảng thời gian:

```bash
HKDPLUS_RECON_FROM=2026-11-01 \
HKDPLUS_RECON_TO=2026-11-14 \
npm run test:reconciliation
```

Kết quả tóm tắt được in ra màn hình. Findings đầy đủ được ghi vào `docs/reconciliation-findings.md`. Mã P0/P1 làm lệnh kết thúc lỗi để CI/deployment chặn phát hành; P2 là cảnh báo cần rà soát. Dùng `HKDPLUS_RECON_STRICT=true` nếu muốn P2 cũng chặn.

## Nguyên tắc xử lý finding

1. Không sửa trực tiếp dữ liệu chỉ vì checker báo lệch.
2. Xác định chứng từ nguồn và người thực hiện trước khi điều chỉnh.
3. Với công nợ không có dòng sổ chi tiết, phân loại là số dư đầu kỳ/legacy và bổ sung chứng từ điều chỉnh có audit.
4. Chạy lại checker sau khi sửa; findings cũ được lưu trong Git history cùng lần cập nhật.

## Ghi chú sau lần chạy 2026-11-14

- API báo cáo trả `Cache-Control: no-store`; summary doanh thu, đã thu, công nợ và thu/chi được tính lại từ đúng các dòng chi tiết trong cùng bộ lọc.
- Checker tồn kho chỉ so sánh tồn hiện tại với biến động mới nhất của từng sản phẩm. Nếu nhiều biến động cùng thời điểm có số tồn sau giao dịch khác nhau, checker ghi P2 vì không đủ dữ liệu thứ tự để kết luận.
- Findings đã ghi trong `reconciliation-findings.md` là ảnh chụp của lần chạy trước cập nhật. Khởi động lại API đang chạy rồi chạy lại reconciliation để xác nhận trạng thái mới; không tự điều chỉnh tồn kho hay chứng từ theo các finding cũ.
