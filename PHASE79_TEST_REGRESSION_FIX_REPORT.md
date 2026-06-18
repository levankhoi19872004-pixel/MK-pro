# PHASE 79 — SỬA LỖI TEST HỒI QUY SAU PHASE 78

## 1. Lỗi được ghi nhận

1. `docs-generate.test.js` thất bại vì `docs/openapi.json` chưa có 3 endpoint Excel mới.
2. `import-sales-bulk-commit-performance-static.test.js` không còn thấy mốc cache `phase47-import-performance-v1`.
3. `master-order-popup-selection-ui-static.test.js` không còn thấy mốc cache `phase69-unmerged-refresh-v1`.
4. `sales-order-decimal-price-input.test.js` không còn thấy mốc cache `phase49-sales-order-global-search-v1`.

## 2. Nguyên nhân gốc rễ

Phase 73 đã thay toàn bộ query cache của nhiều bundle bằng `phase73-excel-interaction-v1`, làm mất các mốc phiên bản nền mà test hồi quy đang dùng để xác nhận những bản vá trước vẫn được phát hành. Đồng thời OpenAPI chưa được sinh lại sau khi thêm các route Excel.

## 3. Phạm vi sửa

### `docs/openapi.json`

Chạy trình sinh tài liệu chính thức:

```bash
npm run docs:generate
```

Bổ sung đúng 3 operation:

- `POST /api/excel/export`
- `POST /api/excel/import/preview`
- `POST /api/excel/products/resolve`

### `public/index.html`

Giữ mốc phiên bản nền mà test hồi quy yêu cầu và nối bản vá mới bằng query riêng:

- `05-sales-orders.js?v=phase49-sales-order-global-search-v1&patch=phase73-excel-interaction-v1`
- `06-master-delivery.js?v=phase69-unmerged-refresh-v1&patch=phase73-excel-interaction-v1`
- `08d-import-excel.js?v=phase47-import-performance-v1&patch=phase73-excel-interaction-v1&ui=phase78-remove-custom-import-template-ui-v1`

Không sửa nội dung test và không thay đổi logic import, bán hàng, đơn tổng hoặc API runtime.

## 4. Kết quả kiểm thử

- Nhóm 4 file test báo lỗi: **10/10 đạt**.
- `npm test`: **635/635 đạt**.
- Fail: **0**.
- Skip: **0**.

## 5. Rủi ro và ảnh hưởng

- Rủi ro nghiệp vụ: thấp.
- Database/schema: không thay đổi.
- API runtime: không thay đổi.
- Cache trình duyệt: tiếp tục được bust bởi chuỗi query kết hợp.
- UI gỡ phần “Tự tạo mẫu import” của Phase 78: giữ nguyên.
