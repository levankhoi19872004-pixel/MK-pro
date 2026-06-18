# PHASE80 — BƯỚC 6: TRIỂN KHAI, MIGRATION VÀ ROLLBACK

## Nguyên tắc

Không bật tất cả module trong một lần deploy.

## Thứ tự triển khai

1. Deploy artifact với toàn bộ module mới tắt.
2. Chạy `npm run mongo:indexes`.
3. Kiểm tra `/api/enterprise/readiness`.
4. Bật enterprise core và outbox worker.
5. Bật mua hàng; chạy `supplier-ap:rebuild:dry`, đối chiếu rồi mới `supplier-ap:rebuild` nếu có dữ liệu ledger.
6. Bật kho nâng cao.
7. Bật projection và chạy `npm run analytics:rebuild`.
8. Bật mobile offline.
9. Bật tuyến bán và điều hành giao.
10. Bật integration sau khi cấu hình hostname allowlist.

## Multi-tenant

Giữ:

```env
TENANT_MODE=single
TENANT_MIGRATION_CONFIRMED=false
```

Chỉ chuyển `multi` sau:

- Backup thành công.
- `tenant:backfill:dry` và `tenant:backfill`.
- Audit business-key/index trùng.
- Staging smoke test.
- Restore drill.
- Xác nhận tenant isolation.

## Rollback

### Rollback từng module

Đặt feature flag tương ứng về `false` và restart service.

### Rollback toàn bộ

Redeploy Phase79C. Không có migration phá hủy dữ liệu cũ. Collection mới có thể giữ nguyên và không được đọc khi route tắt.

## Rủi ro còn lại

- Chưa được phép bật multi-tenant production ngay.
- Chưa được phép bật integration nếu không có allowlist.
- Không nên bật mobile offline trước khi route sync đã smoke test trên thiết bị thật.
