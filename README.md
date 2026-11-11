# HKDPlus

HKDPlus là phần mềm quản lý bán hàng, hàng hóa, kho, đối tác, công nợ và thu/chi dành cho hộ kinh doanh Việt Nam. Mỗi khách hàng chạy một instance riêng trên máy chủ nội bộ; các máy trạm truy cập qua mạng LAN.

## Chạy tại máy phát triển

Yêu cầu Node.js:

```bash
npm install
SEED_DEMO_PASSWORD='mật-khẩu-demo-tối-thiểu-10-ký-tự' npm run seed
npm run server
npm run dev
```

Mặc định:

- Web: `http://localhost:3000`
- API: `http://localhost:3101`
- Tài khoản demo chỉ được tạo khi chủ động chạy lệnh seed với `SEED_DEMO_PASSWORD`; mật khẩu không có giá trị mặc định.

Các biến môi trường quan trọng: `JWT_SECRET`, `API_PORT`, `HKDPLUS_INSTANCE_SECRET`, `HKDPLUS_LICENSE_PUBLIC_KEY`, `HKDPLUS_LICENSE_SERVER_URL` (tùy chọn, dùng khi có license server online).

## Cài đặt Docker cho bản online (Cloudflare Tunnel)

```bash
docker compose up -d --build
```

Compose chính dành cho máy chủ online đứng sau Cloudflare Tunnel. Cloudflare xử lý HTTPS công khai; gateway trên máy chủ chỉ lắng nghe HTTP nội bộ, mặc định tại `127.0.0.1:4534`. API không public ra ngoài, chỉ được reverse proxy trong mạng Docker chuyển tiếp. Dữ liệu SQLite nằm trong volume `tdpos_data`.

Trong cấu hình Cloudflare Tunnel, đặt service của hostname `hkdsmart.trandao.vn` tới:

```text
http://127.0.0.1:4534
```

Nếu `cloudflared` chạy trong container riêng, `127.0.0.1` là chính container đó; khi ấy dùng địa chỉ host mà container truy cập được hoặc dùng network mode phù hợp. Không trỏ tunnel vào cổng HTTPS nội bộ của bản offline.

Không bật redirect HTTPS ở origin. Nếu Cloudflare đang để chế độ `Flexible`, đổi sang `Full` hoặc `Full (strict)` khi đi qua origin HTTPS trực tiếp; với Cloudflare Tunnel hiện tại, origin HTTP như trên là cấu hình đơn giản và tránh vòng lặp redirect.

Nếu đổi hostname hoặc cổng, tạo `.env` từ `.env.prod.example` và đặt `HKDPLUS_HOSTNAME`, `HKDPLUS_PUBLIC_URL`, `WEB_HTTP_PORT` tương ứng trước khi chạy Compose.

Docker không chạy seed và không tạo tài khoản mặc định. Lần đầu, owner đăng ký trên máy chủ hoặc dùng setup token một lần; sau đó owner tạo các tài khoản nhân viên trong Cài đặt → Nhân viên & quyền.

Nếu khởi động với cơ sở dữ liệu trống, mã khởi tạo owner một lần được in trong log API (`docker compose logs api`). Chỉ gửi mã này cho người quản trị cửa hàng; mã sẽ vô hiệu ngay sau khi owner đầu tiên được tạo. Không sao chép file `.env` phát triển vào gói cài đặt khách hàng; secret production phải để trống để instance tự sinh hoặc thay bằng secret ngẫu nhiên riêng cho khách hàng.

## Cài đặt Docker offline trong mạng LAN

Để chạy gói offline có reverse proxy và HTTPS nội bộ:

```bash
docker compose -f docker-compose.offline.yml up -d --build
```

Thiết bị cùng Wi‑Fi có thể truy cập bằng hostname nội bộ (ví dụ `https://hkdplus.lan`) nếu router có Local DNS; màn hình Cài đặt hiển thị QR/URL LAN để chia sẻ. Với HTTPS nội bộ, cần cài chứng chỉ CA nội bộ của gateway trên điện thoại/máy trạm một lần.

Để các thiết bị cùng Wi‑Fi tự phân giải tên mà không sửa `hosts` từng máy, cần cấu hình một lần trên router/access point:

1. Gán IP cố định cho máy chủ, ví dụ `192.168.1.5` (DHCP reservation).
2. Trong mục Local DNS/DNS Hostname/Static DNS, thêm `hkdplus.lan` trỏ tới `192.168.1.5`.
3. Đảm bảo DHCP của router cấp chính router làm DNS cho các thiết bị; ngắt/kết nối lại Wi‑Fi để nhận cấu hình mới.

Một số router không cho dùng vùng `.local` vì đây là vùng mDNS. Khi đó nên tạo thêm tên `hkdplus.home.arpa` hoặc `hkdplus.lan` trỏ cùng IP; đây là cách ổn định hơn trên Windows/Android/iOS.

Phương án tạm thời nếu router không có Local DNS là thêm vào file hosts:

```text
<IP_MAY_CHU>    hkdplus.lan
```

Sau đó mở `https://hkdplus.lan`. Màn hình Cài đặt → Thông tin hệ thống hiển thị IP, URL LAN, trạng thái SQLite, license và các bản sao lưu gần nhất.

## Dữ liệu và an toàn vận hành

- Tồn kho, công nợ và số dư tiền được ghi qua ledger/transaction có liên kết chứng từ.
- Có thể tạo bản sao lưu SQLite từ Cài đặt → Sao lưu & khôi phục.
- License instance xác minh bằng public key và machine fingerprint; hết hạn không xóa dữ liệu.
- Các trường MST, thuế suất, tiền thuế và dữ liệu chứng từ được lưu để xuất báo cáo kế toán/thuế về sau.
- Tích hợp hóa đơn điện tử chưa bật trong MVP; adapter sẽ được triển khai riêng.
