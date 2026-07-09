# Phase214 Codebase Cleanup Report

## Mục tiêu

Siết lại MK-Pro theo hướng không xóa mù: chỉ retired/xóa khi chứng minh không còn import, không mounted, không nằm trong source-bundles và không được HTML/bootstrap gọi.

## Thay đổi Phase214

| Hạng mục | Kết quả |
|---|---|
| Retired config | Thêm `config/retired-files.json` với policy và candidate-only list. |
| Dead-code audit script | Thêm `scripts/audit-dead-code.js`. |
| Nested phase folder guard | Script chặn thư mục `mk*`, `phase*`, `*_work` lẫn vào root ZIP/deploy. |
| Retired import guard | Script kiểm tra retired file còn bị reference/import/mounted hay không. |

## Kết quả audit hiện tại

```txt
[dead-code-audit] OK
```

Hiện chưa xóa file nghiệp vụ nào vì Phase214 ưu tiên dựng governance và request budget guard. Các file chỉ được đưa vào candidate nếu chưa đủ bằng chứng an toàn.

## Quy trình dọn sau này

1. Đưa file nghi ngờ vào `candidates`.
2. Chạy scan/import/mount/source-bundle.
3. Nếu không còn dùng, chuyển sang `retired`.
4. Chạy `node scripts/audit-dead-code.js` và `npm test`.
5. Sau 1–2 phase ổn định mới xóa vật lý.

## Phase215 cleanup audit extension

Phase215 chưa xóa mù code legacy. Các thay đổi tập trung vào guard và command contract cho P1:

- Import commit: giữ web-direct import, thêm in-flight lock và AbortController cho polling job/session.
- DMS commit: thêm in-flight lock cho commit và AbortController cho list/history.
- Backup/reset: thêm command lock, bỏ cascade reload toàn bộ module sau reset.
- Return stock-in/warehouse confirm: bổ sung telemetry để truy vết stage mà không đổi lifecycle boundary.
- Nested phase folder guard vẫn chạy qua `scripts/audit-dead-code.js`.

Chỉ được xóa file ở phase sau nếu chứng minh đủ: không import, không mounted route, không được HTML/bootstrap/source-bundles gọi và test pass.


## Phase216 read cleanup vòng 1

Phase216 tiếp tục giữ chính sách không xóa mù. Trọng tâm cleanup là quản trị read/list/report performance:

- Thêm `docs/READ_REQUEST_BUDGET_MATRIX.md` để phân loại request budget cho các màn đọc/lọc.
- Thêm `src/config/readEndpointBudgets.js` để machine-readable hóa các read API lớn.
- Retired/dead-code vẫn ở chế độ candidate-only nếu chưa đủ bằng chứng không import, không mounted route, không HTML/bootstrap reference và không thuộc source-bundles.
- Không xóa các module nghiệp vụ đang dùng: DMS simulator, display-check manager, SSE export, DebtNew canonical adapter, AR governance, Phase23+ app giao hàng, warehouse return check.
- `scripts/audit-dead-code.js` vẫn là gate chặn nested phase folder/node_modules lẫn vào ZIP/deploy.
