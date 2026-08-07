# PERF-A2C — Duplicate Audit Script

## Source

- `scripts/audit-ar-ledger-idempotency-duplicates.js`
- Pure summarizer: `scripts/lib/arLedgerIdempotencyAudit.js`

## Chạy audit

```bash
npm run audit:ar-ledger-idempotency:json
```

Script stream các AR ledger có trường `idempotencyKey`, không tải toàn collection vào một mảng duy nhất.

## Nhóm được báo cáo

- Duplicate normalized idempotency key.
- Cùng key nhưng khác financial payload hash.
- Nhiều raw key cùng normalize về một key.
- Key malformed/unstable.
- Empty key rows.

Mỗi group có count, raw key variants, payload hashes và tối đa 10 ledger example.

## Exit code

- `0`: audit sạch.
- `2`: có blocker dữ liệu.
- `1`: lỗi kết nối hoặc lỗi thực thi.

## Safety contract

- Chỉ đọc.
- Không `deleteMany`, `updateMany`, `bulkWrite` hoặc merge.
- Không tạo/drop index.
- Không tự chọn ledger đúng để giữ lại.
- Duplicate resolution phải là một phase dữ liệu riêng có phê duyệt kế toán.

## Kết quả offline

Pure summarizer đã được test với:

- Hai ledger same key/same payload.
- Một raw key có leading/trailing spaces normalize về cùng key.
- Một same-key/different financial payload.

Kết quả báo đúng 1 duplicate group, 1 payload conflict và 1 normalized variant group; input không bị mutate.
