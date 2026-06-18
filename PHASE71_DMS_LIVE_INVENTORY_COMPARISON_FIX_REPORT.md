# PHASE 71 - Sửa đối chiếu DMS dùng tồn kho thực tế hiện tại

## 1. Kết quả khảo sát và nguyên nhân gốc rễ

Màn **Tồn kho hiện tại** và màn **Đối chiếu tồn DMS** cùng hiển thị nguồn nghiệp vụ là tồn kho thực tế, nhưng trước bản vá chúng không đọc dữ liệu theo cùng thời điểm:

- Màn **Tồn kho hiện tại** gọi `inventoryStockService.getInventorySummary()` và đọc trực tiếp collection chuẩn `inventories`.
- Khi tải file DMS, hệ thống chụp `internalBaseQty` vào `dmsInventorySnapshots` tại thời điểm preview/commit.
- API `GET /api/dms-inventory/latest` sau đó chỉ đọc lại `internalBaseQty` đã chụp, không đối chiếu lại với `inventories`.

Do đó, sau khi nhập kho, bán hàng, trả hàng hoặc điều chỉnh tồn, màn tồn kho hiện tại đã thay đổi nhưng màn đối chiếu DMS vẫn giữ số cũ.

Ví dụ trong ảnh:

- File DMS được chốt lúc khoảng 07:57.
- Tồn kho mã `64330134` được cập nhật lúc khoảng 08:03 thành `56/8` = `848` đơn vị lẻ.
- Màn đối chiếu vẫn dùng tồn chụp cũ khoảng `6/8` = `98` đơn vị lẻ nên chênh lệch bị tính sai.

## 2. Phương án đã áp dụng - Phương án A, production-grade

Giữ hai khái niệm tách biệt:

1. **Tồn DMS**: snapshot cố định theo file buổi sáng đã commit.
2. **Tồn thực tế hiện tại**: đọc lại từ collection chuẩn `inventories` mỗi khi mở màn hoặc bấm **Tải lại**.

Luồng mới của `GET /api/dms-inventory/latest`:

1. Lấy lần import DMS hoàn tất gần nhất.
2. Đọc các dòng DMS đã commit để giữ nguyên số DMS.
3. Loại bỏ `internalBaseQty` cũ khỏi dữ liệu đầu vào.
4. Đọc lại tồn hiện tại từ `inventoryStockService`.
5. Tính lại `differenceQty`, `comparisonType` và toàn bộ KPI.
6. Sau khi tính lại mới áp dụng bộ lọc, tìm kiếm và phân trang.
7. Hạn mức bán App vẫn giữ theo lần chốt DMS, không tự mở thêm hạn mức ngoài nghiệp vụ đã xác nhận.

Nút **Tải lại** và lần đầu mở tab gửi `refresh=1` để bỏ qua cache tồn kho 5 giây. Các thao tác tìm kiếm, đổi bộ lọc và phân trang được phép dùng cache ngắn để tránh tạo tải không cần thiết.

## 3. Phương án B - Cân bằng effort, không chọn

Chỉ cập nhật `internalBaseQty` trong `dmsInventorySnapshots` mỗi khi tồn kho thay đổi.

### Lợi ích

- API danh sách tiếp tục truy vấn và phân trang trực tiếp trên MongoDB.

### Nhược điểm

- Mọi luồng nhập, xuất, trả hàng, xóa đơn và sửa đơn đều phải đồng bộ thêm snapshot DMS.
- Dễ phát sinh race condition và sai dữ liệu khi một luồng quên cập nhật snapshot.
- Làm mất ý nghĩa lịch sử của snapshot tại thời điểm tải DMS.

**Effort:** Hard  
**Rủi ro:** Cao  
**Kết luận:** Không phù hợp với nguyên tắc Single Source of Truth.

## 4. Phạm vi thay đổi

- `src/services/dmsInventoryReconciliation.service.js`
  - Dựng lại đối chiếu mới nhất từ DMS snapshot + tồn `inventories` hiện tại.
  - Tính lại KPI, trạng thái, chênh lệch trước khi lọc/phân trang.
  - Trả metadata `inventorySource`, `comparisonMode`, `comparisonGeneratedAt`.
  - Giữ thêm `snapshotSummary` để bảo toàn số liệu lịch sử lúc commit.

- `src/services/inventoryStock.service.js`
  - Bổ sung tùy chọn `forceRefresh` để bỏ qua cache đọc tồn khi người dùng bấm tải lại.

- `src/controllers/dmsInventoryController.js`
  - Nhận query `refresh=1` và truyền xuống service.

- `src/models/DmsInventorySnapshot.js`
  - Khai báo rõ trường `internalUpdatedAt`.

- `public/js/app/10-dms-inventory.js`
  - Mở tab và bấm tải lại sẽ ép đọc tồn mới.
  - Hiển thị thời điểm đối chiếu và nguồn `inventories`.
  - Khóa nút tải lại trong lúc request đang chạy.

- `public/index.html`
  - Đổi tên cột thành **Tồn thực tế hiện tại**.
  - Cache bust JS/CSS Phase 71.

- `public/css/80-dms-inventory.css`
  - Tách dòng hiển thị thùng/lẻ và tổng đơn vị lẻ để tránh nhìn dính số.

- `test/dms-inventory-live-current.test.js`
  - Bổ sung kiểm thử hồi quy cho trường hợp tồn snapshot cũ là `98`, tồn hiện tại là `848`.

## 5. Tác động và rủi ro

| Hạng mục | Đánh giá |
|---|---|
| Ghi dữ liệu MongoDB | Không thay đổi dữ liệu tồn hiện tại |
| Migration | Không cần |
| Hạn mức bán App | Không đổi nghiệp vụ, vẫn theo lần commit DMS |
| Tồn hiển thị | Luôn lấy `availableQty` từ `inventories`, cùng nguồn với màn Tồn kho hiện tại |
| Lịch sử DMS | Giữ nguyên snapshot và summary lúc commit |
| Hiệu năng | Mở tab/tải lại đọc mới; tìm kiếm và phân trang dùng cache ngắn |
| Race condition | Giảm vì không đồng bộ chéo snapshot theo mọi giao dịch kho |

## 6. Kiểm thử

- `node --check` các file JavaScript thay đổi: đạt.
- Bộ test DMS, tồn kho Single Source of Truth, posting và reconciliation: **26/26 đạt**.
- Test hồi quy mới xác nhận:
  - `internalBaseQty = 848` được lấy từ tồn hiện tại.
  - Chênh lệch với DMS `2.218` được tính lại thành `-1.370`.
  - Không tái sử dụng `internalBaseQty = 98` đã lưu trong snapshot cũ.
  - Bộ lọc trạng thái chạy sau bước tính lại tồn hiện tại.
- `npm run check:syntax` toàn dự án chưa hoàn tất trong giới hạn 120 giây của môi trường; toàn bộ file trực tiếp thay đổi đã kiểm tra cú pháp thành công.
