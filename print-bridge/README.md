# HKD Smart Print Bridge (offline)

Print Bridge là dịch vụ nhỏ chạy trên máy chủ cài bản offline. HKD Smart gửi nội dung phiếu qua cùng hostname HTTPS; bridge chuyển nội dung đó tới máy in nhiệt mạng (TCP/9100) hoặc máy in đã cài trên Windows.

## Cài trên Windows

1. Cài Node.js 22 LTS trên máy chủ chạy HKD Smart.
2. Sao chép `print-bridge/bridge.env.example` thành `print-bridge/bridge.env` và sửa các giá trị máy in.
3. Chạy từ thư mục dự án:

```powershell
node --env-file=print-bridge/bridge.env print-bridge/server.mjs
```

Giữ cửa sổ này chạy trong lúc kiểm tra. Khi vận hành chính thức, có thể đăng ký lệnh trên Task Scheduler hoặc đóng gói thành Windows Service.

## Cấu hình máy in

Máy in nhiệt mạng (khuyến nghị):

```env
PRINT_BRIDGE_PRINTER_MODE=network
PRINT_BRIDGE_PRINTER_HOST=192.168.1.80
PRINT_BRIDGE_PRINTER_PORT=9100
```

Máy in USB hoặc máy in đã cài trong Windows:

```env
PRINT_BRIDGE_PRINTER_MODE=windows
PRINT_BRIDGE_PRINTER_NAME=EPSON TM-T82
```

Bridge dùng raw printing để không mở hộp thoại in. Với máy in nhiệt, nên chọn đúng khổ 80mm/58mm trong `PRINT_BRIDGE_PAPER_WIDTH` (42 hoặc 32 ký tự).

## Kiểm tra

```powershell
Invoke-RestMethod http://127.0.0.1:17650/health
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:17650/test -Headers @{ 'X-Print-Bridge-Token' = 'token-trong-file-env' } -ContentType 'application/json' -Body '{}'
```

Khi chạy qua gateway offline, ứng dụng gọi `/print-bridge/print`, nên điện thoại trong cùng Wi-Fi không cần mở port bridge riêng và không gặp lỗi mixed-content HTTPS.

## An toàn

- Chỉ mở bridge trong mạng nội bộ.
- Luôn đặt `PRINT_BRIDGE_TOKEN` khác giá trị mẫu.
- Bridge không nhận địa chỉ máy in tùy ý từ trình duyệt; nó chỉ in tới máy in đã cấu hình trên máy chủ.
