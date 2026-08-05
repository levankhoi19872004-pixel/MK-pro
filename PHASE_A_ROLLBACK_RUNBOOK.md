# PHASE A — ROLLBACK RUNBOOK

**Scope:** Canonical Delivery Financial Read Model (`delivery-financial-v1`)  
**Reader flag:** `CANONICAL_DELIVERY_FINANCIAL_READ_V1=off|shadow|on`  
**Data mutation:** Không có. Phase này chỉ thay đổi read model.

## 1. Rollout modes

- `off`: giữ output legacy; là chế độ rollback tức thời.
- `shadow`: trả output legacy, tính canonical read-only theo sampling để đo diff.
- `on`: Web và App trả canonical DTO kèm compatibility aliases.

Hai route Web/App phải dùng cùng một config helper. Không bật lệch mode giữa hai endpoint.

## 2. Rollback theo cấp độ

1. Khi có cảnh báo nhưng chưa có lỗi dữ liệu/authorization: chuyển `on -> shadow`.
2. Khi có parity mismatch, authorization regression, GET write hoặc lỗi render: chuyển `on/shadow -> off` ngay.
3. Nếu lỗi vẫn tồn tại ở `off`: deploy lại previous known-good release bằng release ID/hash trong manifest.
4. Sau rollback chạy smoke test Web/App, xác nhận GET không tạo write và query count trở về baseline.

## 3. Không rollback dữ liệu

Không update, delete, backfill hoặc reverse MongoDB khi rollback reader. Phase A không mutate production data, nên rollback chỉ gồm feature flag và code release. Mọi allocation/version/return inconsistency được chuyển sang reconciliation/repair phase riêng có audit trail.

## 4. Trigger bắt buộc rollback/chặn rollout

- Web/App canonical parity mismatch tái hiện được.
- Cross-staff hoặc cross-tenant data exposure.
- GET gọi `save/create/update/bulkWrite/delete` hoặc sinh AR/Fund/Stock write.
- Error rate tăng >1 điểm phần trăm hoặc >2 lần baseline.
- p95 tăng >20% và >250 ms trong cửa sổ 15 phút đủ sample.
- Financial resolver >3 join queries hoặc query count tăng theo số đơn.
- Heap/RSS tăng liên tục, OOM hoặc Render restart.
- Payload vượt 8 MiB/1.000 rows hoặc app không render.
- Identity ambiguity/invalid money làm request failure vượt 0,1%.
- Production smoke test thất bại ở bất kỳ endpoint nào.

## 5. Smoke sau rollback

- HTTP 200 cho role hợp lệ; role không hợp lệ vẫn bị từ chối.
- Cùng `orderCode`, legacy output ổn định ở `off`.
- Không có ledger/write phát sinh từ GET.
- Query count, latency và payload trở về baseline.
- Ghi trace ID, release hash, flag trước/sau và người thực hiện.

## 6. Traceability

Manifest phải ghi:

- Phase261 baseline SHA-256.
- Gate 3 input ZIP SHA-256.
- Changed-file evidence SHA-256.
- Release/verification artifact SHA-256 ở sidecar ngoài ZIP.
- Kết luận `NOT_READY`, `READY_FOR_SHADOW` hoặc `READY_FOR_ON`.

## 7. Stop condition hiện tại

Không bật `shadow` hoặc `on` khi official source-bundle build/check chưa PASS. Không bật `on` khi production dry-run, Mongo explain và HTTP smoke còn `NOT_RUN_ENV_UNAVAILABLE`.
