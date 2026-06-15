# PHASE 50 — ĐỐI CHIẾU TỒN DMS VÀ HẠN MỨC BÁN APP

## 1. Phạm vi triển khai

Đã triển khai Phương án A theo nguyên tắc:

1. Mỗi buổi sáng tải file tồn DMS Unilever `.xlsx`.
2. Hệ thống đọc theo tên cột:
   - `Số hiệu hàng hóa` — mã sản phẩm.
   - `Mô tả mặt hàng` — tên DMS.
   - `Qui cách đóng gói` — số đơn vị lẻ/thùng.
   - `Tồn cuối (CS/SU)` — tồn thùng/lẻ.
   - `Tồn kho cuối kỳ (SU)` — tồn đơn vị lẻ chuẩn.
3. So sánh với tồn khả dụng hiện tại trong kho `MAIN` tại thời điểm commit.
4. `Tồn thực tế > Tồn DMS` sinh hạn mức bán App bằng đúng chênh lệch.
5. Lần tải mới nhất thay thế toàn bộ hạn mức đang hoạt động; không cộng dồn phần còn lại của hôm trước.
6. Khi NVBH tạo đơn qua App, cùng một MongoDB transaction sẽ:
   - Trừ hạn mức App bằng atomic update.
   - Tạo đơn bán.
   - Post giảm tồn kho thực tế.
7. Không cho bán vượt `MIN(tồn thực tế, hạn mức App còn lại)`.
8. Xóa đơn sẽ reverse tồn và hoàn hạn mức trong cùng transaction.

## 2. Giao diện phần mềm chính

Trong menu **Tồn kho** đã thêm hai tab:

- `Tồn kho hiện tại`.
- `Đối chiếu tồn DMS`.

Màn hình DMS có:

- Nút tải file buổi sáng, xem lịch sử và tải lại.
- KPI `DMS nhiều hơn thực tế`.
- KPI `Thực tế nhiều hơn DMS`.
- KPI khớp hoàn toàn.
- KPI chưa ghép mã/sai quy cách.
- Tìm kiếm toàn bộ phía server theo mã hoặc tên.
- Bộ lọc theo loại chênh lệch.
- Bảng hiển thị tồn DMS, tồn thực tế, chênh lệch, hạn mức mở, đã bán và còn bán App.
- Popup xem trước trước khi xác nhận commit.

Dữ liệu DMS chỉ dùng đối chiếu và tạo hạn mức; không ghi đè `inventories`.

## 3. Giao diện App bán hàng

Khi tìm/chọn sản phẩm, App hiển thị:

- Tồn thực tế.
- Số còn được bán qua App.
- Ngày snapshot DMS.

Frontend chặn sớm khi số lượng vượt hạn mức. Backend kiểm tra lại bằng atomic update nên không thể vượt hạn mức bằng request thủ công hoặc khi nhiều NVBH đặt đồng thời.

## 4. Mô hình dữ liệu mới

- `dmsInventoryImports`: phiên preview/commit và lịch sử file.
- `dmsInventorySnapshots`: snapshot đối chiếu từng SKU.
- `internalSaleAllocations`: hạn mức active/versioned theo SKU.
- `internalSaleAllocationLedgers`: lịch sử trừ/hoàn hạn mức theo đơn.

Các collection mới đã được thêm vào backup, reset scope và hệ thống index tập trung.

## 5. Xử lý cạnh tranh

Commit file DMS recompute tồn thực tế **bên trong cùng transaction** với thao tác supersede hạn mức cũ và tạo hạn mức mới. Điều này tránh race condition giữa:

- Kế toán commit file DMS buổi sáng.
- NVBH đồng thời tạo đơn trên App.

Hạn mức được trừ bằng điều kiện atomic `remainingQty >= requestedQty`; giá trị không thể âm.

## 6. Vòng đời nghiệp vụ

| Nghiệp vụ | Tồn thực tế | Hạn mức App |
|---|---:|---:|
| Tải file DMS mới | Không đổi | Thay thế bằng chênh lệch mới nhất |
| Tạo đơn App | Giảm | Giảm |
| Tạo đơn DMS/import | Theo luồng tồn hiện tại | Không giảm |
| Xóa/hủy cứng đơn App qua deletion service | Reverse | Hoàn |
| Trả hàng sau giao | Tăng theo return flow | Không tự hoàn; file sáng hôm sau tính lại |
| Nhập kho/điều chỉnh kho | Theo nghiệp vụ kho | Không tự tăng |

## 7. Bảo mật và kiểm soát

- Upload chỉ nhận `.xlsx`, tối đa mặc định 10 MB.
- Quyền xem: Admin/Manager/Accountant/Warehouse.
- Quyền upload/commit: Admin/Accountant/Warehouse.
- File đã commit được chống nhập trùng bằng SHA-256 và unique partial index.
- Preview tự hết hạn sau 24 giờ; snapshot preview cũng có TTL.
- Commit ghi audit log `DMS_INVENTORY_COMMIT`.
- Không trả stack trace ở production.
- Feature flag rollback: `ENABLE_DMS_APP_SALE_QUOTA=false` sẽ bỏ enforcement và cho bán tối đa theo tồn thực tế.

## 8. Kết quả kiểm thử

- File mẫu `EXPORT (2).xlsx`:
  - 302 dòng nguồn.
  - 302 SKU hợp lệ.
  - 0 dòng lỗi.
  - 0 lỗi công thức CS/SU.
  - Tổng tồn DMS: 136.300 đơn vị lẻ.
- Regression test toàn dự án: **511/511 pass**.
- Test riêng Phase 50: **10/10 pass**.
- OpenAPI: đồng bộ, 256 operations.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerability.
- Tất cả JavaScript thay đổi đã qua `node --check`.

## 9. File chính thay đổi

### Backend

- `src/services/dmsInventoryReconciliation.service.js`
- `src/services/internalSaleAllocation.service.js`
- `src/services/mobile/catalog.service.js`
- `src/services/mobile/sales.service.js`
- `src/domain/lifecycle/SalesOrderDeletionService.js`
- `src/controllers/dmsInventoryController.js`
- `src/routes/dmsInventoryRoutes.js`
- `src/models/DmsInventoryImport.js`
- `src/models/DmsInventorySnapshot.js`
- `src/models/InternalSaleAllocation.js`
- `src/models/InternalSaleAllocationLedger.js`

### Frontend

- `public/index.html`
- `public/css/80-dms-inventory.css`
- `public/js/app/10-dms-inventory.js`
- `public/mobile/js/sales.js`
- `public/mobile/mobile.css`
- `public/js/search/productSearchBox.js`

### Test/Docs

- `test/dms-inventory-app-quota.test.js`
- `docs/openapi.json`
