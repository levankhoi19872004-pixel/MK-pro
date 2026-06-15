# PHASE 47 — TỐI ƯU HIỆU NĂNG COMMIT IMPORT ĐƠN BÁN

## 1. Hiện tượng

Khi xác nhận import khoảng 63 đơn DMS, giao diện giữ trạng thái `Đang import...` trong thời gian dài. API tải các dòng preview cũng có thể mất hơn 2 giây vì phải đọc payload `normalizedRow` lớn từ `import_session_rows`.

## 2. Nguyên nhân gốc

### 2.1. N+1 query khi posting tồn kho

Luồng cũ xử lý theo từng đơn và từng sản phẩm:

1. Insert nhóm đơn.
2. Với từng đơn, gọi `InventoryPostingService.postSaleOut()`.
3. Với từng mã sản phẩm:
   - tìm product;
   - kiểm tra idempotency;
   - đọc và chuẩn hóa tồn về `MAIN`;
   - tạo `stockTransaction`;
   - cập nhật `inventories`;
   - lưu lại `balanceQty`.
4. Update từng đơn thành `stockPosted=true`.

Số lượt Mongo tăng tuyến tính theo `số đơn × số sản phẩm` và phần lớn chạy tuần tự trong transaction.

### 2.2. Frontend không có tiến độ commit

`POST /api/import/commit` chờ toàn bộ commit hoàn tất mới trả response. Trong thời gian đó giao diện chỉ hiện một thông báo tĩnh nên người dùng không phân biệt được hệ thống đang xử lý hay bị treo.

### 2.3. API preview tải payload nội bộ quá lớn

`GET /api/import/sessions/:sessionId/rows` đọc toàn bộ `normalizedRow`, bao gồm các mảng dùng nội bộ như `__importRows`, `__adjustedRows`, rồi mới cắt bỏ ở Node.js.

## 3. Thay đổi kỹ thuật

### 3.1. Bulk inventory posting cho import đơn bán

Files:

- `src/services/inventoryService.js`
- `src/domain/posting/InventoryPostingService.js`
- `src/services/excelImportService.js`

Boundary mới:

```js
InventoryPostingService.postSalesOrdersBulkOut(orders, { session })
```

Mỗi transaction chunk hiện thực hiện:

1. `SalesOrder.insertMany()`.
2. Gom trùng sản phẩm trong từng đơn.
3. Query idempotency của toàn chunk một lần.
4. Đọc và chuẩn hóa tồn của toàn bộ mã sản phẩm trong chunk.
5. Kiểm tra tổng lượng cần xuất theo từng sản phẩm.
6. `StockTransaction.insertMany()`.
7. `InventoryLegacy.bulkWrite()` để trừ tồn aggregate theo sản phẩm.
8. `SalesOrder.updateMany()` để đánh dấu toàn chunk đã post tồn.

### 3.2. Giữ nguyên transaction và chống âm kho

- Mỗi chunk vẫn chạy trong Mongo transaction.
- Nếu một sản phẩm không đủ tồn, toàn bộ chunk rollback.
- Điều kiện `availableQty >= requiredQty` vẫn tồn tại ở câu lệnh update.
- Nếu tồn thay đổi đồng thời và số dòng match không đủ, hệ thống throw `INVENTORY_CONCURRENT_UPDATE` và rollback.
- Idempotency vẫn theo `sourceType + sourceId + productCode + warehouse + movement type`.

### 3.3. Tiến độ commit theo chunk

Files:

- `src/services/import/importTransaction.service.js`
- `src/services/importSessionService.js`
- `src/services/excelImportService.js`
- `public/js/app/admin/08d-import-excel.js`

Các bước được ghi vào `import_sessions.progress`:

```text
preparing_commit
loading_selected_rows
revalidating_orders
committing:x/y
finalizing
done
```

Frontend polling trạng thái mỗi 1,2 giây và hiển thị phần trăm/lô đang xử lý.

### 3.4. Preview row rút gọn

Files:

- `src/models/ImportSessionRow.js`
- `src/services/importSessionService.js`

Mỗi dòng session lưu thêm `previewRow` đã loại dữ liệu nội bộ nặng. API danh sách dùng Mongo aggregation:

```js
{ $ifNull: ['$previewRow', '$normalizedRow'] }
```

- Session mới: chỉ trả `previewRow` nhẹ.
- Session cũ: tự fallback về `normalizedRow`.
- Commit vẫn đọc `normalizedRow` đầy đủ, không mất dữ liệu nghiệp vụ.

### 3.5. Chỉ reload module liên quan

Sau import, frontend không còn gọi tuần tự toàn bộ sản phẩm, khách hàng, tồn, đơn nhập, đơn bán, công nợ, phiếu thu và quỹ.

Ví dụ với `salesOrders`, chỉ reload song song:

```text
Danh sách đơn bán + Tồn kho
```

## 4. Phạm vi an toàn

Không thay đổi:

- Công thức đọc Excel.
- Quy tắc cắt hàng vượt tồn.
- Giá bán, khuyến mại và snapshot giá trên đơn.
- AR/công nợ và quỹ tiền.
- Giao hàng và trả hàng.
- Cấu trúc chứng từ đơn bán.
- Cách sinh một stock transaction cho mỗi `đơn × sản phẩm`.

Không cần migration MongoDB. Trường `previewRow` là field bổ sung tùy chọn.

## 5. Cấu hình

```env
SALES_IMPORT_TX_CHUNK_SIZE=25
IMPORT_SESSION_ROW_BATCH_SIZE=500
```

Giữ `SALES_IMPORT_TX_CHUNK_SIZE=25` khi triển khai đầu tiên. Chỉ tăng lên 40–50 sau khi đo transaction size và P95 trên MongoDB Atlas/Render.

## 6. Logging và metrics

Import log bổ sung:

```text
durationMs
ordersPerSecond
stockTransactionsPerSecond
uniqueProducts
batchSize
mode=atomicBulkSalesOrderChunks
```

Response commit có `performance.durationMs` để giao diện hiển thị tổng thời gian thực tế.

## 7. Kiểm thử

- Bulk posting tạo đúng một transaction cho mỗi `đơn × sản phẩm`.
- Hai đơn cùng sản phẩm chỉ trừ tồn aggregate một lần ở `inventories`.
- `balanceQty` vẫn giảm theo thứ tự transaction.
- Retry cùng nguồn không trừ tồn lần hai.
- Tổng lượng vượt tồn bị chặn trước khi insert stock transaction.
- Transaction chunk và ranh giới InventoryPostingService được giữ nguyên.
- Preview phân trang và fallback session cũ hoạt động.
- Full regression: 495/495 pass.
- JavaScript syntax: 620 files pass.
- OpenAPI: 252 operations, up to date.
- Production npm audit: 0 vulnerabilities.
