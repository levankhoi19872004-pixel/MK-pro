# BASELINE TEST FIXTURE TIME DEPENDENCY — RESOLVED

## Trạng thái

Đã xử lý trong patch `2026-06-21-01-gate-fix` mà không sửa service nghiệp vụ.

## Nguyên nhân gốc

Hai test hiệu năng dùng `dateTo: 2026-06-20`. Từ ngày 2026-06-21, `InventoryReportService` hợp lệ chạy thêm một aggregation để backcast tồn kho từ hiện tại về cuối kỳ báo cáo. Vì vậy assertion cố định `pipelines.length === 1` trở thành phụ thuộc ngày chạy.

## Cách sửa

- Fixture transaction và khoảng ngày test dùng `todayVN()` tại thời điểm chạy.
- Assertion về một lần đọc Product và một aggregation trong trường hợp ngày báo cáo là hiện tại vẫn được giữ nguyên.
- Không sửa `InventoryReportService`, công thức tồn kho hoặc query production.

## Kết quả

- Hai test mục tiêu: PASS.
- Full suite Linux: 974 tests / 973 pass / 0 fail / 1 skip.
- Trên Windows, hai integration test POSIX SIGTERM được skip có lý do; phải chạy trên Linux/Render staging để chứng minh signal behavior.
