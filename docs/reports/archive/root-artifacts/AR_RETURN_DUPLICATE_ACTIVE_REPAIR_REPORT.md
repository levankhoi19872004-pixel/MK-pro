# AR-RETURN duplicate active repair report

## Tổng quan
- `npm test`: PASS
- `source-bundles`: OK 19 bundles
- Test cuối: 1193 tests / 1192 pass / 0 fail / 1 skipped
- Phạm vi sửa: AR-RETURN duplicate active detection + audit/repair scripts, không sửa UI compact, Dashboard, Fund, Inventory, Import.

## Nguyên nhân/rủi ro
Guard P0 xuất hiện khi hệ thống phát hiện nhiều AR-RETURN active cùng một nguồn `returnOrder`. Đây là guard đúng để chặn giảm công nợ nhiều lần. Bản vá không bỏ guard, mà bổ sung đường audit/repair dữ liệu bẩn an toàn.

Một điểm được siết lại: lookup duplicate AR-RETURN không OR rộng theo SalesOrder khi đã có returnOrder key, tránh bắt nhầm nhiều phiếu trả khác nhau trong cùng một đơn bán.

## Thay đổi chính

| Nhóm | File | Thay đổi |
|---|---|---|
| Active helper/audit | `scripts/lib/arReturnIdempotencyAudit.js` | Thêm `canonicalBusinessKey`, `activeArReturnDuplicateGroups`, mở rộng thông tin ledger ref. |
| Runtime guard | `src/services/accounting/returnArPostingService.js` | Siết active filter, không lookup rộng theo order khi đã có returnOrder source, thêm metadata audit/repair command trong lỗi P0. |
| Audit script | `scripts/audit-ar-return-duplicates.js` | Script read-only, exit 2 nếu có duplicate active, hỗ trợ `--orderCode`, `--returnOrderId`, `--json`. |
| Repair script | `scripts/repair-ar-return-duplicates.js` | Dry-run mặc định, `--apply` bắt buộc khoanh vùng, không xóa ledger; reverse/deactivate duplicate cùng amount, manual review nếu amount lệch. |
| npm scripts | `package.json` | Thêm command audit/repair AR-RETURN duplicates. |
| Regression tests | `test/ar-return-duplicate-audit-repair.test.js` | Kiểm tra grouping active-only và script repair safe-by-default. |

## Cách kiểm tra dữ liệu bẩn

```bash
node scripts/audit-ar-return-duplicates.js --orderCode B0038432
node scripts/audit-ar-return-duplicates.js --orderCode B0038432 --json
```

Exit code:
- `0`: không có duplicate active
- `2`: có duplicate active cần repair/manual review
- `1`: lỗi môi trường/script

## Cách repair an toàn

Dry-run trước:

```bash
node scripts/repair-ar-return-duplicates.js --dry-run --orderCode B0038432
```

Apply sau khi đã review:

```bash
node scripts/repair-ar-return-duplicates.js --apply --orderCode B0038432 --user ke-toan-admin
```

Điều kiện không auto repair:
- Duplicate cùng business dimension nhưng amount khác nhau.
- Amount bằng 0 hoặc không xác định.
- Không truyền `--orderCode` hoặc `--returnOrderId` khi `--apply`.

## Không sửa lan
- Không bỏ guard P0.
- Không xóa ledger.
- Không ghi fundLedgers.
- Không đổi Dashboard/Inventory/Import/VAT/SSE.
- Không sửa test runner.

## Bằng chứng test

```text
# tests 1193
# pass 1192
# fail 0
# skipped 1
```
