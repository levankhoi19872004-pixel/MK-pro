# KHO Minh Khai Pro V43

Lõi V43 theo hướng: data catalog -> documents -> posting engine -> reports.

## Các bước đã có

1. Server Express chuẩn.
2. Danh mục sản phẩm.
3. Search engine dùng chung.
4. Nhập kho chuẩn: phiếu nhập nháp -> xác nhận -> posting IN.
5. Tồn kho và sổ kho: tính từ postings, không cộng/trừ trực tiếp vào sản phẩm.
6. Bán hàng + xuất kho chuẩn: đơn bán hàng nháp -> xác nhận -> posting OUT.

## API chính

### Sản phẩm
- GET /api/products
- GET /api/products/suggest
- POST /api/products
- PUT /api/products/:code
- DELETE /api/products/:code

### Nhập kho
- GET /api/warehouse-receipts
- POST /api/warehouse-receipts/preview
- POST /api/warehouse-receipts
- POST /api/warehouse-receipts/:id/confirm
- POST /api/warehouse-receipts/:id/cancel

### Bán hàng / xuất kho
- GET /api/sales-orders
- GET /api/sales-orders/:id
- POST /api/sales-orders/preview
- POST /api/sales-orders
- POST /api/sales-orders/:id/confirm
- POST /api/sales-orders/:id/cancel

### Tồn kho / sổ kho
- GET /api/stock/balance
- GET /api/stock/ledger

## Nguyên tắc quan trọng

- Danh mục sản phẩm chỉ là dữ liệu gốc.
- Không sửa tồn trực tiếp trong sản phẩm.
- Tồn kho = tổng hợp từ postings.
- Phiếu nhập POSTED tạo posting IN.
- Đơn bán hàng POSTED tạo posting OUT.
- Hủy chứng từ đã POSTED sẽ sinh posting đảo chiều.

## Bước 7: Công nợ phải thu khách hàng

Nguyên tắc V43:
- Không sửa trực tiếp số dư công nợ trên khách hàng.
- Công nợ được tính từ `receivablePostings`.
- Đơn bán hàng xác nhận sinh phát sinh Nợ phải thu.
- Thu tiền sinh phát sinh Có giảm công nợ.
- Hủy đơn bán/hủy phiếu thu sinh dòng đảo công nợ, không xóa lịch sử.

API chính:
- `GET /api/receivables/summary` - báo cáo tổng hợp công nợ theo khách hàng.
- `GET /api/receivables/ledger` - sổ chi tiết công nợ.
- `POST /api/receivables/payments` - ghi nhận thu tiền khách hàng.
- `POST /api/receivables/payments/:id/cancel` - hủy phiếu thu và đảo công nợ.

Luồng chuẩn:
```text
Đơn bán hàng xác nhận -> xuất kho OUT -> ghi Nợ công nợ khách hàng
Thu tiền khách hàng -> ghi Có công nợ khách hàng
Hủy chứng từ -> sinh dòng đảo, không sửa/xóa lịch sử
```

## Bước 9 - Báo cáo chuẩn V43

Báo cáo lấy dữ liệu từ sổ/chứng từ, không sửa số dư trực tiếp.

### API báo cáo

- `GET /api/reports/dashboard` - Tổng quan nhanh
- `GET /api/reports/sales` - Báo cáo bán hàng
- `GET /api/reports/purchases` - Báo cáo nhập hàng
- `GET /api/reports/stock` - Báo cáo tồn kho
- `GET /api/reports/receivables` - Báo cáo công nợ
- `GET /api/reports/cash` - Báo cáo quỹ tiền

### Bộ lọc dùng chung

- `fromDate=YYYY-MM-DD`
- `toDate=YYYY-MM-DD`
- `customerCode=...`
- `staffCode=...`
- `warehouseCode=...`
- `productCode=...`
- `keyword=...`

### Nguyên tắc

- Tồn kho lấy từ `postings`.
- Công nợ lấy từ `receivablePostings`.
- Quỹ tiền lấy từ `cashLedger`.
- Doanh số lấy từ đơn bán hàng `SALES_ORDER` trạng thái `POSTED`.
- Nhập hàng lấy từ phiếu nhập `WAREHOUSE_RECEIPT` trạng thái `POSTED`.


## Step 12 - Reverse chứng từ chuẩn

Cơ chế hủy chứng từ không xóa phát sinh cũ. Hệ thống sinh bút toán đảo ngược để giữ lịch sử kế toán/kho/công nợ.

API mới:

- `GET /api/documents/:id/reverse-preview`: xem trước ảnh hưởng khi hủy chứng từ.
- `POST /api/documents/:id/reverse`: hủy chứng từ và sinh bút toán đảo. Body mẫu:

```json
{
  "reason": "Nhập sai chứng từ",
  "reversedBy": "Admin"
}
```

Hỗ trợ hiện tại:

- Phiếu nhập kho `WAREHOUSE_RECEIPT`: đảo tồn kho bằng dòng OUT.
- Đơn bán hàng `SALES_ORDER`: đảo tồn kho bằng dòng IN và đảo công nợ.
- Phiếu thu công nợ `CUSTOMER_PAYMENT`: đảo công nợ.

Nguyên tắc:

- Chứng từ nháp: chỉ chuyển `CANCELLED`, không sinh ledger.
- Chứng từ đã ghi sổ: sinh bút toán đảo, sau đó chuyển `CANCELLED`.
- Không cho hủy lặp.
- Hủy phiếu nhập có kiểm tra tồn kho hiện tại đủ để đảo hay không.


## Step 14 - Phân quyền user

### Tài khoản mẫu

- admin / 123456: ADMIN - toàn quyền
- ketoan / 123456: ACCOUNTANT - công nợ, báo cáo, reverse
- thukho / 123456: WAREHOUSE - nhập kho, xác nhận nhập, xem tồn
- thuquy / 123456: CASHIER - thu tiền, quỹ tiền
- banhang / 123456: SALES - tạo đơn bán, xem tồn, xem báo cáo

### API phân quyền

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/roles`
- `GET /api/auth/users`
- `POST /api/auth/users`
- `PUT /api/auth/users/:id`

Sau khi đăng nhập, gọi API bằng header:

```http
Authorization: Bearer <token>
```

### Nguyên tắc V43

- Không cho API nghiệp vụ chạy nếu chưa đăng nhập.
- Mỗi role có danh sách permission riêng.
- Admin toàn quyền.
- Nhân viên chỉ được thao tác đúng nghiệp vụ của mình.
- API nhạy cảm như hủy chứng từ, khóa sổ, quản lý user được chặn bằng permission riêng.

## Step 15 - Mẫu in chứng từ

Đã thêm hệ thống mẫu in dùng chung cho V43:

- `src/services/printTemplateService.js`: cấu hình mẫu in và render HTML A4/A5.
- `src/routes/printRoutes.js`: API xuất mẫu in.
- Các mẫu hiện có:
  - Phiếu nhập kho A4: `GET /api/print/warehouse-receipts/:id`
  - Đơn bán hàng / Phiếu xuất kho A4: `GET /api/print/sales-orders/:id`
  - Phiếu thu / Phiếu chi A5: `GET /api/print/cash/:id`
  - Danh sách mẫu: `GET /api/print/templates`

Nguyên tắc thiết kế:

- Mẫu in lấy dữ liệu từ chứng từ đã lưu, không tự tính nghiệp vụ riêng.
- Không xóa hay sửa ledger khi in.
- Sửa mẫu in tập trung trong `printTemplateService.js` để tránh đụng vào module nhập kho, bán hàng, công nợ, quỹ.
- Có nút `In chứng từ` và CSS `@media print` để in A4/A5 gọn hơn.
