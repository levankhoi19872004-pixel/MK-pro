# Phase248 — Fund Submission Action Button UX Clarification

## Executive summary

Màn **Quỹ tiền → Nộp quỹ giao hàng** trước đây render hai nút cùng caption `Xử lý`, dù hai nút gọi hai workflow khác nhau. Phase248 chỉ làm rõ caption/tooltip/aria-label; không đổi handler, API, payload, permission hay nghiệp vụ quỹ.

## Audit handler và nghiệp vụ

| Nút | Handler hiện hữu | API / flow | Ý nghĩa nghiệp vụ |
|---|---|---|---|
| Nút chỉnh sửa | `editFundVoucher('delivery', code)` | Mở popup hiện hữu, khi lưu tiếp tục dùng API cập nhật phiếu nộp quỹ hiện hữu | Chỉnh sửa thông tin phiếu đã khai báo |
| Nút xác nhận | `confirmFundVoucher('delivery', code, button)` → `confirmDeliveryCashSubmission(...)` | `POST /api/funds/delivery-cash-submissions/:code/confirm` | Xác nhận phiếu và ghi các dòng đủ điều kiện vào `fundLedgers` |

## Before / After

### Before

```text
[Xử lý] [Xử lý]
```

Hai action khác nhau nhưng cùng caption, không có nhãn truy cập cụ thể.

### After

```text
[Sửa phiếu] [Xác nhận]
```

- **Sửa phiếu**
  - Tooltip: `Mở phiếu nộp quỹ để chỉnh sửa thông tin đã khai báo.`
  - `aria-label`: `Sửa phiếu <mã phiếu>`
- **Xác nhận**
  - Tooltip: `Xác nhận phiếu nộp và ghi nhận các dòng đủ điều kiện vào sổ quỹ.`
  - `aria-label`: `Xác nhận phiếu <mã phiếu>`

## Scope control

Đã sửa:

- `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`
- source bundle sinh lại `public/js/app/debt/07f-fund-ledger.js`
- source bundle hash liên quan
- `test/phase231-fund-dashboard-readmodel-ui-static.test.js`
- `test/phase248-fund-submission-action-button-ux.test.js`

Không sửa:

- Fund writer
- MongoDB models
- API routes
- permission
- transaction
- payload
- accounting/fund business rules

## Regression evidence

Các lệnh đã chạy:

```bash
npm run check:source-bundles
node --test test/phase248-fund-submission-action-button-ux.test.js \
  test/phase231-fund-dashboard-readmodel-ui-static.test.js \
  test/fund-*.test.js
```

Kết quả:

- Source bundles: `OK 19 bundles`
- Targeted fund/UX regression: `75 pass, 0 fail`
- Handler `edit` và `confirm` giữ nguyên.
- API xác nhận phiếu nộp quỹ giữ nguyên.

`npm test` toàn repository đã được khởi chạy và đi qua nhiều nhóm test nhưng vượt timeout của môi trường thực thi trước khi hoàn tất, vì vậy báo cáo không tuyên bố full suite pass.

## Acceptance checklist

- [x] Không còn hai nút delivery cùng caption `Xử lý`
- [x] Caption phản ánh đúng nghiệp vụ
- [x] Tooltip cụ thể
- [x] `aria-label` cụ thể theo mã phiếu
- [x] Không đổi handler
- [x] Không đổi API
- [x] Không đổi workflow
- [x] Targeted regression pass
- [x] Source bundle đồng bộ
