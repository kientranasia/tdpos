# Import đối tác và công nợ từ Kiot Việt

## Bộ file được hỗ trợ

Luồng **Nhập dữ liệu** tại mục Khách hàng/Nhà cung cấp nhận bốn dạng file xuất:

| Dạng file | Nhận diện | Dữ liệu xử lý |
| --- | --- | --- |
| Danh sách khách hàng | Có cột `Mã khách hàng` | Hồ sơ khách hàng, nhóm, khu vực, thông tin liên hệ, thông tin xuất hóa đơn, ngân hàng, tổng bán và số dư nợ |
| Danh sách nhà cung cấp | Có cột `Mã nhà cung cấp` | Hồ sơ nhà cung cấp, nhóm, khu vực, MST/CCCD, tổng mua và số dư phải trả |
| Công nợ chi tiết khách hàng | Có cột `Ghi nợ` và `Ghi có`, metadata có `Mã KH` | Chứng từ, dòng sản phẩm, thành tiền, ghi nợ/ghi có, ghi chú từng chứng từ |
| Công nợ chi tiết nhà cung cấp | Có cột `Ghi nợ` và `Ghi có`, metadata có `Mã NCC` | Chứng từ, dòng sản phẩm, giá nhập/trả, giảm giá, VAT, ghi nợ/ghi có, ghi chú |

Tiêu đề được chuẩn hóa không dấu và không phân biệt khoảng trắng, nên các file xuất cùng cấu trúc nhưng khác cách xuống dòng vẫn được nhận diện.

## Nguyên tắc cập nhật

- Mã khách hàng/mã nhà cung cấp là khóa đối chiếu. File chạy lại sẽ cập nhật bản ghi cũ, không tạo bản sao.
- Bảng danh sách cập nhật số dư hiện tại theo giá trị trong file. Nếu số dư thay đổi, hệ thống ghi thêm một dòng điều chỉnh vào sổ công nợ với batch import và người thực hiện.
- Bảng công nợ chi tiết chỉ bổ sung lịch sử chứng từ vào thẻ công nợ; không cộng lại vào số dư, tránh ghi nhận trùng với bảng danh sách.
- Mỗi batch được khóa bằng mã băm của nguồn, loại dữ liệu và nội dung file để chạy lại cùng file không nhân đôi dữ liệu.
- Sản phẩm/dòng chi tiết trong công nợ được lưu ở `detailsJson`, giữ mã, diễn giải, đơn vị, số lượng, đơn giá và các trường tiền của file nguồn để phục vụ xem lại/export.
- Dữ liệu hiện có nhưng không xuất hiện trong file không bị xóa.

## Trình tự khuyến nghị

1. Import danh sách khách hàng và danh sách nhà cung cấp.
2. Kiểm tra xem trước, xử lý các dòng thiếu mã hoặc thiếu tên rồi xác nhận import.
3. Import từng file công nợ chi tiết sau khi đối tác đã có trong hệ thống.
4. Mở hồ sơ khách hàng/nhà cung cấp để kiểm tra số dư và lịch sử công nợ.

## Trường nguồn giữ lại

Các cột mở rộng của Kiot Việt được lưu cùng hồ sơ đối tác, gồm `sourceSystem`, `sourceCode`, `sourceBranch`, nhóm, khu vực/phường, trạng thái, người tạo, ngày tạo, giao dịch cuối, thông tin xuất hóa đơn, ngân hàng và dữ liệu dòng gốc. Điều này cho phép rà soát hoặc bổ sung mapping về sau mà không mất dữ liệu nguồn.

## API

- `POST /api/partners/import/preview`: đọc và kiểm tra batch, không ghi dữ liệu.
- `POST /api/partners/import`: ghi batch theo transaction và idempotency.
- `GET /api/partners/import-history`: xem các batch đã chạy.
- `GET /api/partners/import-history/:batchId/issues`: xem lỗi theo dòng.
- `GET /api/customers/:id/debt-statement`: xem công nợ khách gồm dữ liệu import.
- `GET /api/suppliers/:id/debt-statement`: xem công nợ nhà cung cấp gồm dữ liệu import.
