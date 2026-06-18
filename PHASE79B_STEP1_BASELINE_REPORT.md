# PHASE79B — BƯỚC 1: BASELINE VÀ PHẠM VI

## Kết quả

- Xác nhận đúng 18 file mức High còn lại từ báo cáo Phase79.
- Baseline trước sửa: 637/637 test đạt.
- JavaScript syntax: 715 file hợp lệ tại baseline.
- OpenAPI: 269 operation.
- Không có migration dữ liệu trong phạm vi refactor.

## Nguyên tắc bảo vệ

1. Không đổi route, controller, schema hoặc request/response.
2. Không đổi thuật toán giá, tồn kho, công nợ, trả hàng, quỹ hoặc import.
3. Nguồn trước refactor được khóa bằng SHA-256.
4. Chỉ thay đổi cấu trúc vật lý và cách tạo runtime artifact.

## Vùng ảnh hưởng

- Backend: order, return, report, import/export, mobile sales, delivery, fund, inventory, print builder/template.
- Frontend: sales order, import Excel, fund ledger, delivery web/mobile, mobile sales.
- CSS: mobile và print.
