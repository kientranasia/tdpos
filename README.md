# HKDPlus

HKDPlus là phần mềm quản lý bán hàng, hàng hóa, kho, đối tác, công nợ và thu/chi dành cho hộ kinh doanh Việt Nam. Mỗi khách hàng chạy một instance riêng trên máy chủ nội bộ; các máy trạm truy cập qua mạng LAN.

## Chạy tại máy phát triển

Yêu cầu Node.js:

```bash
npm install
npm run seed
npm run server
npm run dev
```

Mặc định:

- Web: `http://localhost:3001`
- API: `http://localhost:3101`
- Tài khoản demo: `owner@hkdplus.local` / `123456`
- Tài khoản quản trị kỹ thuật: `admin@hkdplus.local` / `admin123`

Các biến môi trường quan trọng: `JWT_SECRET`, `API_PORT`, `HKDPLUS_INSTANCE_SECRET`, `HKDPLUS_LICENSE_PUBLIC_KEY`, `HKDPLUS_LICENSE_SERVER_URL` (tùy chọn, dùng khi có license server online).

## Cài đặt Docker trong mạng LAN

```bash
docker compose up -d --build
```

Web mặc định mở ở cổng `80`, vì vậy máy trạm có thể vào thẳng `http://hkd.care` không cần thêm `:8077`. Nếu cổng 80 đang được dùng, chạy `WEB_PUBLIC_PORT=8077 docker compose up -d --build` và truy cập `http://hkd.care:8077`. API không public ra ngoài, chỉ được nginx trong mạng Docker chuyển tiếp. Dữ liệu SQLite nằm trong volume `tdpos_data`.

Tài khoản demo Docker mặc định: `owner@hkdplus.local` / `123456`. Tài khoản quản trị kỹ thuật: `admin@hkdplus.local` / `123456` (nên đổi qua biến môi trường trước khi cài thật).

Để các thiết bị cùng Wi‑Fi tự phân giải tên mà không sửa `hosts` từng máy, cần cấu hình một lần trên router/access point:

1. Gán IP cố định cho máy chủ, ví dụ `192.168.1.5` (DHCP reservation).
2. Trong mục Local DNS/DNS Hostname/Static DNS, thêm `hkd.care` trỏ tới `192.168.1.5`.
3. Đảm bảo DHCP của router cấp chính router làm DNS cho các thiết bị; ngắt/kết nối lại Wi‑Fi để nhận cấu hình mới.

Một số router không cho dùng vùng `.local` vì đây là vùng mDNS. Khi đó nên tạo thêm tên `hkdplus.home.arpa` hoặc `hkdplus.lan` trỏ cùng IP; đây là cách ổn định hơn trên Windows/Android/iOS.

Phương án tạm thời nếu router không có Local DNS là thêm vào file hosts:

```text
<IP_MAY_CHU>    hkd.care
```

Sau đó mở `http://hkd.care`. Màn hình Cài đặt → Thông tin hệ thống hiển thị IP, URL LAN, trạng thái SQLite, license và các bản sao lưu gần nhất.

## Dữ liệu và an toàn vận hành

- Tồn kho, công nợ và số dư tiền được ghi qua ledger/transaction có liên kết chứng từ.
- Có thể tạo bản sao lưu SQLite từ Cài đặt → Sao lưu & khôi phục.
- License instance xác minh bằng public key và machine fingerprint; hết hạn không xóa dữ liệu.
- Các trường MST, thuế suất, tiền thuế và dữ liệu chứng từ được lưu để xuất báo cáo kế toán/thuế về sau.
- Tích hợp hóa đơn điện tử chưa bật trong MVP; adapter sẽ được triển khai riêng.
