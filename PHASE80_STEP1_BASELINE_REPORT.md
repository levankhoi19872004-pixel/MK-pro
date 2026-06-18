# PHASE80 — BƯỚC 1: BASELINE VÀ PHẠM VI

## Mục tiêu

Khóa hành vi của Phase79C trước khi mở rộng, tránh thay đổi nghiệp vụ cũ theo kiểu big-bang.

## Kết quả baseline

- 642/642 regression test đạt tại thời điểm bắt đầu.
- OpenAPI: 269 operations.
- Source bundle: 18/18 đồng bộ.
- Dependency audit production: 0 lỗ hổng mức High/Critical.
- Không có lỗi cú pháp JavaScript.

## Nguyên tắc triển khai

1. Module mới tắt mặc định bằng feature flag.
2. Không migration dữ liệu tự động khi server khởi động.
3. Ghi tồn kho, công nợ, quỹ phải qua transaction/posting boundary.
4. Giữ nguyên API và hành vi module cũ.
5. Mỗi phase có rollback bằng flag hoặc redeploy artifact Phase79C.

## Vùng ảnh hưởng được phép

- Application command pipeline.
- Tenant context tương thích single-tenant.
- Outbox, audit, worker và readiness.
- Các domain mới: mua hàng/AP, kho nâng cao, analytics projection, mobile offline, tuyến bán, điều hành giao, integration và tenant foundation.

## Vùng không thay đổi

- Lifecycle đơn bán hiện tại.
- Công nợ khách hàng hiện tại.
- Logic xác nhận kế toán hiện tại.
- Logic giá, khuyến mại và import DMS hiện tại.
