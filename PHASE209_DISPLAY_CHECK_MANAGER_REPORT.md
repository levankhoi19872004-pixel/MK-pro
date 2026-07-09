# PHASE209_DISPLAY_CHECK_MANAGER_REPORT

## Mục tiêu

Xây dựng module mới `Quản lý chấm Trưng bày` theo hướng production-grade, tách khỏi module `Sinh đơn chấm DMS` và tách hoàn toàn khỏi nghiệp vụ đơn bán thật.

## Phạm vi đã thêm

### Backend

- `src/models/displayCheckGroup.model.js`
- `src/models/displayCheckStoreSetup.model.js`
- `src/models/displayCheckPlan.model.js`
- `src/routes/tools/displayCheck.routes.js`
- `src/services/tools/displayCheck/displayCheck.service.js`
- Mount route trong `src/routes/index.js`:
  - `GET /api/tools/display-check/bootstrap`
  - `GET/POST/PUT/DELETE /api/tools/display-check/groups`
  - `GET/POST/PUT/DELETE /api/tools/display-check/store-setups`
  - `POST /api/tools/display-check/generate-preview`
  - `POST /api/tools/display-check/confirm-plan`
  - `GET /api/tools/display-check/plans`
  - `GET /api/tools/display-check/plans/:id`
  - `POST /api/tools/display-check/plans/:id/cancel`

### Frontend

- Menu mới trong `public/fragments/index/01-index-body.html`:
  - `Công cụ: Quản lý chấm Trưng bày`
- Fragment mới:
  - `public/fragments/index/06d-display-check-manager.html`
- Fragment config:
  - `config/index-page-fragments.json`
- JS mới:
  - `public/js/app/tools/display-check-manager.js`
- CSS mới:
  - `public/css/tools/display-check-manager.css`
- Lazy load tab:
  - `public/js/bootstrap/03-tab-loader.js`
- Include CSS/JS:
  - `public/index.shell.html`
  - `public/fragments/index/07-index-body.html`

## Thiết kế UI

Module có 3 tab:

1. `Cài đặt chấm Trưng bày`
   - Tạo/sửa/tắt nhóm chấm.
   - Hỗ trợ nguồn `product_group`, `promotion_group`, `promotion_program`, `custom`.
   - Hỗ trợ điều kiện `amount` và `quantity`.

2. `Cài đặt cửa hàng chấm`
   - Nhập mã cửa hàng.
   - Tên cửa hàng tự resolve từ danh mục khách hàng MK-Pro khi lưu.
   - Nhập doanh số cần chấm, số dòng cần sinh.
   - Tick nhóm trưng bày đã tạo ở tab 1.
   - Nút `Sinh đơn` mở popup preview.

3. `Quản lý danh sách chấm`
   - Hiển thị các plan đã xác nhận theo `workingDate`.
   - Xem chi tiết.
   - Hủy plan bằng cách đổi status, không xóa dữ liệu thật.

## Nguồn dữ liệu MK-Pro

- Hàng lệch DMS: đọc qua `dmsInventoryReconciliation.service.getLatest()`.
- Nhóm KM/Ontop: đọc `PromotionGroupItem`, `PromotionGroupRule`, `Promotion`.
- Nhóm hàng: đọc mềm từ các field sản phẩm: `category`, `brand`, `brandCode`, `groupCode`, `groupName`, `productGroup`, `productGroupCode`, `productGroupName`, `line`, `family`, `printGroup`, `printGroupName`.
- Cửa hàng: đọc `Customer` theo mã.

## Thuật toán sinh preview

Thứ tự xử lý:

1. Load cửa hàng.
2. Load nhóm trưng bày đã chọn.
3. Resolve sản phẩm cho từng nhóm từ MK-Pro.
4. Load hàng lệch DMS khả dụng.
5. Trừ số lượng đã dùng trong các `displayCheckPlans` confirmed cùng ngày.
6. Phase A: sinh đủ từng nhóm trưng bày đã tick.
7. Phase B: tăng mật độ dòng hàng theo `targetLineCount`.
8. Phase C: lấp doanh số tới `targetAmount` trong tolerance.
9. Validate invariant cuối.

## Invariant an toàn

- Không gọi service tạo đơn thật.
- Không tạo `orders`.
- Không tạo `master_orders`.
- Không tạo `arLedgers`.
- Không tạo `fundLedgers`.
- Không tạo `stockTransactions`.
- Không ghi inventory posting.
- Không ảnh hưởng báo cáo doanh số thật.
- Mỗi sản phẩm dùng trong plan không vượt số lượng lệch DMS còn khả dụng trong ngày.
- Nhóm trưng bày đã tick phải đạt threshold, nếu không thì preview là `infeasible`.

## Quản lý theo ngày

- `displayCheckStoreSetups` lọc theo `workingDate`.
- `displayCheckPlans` lọc theo `workingDate`.
- Sang ngày mới không xóa dữ liệu cũ, chỉ đổi filter ngày.
- DMS gap khả dụng trong ngày được trừ theo các plan `confirmed` cùng `workingDate`.

## Kiểm tra đã chạy

```txt
npm run check:syntax
npm run check:source-size
```

Kết quả:

```txt
SYNTAX_OK 1333 JavaScript files
[source-size-budget] OK
```

## Chưa chạy được đầy đủ trong sandbox

Không chạy được require route runtime vì sandbox không có `node_modules/express`. Đây là hạn chế môi trường, không phải lỗi syntax.

## Cách test nhanh

1. Deploy ZIP mới.
2. Vào `Công cụ: Quản lý chấm Trưng bày`.
3. Chọn ngày chấm.
4. Tab 1 tạo nhóm chấm:
   - OMO amount 1.000.000.
   - Sunlight quantity 12.
5. Tab 2 nhập mã cửa hàng, doanh số cần chấm, số dòng cần sinh, tick nhóm.
6. Bấm `Sinh đơn`.
7. Popup phải hiển thị sản phẩm và điều kiện nhóm đạt/chưa đạt.
8. Bấm `Xác nhận chấm`.
9. Tab 3 phải có plan đã xác nhận.
10. Kiểm tra không phát sinh đơn thật/công nợ/tồn kho.

## Giới hạn hiện tại

- Thuật toán là heuristic deterministic, chưa dùng optimizer/ILP.
- Mapping nhóm hàng phụ thuộc dữ liệu field sản phẩm hiện có; đã viết resolver mềm nhưng vẫn cần dữ liệu danh mục sạch.
- Nếu DMS gap không đủ hoặc targetAmount thấp hơn tổng threshold nhóm đã chọn, preview sẽ báo không khả thi thay vì sinh nửa vời.
