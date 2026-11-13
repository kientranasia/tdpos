# HKD Smart deployment profiles

HKD Smart dùng một codebase và hai profile triển khai. Giao diện, nghiệp vụ
bán hàng, hàng hóa, kho, đối tác, công nợ và báo cáo được dùng chung; chỉ
database provider, bootstrap và hạ tầng runtime thay đổi theo profile.

## Profile online SaaS

- Compose: docker-compose.yml
- Environment: .env.saas-postgres.example
- Database: PostgreSQL 16, shared database, tenant isolation bằng tenant_id
- OFFLINE_MODE=false
- DATABASE_PROVIDER=postgres
- Platform admin tạo tenant và owner thủ công; không có public tenant registration.
- Cloudflare xử lý HTTPS; Tunnel trỏ tới HTTP gateway tại localhost:WEB_HTTP_PORT.
- Readiness: /api/ready; liveness: /api/health.

Luồng triển khai:

```text
Public hostname
  -> Cloudflare Tunnel
  -> Caddy gateway (localhost HTTP)
  -> web container
  -> API container
  -> PostgreSQL container
```

Tenant được xác định từ session đã ký ở server. Browser không được tự chọn
tenant bằng cách gửi tenantId tùy ý. Mọi truy vấn business phải giữ
tenant_id trong điều kiện truy vấn.

## Profile offline

- Compose: docker-compose.offline.yml
- Environment: .env.offline.example
- Database: SQLite trong volume cục bộ
- OFFLINE_MODE=true
- DATABASE_PROVIDER=sqlite
- ENABLE_PLATFORM_ADMIN=false
- Truy cập qua LAN/HTTPS nội bộ, mặc định `https://hkdsmart.local:6688` bằng
  mDNS/Bonjour; có thể thay bằng IP hoặc Local DNS theo môi trường khách hàng.

Profile offline không chạy PostgreSQL, không cần Cloudflare và không hiển thị
Platform Admin SaaS. Đây là gói cài đặt riêng cho từng khách hàng.

## Quy tắc cấu hình

Không trộn file environment hoặc volume giữa hai profile:

| Nhu cầu | Compose | Environment | Database |
| --- | --- | --- | --- |
| Online SaaS | docker-compose.yml | .env từ .env.saas-postgres.example | PostgreSQL |
| Offline khách hàng | docker-compose.offline.yml | .env từ .env.offline.example | SQLite |
| Online UAT | docker-compose.yml + docker-compose.uat.yml | .env.uat.example | PostgreSQL |

docker-compose.postgres.yml vẫn được giữ như tên tương thích cho các máy
đã triển khai bằng tên file cũ; cấu hình chuẩn mới là docker-compose.yml.

## Một repository, hai release profile

Không tạo project riêng cho online và offline. Mọi thay đổi dùng chung phải
được kiểm tra ở cả hai provider trước khi merge:

1. Type-check và build frontend.
2. Smoke test nghiệp vụ SQLite/offline.
3. PostgreSQL migration, readiness và tenant-isolation smoke test.
4. Kiểm tra compose với đúng environment profile.

Các tính năng chỉ dành cho SaaS phải được bảo vệ bằng cấu hình runtime như
OFFLINE_MODE và ENABLE_PLATFORM_ADMIN; không được để frontend tự quyết
quyền truy cập.

## Bảo mật và vận hành

- Secret production không commit và không dùng lại giữa các instance.
- PostgreSQL không expose port ra host; chỉ API trong Docker network truy cập.
- Chạy migration bằng npm run pg:migrate trong image PostgreSQL.
- Backup/restore PostgreSQL dùng npm run backup:postgres và runbook P0.
- Trước khi mở traffic sau deployment, kiểm tra /api/ready, logs restart,
  migration status và tenant-isolation smoke test.

## Release policy

- Tag offline có thể giữ baseline ổn định riêng, ví dụ offline-v1.x.
- Tag SaaS dùng profile PostgreSQL, ví dụ saas-v1.x.
- Không merge thay đổi hạ tầng PostgreSQL vào profile offline nếu không được
  kiểm tra portability; nhưng các thay đổi UI/nghiệp vụ dùng chung có thể
  merge vào cả hai release.
