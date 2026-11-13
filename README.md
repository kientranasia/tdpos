# HKDPlus

HKDPlus là phần mềm quản lý bán hàng, hàng hóa, kho, đối tác, công nợ và thu/chi dành cho hộ kinh doanh Việt Nam. Một codebase hỗ trợ hai profile: online SaaS dùng PostgreSQL dùng chung với tenant isolation, và offline dùng SQLite trên máy chủ nội bộ.

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

## Cài đặt Docker cho bản online SaaS (Cloudflare Tunnel + PostgreSQL)

```bash
cp .env.saas-postgres.example .env
# Thay toàn bộ placeholder secret/domain trong .env
docker compose config --quiet
docker compose up -d --build
```

Compose chính dành cho máy chủ SaaS online đứng sau Cloudflare Tunnel. Cloudflare xử lý HTTPS công khai; gateway trên máy chủ chỉ lắng nghe HTTP nội bộ, mặc định tại `127.0.0.1:6666`. Online dùng PostgreSQL dùng chung với `tenant_id` làm ranh giới dữ liệu; PostgreSQL không public ra ngoài, chỉ API truy cập trong mạng Docker. Dữ liệu nằm trong volume PostgreSQL.

Trong cấu hình Cloudflare Tunnel, đặt service của hostname đã khai báo trong `HKDPLUS_HOSTNAME` tới:

```text
http://127.0.0.1:6666
```

Nếu `cloudflared` chạy trong container riêng, `127.0.0.1` là chính container đó; khi ấy dùng địa chỉ host mà container truy cập được hoặc dùng network mode phù hợp. Không trỏ tunnel vào cổng HTTPS nội bộ của bản offline.

Không bật redirect HTTPS ở origin. Nếu Cloudflare đang để chế độ `Flexible`, đổi sang `Full` hoặc `Full (strict)` khi đi qua origin HTTPS trực tiếp; với Cloudflare Tunnel hiện tại, origin HTTP như trên là cấu hình đơn giản và tránh vòng lặp redirect.

Nếu đổi hostname hoặc cổng, đặt `HKDPLUS_HOSTNAME`, `HKDPLUS_PUBLIC_URL`, `CORS_ORIGINS`, `WEB_HTTP_PORT` tương ứng trước khi chạy Compose. Không dùng lại volume SQLite cũ cho profile PostgreSQL; đây là deployment SaaS riêng.

Online SaaS không cho khách tự đăng ký tenant. Lần đầu, điền `ADMIN_BOOTSTRAP_EMAIL` và `ADMIN_BOOTSTRAP_PASSWORD` trong `.env`, khởi động stack rồi đăng nhập khu vực quản trị nền tảng để tạo tenant và tài khoản owner thủ công. Sau khi platform admin đã được tạo, có thể bỏ mật khẩu bootstrap khỏi môi trường; các lần khởi động sau sẽ không tạo lại admin. Nếu để placeholder secret, API production sẽ từ chối khởi động.

Không sao chép file `.env` phát triển vào production. Các secret như `POSTGRES_PASSWORD`, `JWT_SECRET`, `HKDPLUS_INSTANCE_SECRET` và `HKDPLUS_SETUP_TOKEN` phải là giá trị riêng của instance. Không commit file `.env`.

Backup PostgreSQL:

```bash
npm run backup:postgres
```

Chi tiết restore và checklist production nằm trong `docs/saas-postgres-p0-runbook.md`.

## Cài đặt Docker offline trong mạng LAN

Để chạy gói offline có reverse proxy và HTTPS nội bộ:

```bash
cp .env.offline.example .env
docker compose --env-file .env --file docker-compose.offline.yml config --quiet
docker compose -f docker-compose.offline.yml up -d --build
```

Bản offline dùng SQLite, không bật Platform Admin SaaS và không dùng PostgreSQL. Giao diện và nghiệp vụ dùng chung với bản online; chỉ profile triển khai và database provider khác nhau.

Mặc định offline dùng hostname `hkdsmart.local` và HTTPS tại cổng `6688`:

```text
https://hkdsmart.local:6688
```

Tên `.local` được phân giải bằng mDNS/Bonjour, không cần mở cổng Internet hoặc cấu hình Cloudflare. Bộ cài offline cần bật mDNS trên máy chủ: macOS dùng Bonjour có sẵn; Linux cần `avahi-daemon`; Windows cần một mDNS/Bonjour responder. Nếu môi trường không hỗ trợ mDNS, có thể dùng IP LAN hoặc cấu hình Local DNS trên router/access point.

HTTPS dùng Local CA của Caddy. CA được lưu trong volume `caddy_data` và phải giữ volume này trong suốt vòng đời instance. Xuất CA để cài thủ công trên điện thoại/máy trạm:

```bash
./scripts/export-offline-ca.sh hkdsmart-local-ca.crt
```

Cài file CA một lần trên mỗi thiết bị; trên iPhone cần bật thêm quyền tin cậy trong **Cài đặt → Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng chỉ**. Sau đó điện thoại cùng Wi‑Fi có thể mở URL `https://hkdsmart.local:6688` và thêm vào màn hình chính như ứng dụng.

Nếu cần kiểm tra mạng trước khi cài CA, HTTP phụ chạy tại `http://hkdsmart.local:6687` hoặc `http://<IP_MAY_CHU>:6687`.

## Dữ liệu và an toàn vận hành

- Tồn kho, công nợ và số dư tiền được ghi qua ledger/transaction có liên kết chứng từ.
- Có thể tạo bản sao lưu SQLite từ Cài đặt → Sao lưu & khôi phục.
- License instance xác minh bằng public key và machine fingerprint; hết hạn không xóa dữ liệu.
- Các trường MST, thuế suất, tiền thuế và dữ liệu chứng từ được lưu để xuất báo cáo kế toán/thuế về sau.
- Tích hợp hóa đơn điện tử chưa bật trong MVP; adapter sẽ được triển khai riêng.
