# PHASE80B — BƯỚC 3: KIỂM THỬ VÀ XÁC MINH

Ngày thực hiện: 19/06/2026

## Kiểm thử nghiệp vụ mới

Đã bổ sung `test/excel-product-catalog-rule.test.js` để kiểm tra:

- Quy cách chỉ là số, ví dụ 24.
- Giá bán lấy từ danh mục sản phẩm.
- Không fallback catalog field sang giá chứng từ.
- Đơn con giữ Giá sau KM riêng biệt.
- Đơn tổng, phiếu nhập và trả hàng dùng metadata danh mục hiện tại.
- Excel từ mẫu Invoice-36 có Quy cách, Giá bán và vẫn có giá sau KM.
- Mẫu in giấy không bị thay đổi số cột hiển thị.

## Kết quả quality gate

| Hạng mục | Kết quả |
|---|---:|
| Regression test | 665/665 PASS |
| Fail / Skip | 0 / 0 |
| JavaScript syntax | 804 file PASS |
| Path portability | 1.284 path PASS |
| Source bundle | 18/18 PASS |
| Source-size budget | PASS |
| Enterprise smoke | 10 module, 9 flag PASS |
| OpenAPI | 303 operation, up-to-date |
| Production audit | 0 vulnerability |
| Runtime `require('./src/app')` | PASS |

## Tương thích

- Không migration dữ liệu.
- Không thay đổi API endpoint/request/response.
- Không thay đổi tồn kho, công nợ, quỹ hoặc lifecycle chứng từ.
- Không thay đổi tính tiền của đơn cũ.
- Không xóa cột giá sau khuyến mại của đơn con.
