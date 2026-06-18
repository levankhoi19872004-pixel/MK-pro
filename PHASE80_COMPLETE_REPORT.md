# PHASE80 — ENTERPRISE EXPANSION & OPTIMIZATION

## 1. Tổng quan

Phase80 mở rộng MK-Pro từ hệ thống bán hàng/giao hàng đơn NPP thành nền tảng modular-monolith có khả năng phát triển thành ERP/DMS chuyên biệt, nhưng vẫn giữ an toàn cho nghiệp vụ đang chạy.

### Phạm vi hoàn thành

- P0: readiness, backup/restore mapping, quality/security gate.
- P1: command pipeline, transaction, idempotency, audit, outbox, strict schema.
- P2: mua hàng/AP, kho nâng cao, projection báo cáo, mobile offline, tuyến bán, điều hành giao và integration queue.
- P3 foundation: tenant context, tenant/subscription model, migration tooling và production guard.

## 2. Kiến trúc mới

```text
HTTP/Mobile
  → Auth + Tenant + Feature Flag + RBAC
  → Application Command Pipeline
  → Domain Service
  → Mongo Transaction
  → Inventory/AP/Fund Posting
  → Audit + Outbox
  → Background Worker / Integration Queue
```

17 strict collections mới được bổ sung, toàn bộ có index definition và backup mapping.

## 3. Tối ưu hóa chính

### Độ ổn định

- Không bật module mới mặc định.
- Rollback theo feature flag.
- AP balance atomic chống thanh toán đồng thời vượt nợ.
- Purchase return receipt-bound và quantity guard.
- Offline sync idempotent, canonical hash, retry và stale-processing recovery.
- Backup cũ tương thích; backup mới bao phủ domain mới.

### Hiệu năng

- Reporting projection tách truy vấn dashboard/báo cáo khỏi operational read phức tạp.
- Worker xử lý nền theo polling và claim lock.
- BulkWrite cho projection.
- Index theo tenant/status/date/ref cho collection mới.
- Source-size guard và modular boundary tiếp tục được giữ.

### Bảo mật

- Strict schema.
- RBAC và feature flag tại route.
- Tenant lấy từ auth context.
- Integration HTTPS + allowlist chống SSRF.
- HttpOnly cookie/CSRF boundary cũ được giữ nguyên.
- CI chạy quality đầy đủ trên Node 20 và 22.

## 4. API

OpenAPI tăng từ 269 lên 303 operations, bổ sung 34 operations cho:

- Purchase/AP.
- Warehouse advanced.
- Analytics projections.
- Mobile sync.
- Field operations.
- Delivery planning.
- Integrations.
- Platform/tenant.
- Enterprise status/readiness.

## 5. Giao diện

Trang `/enterprise.html` cung cấp:

- Database/readiness.
- Feature flags.
- Outbox và integration stats.
- Dữ liệu nhanh của các module.
- Rebuild projection và drain queue qua API RBAC.

## 6. Quality gate

- 800 JavaScript files syntax PASS.
- 18/18 source bundles PASS.
- Source-size budget PASS.
- Enterprise smoke PASS.
- OpenAPI 303 operations.
- 657/657 tests PASS.
- 0 production vulnerability.

## 7. Hạn chế cần hiểu đúng

Phase80 cung cấp code, API, schema, worker, UI vận hành, migration và quality gate. Tuy nhiên môi trường đóng gói không có MongoDB staging/production nên chưa thể xác nhận bằng dữ liệu thật:

- Transaction integration trên replica set.
- Restore drill thật.
- Load benchmark theo dữ liệu NPP.
- External webhook egress.
- Tenant isolation end-to-end.

Vì vậy multi-tenant vẫn bị khóa ở `TENANT_MODE=single`; module mới phải bật lần lượt theo checklist.

## 8. Khuyến nghị triển khai

Phương án production-grade là deploy code với flag tắt, tạo index, smoke test, sau đó bật từng domain. Không bật toàn bộ Phase80 trong một lần.
