# PHASE 11 — TEST GATE FIX REPORT

## Kết luận

Đã đóng gate kiểm thử mã nguồn. Không sửa business rule hoặc production query.

## Lỗi và xử lý

| Lỗi | Nguyên nhân | Xử lý |
|---|---|---|
| Hai assertion `2 !== 1` | Fixture `dateTo=2026-06-20` hết hạn và kích hoạt backcast query hợp lệ | Dùng `todayVN()` cho fixture và query test |
| `AuditService.js` tồn tại trên Windows | `existsSync()` không phân biệt casing trên NTFS mặc định | Đối chiếu tên thật bằng `readdirSync()` |
| Hai `.jsfrag` tồn tại | Giải nén ZIP đè lên workspace cũ | Thêm đúng hai file đã retired vào `cleanup:retired` |
| SIGTERM web/worker fail trên Windows | `child.kill(SIGTERM)` trên Windows force-kill child process | Integration tests chạy trên Linux; Windows skip có lý do |

## File sửa

- `test/api-query-performance-optimizations.test.js`
- `test/audit-service-case-portability.test.js`
- `test/operations-shutdown-sigterm.test.js`
- `scripts/cleanup-retired-files.js`
- `RELEASE_MANIFEST.json`
- Các báo cáo kết quả liên quan.

## Kết quả thực tế

- Full suite Linux: **974 / 973 pass / 0 fail / 1 skip**.
- Operations Linux: **12/12 pass**.
- Syntax: **932 JavaScript files pass**.
- Source bundles: **19/19 pass**.
- OpenAPI: **315 operations, up to date**.
- Path portability: **1243 paths pass**.
- npm audit production: **0 vulnerability**.

## Gate còn mở

Gate kiểm thử đã đóng. Quyết định tổng Prompt 11 vẫn là `NOT_APPROVED_FOR_PROMPT_12` đến khi có bằng chứng Atlas backup, restore MongoDB cô lập và deploy/rollback staging thực tế.
