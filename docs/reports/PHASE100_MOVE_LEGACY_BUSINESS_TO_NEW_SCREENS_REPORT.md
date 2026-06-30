# PHASE100 — Chuyển nghiệp vụ chuẩn từ màn cũ sang màn mới

## 1. Phạm vi

Phase này chuyển có chọn lọc các nghiệp vụ chuẩn từ màn **Đơn giao hôm nay cũ** và **Công nợ cũ** sang hai màn mới:

- `Đơn giao hôm nay (New)`
- `Công nợ (New)`

Không copy nguyên màn cũ. Các luồng rủi ro như cashbook/bankbook thủ công, AR ledger audit sâu, GPS/tuyến giao, quản lý returnOrders đầy đủ và debug scripts không được đưa vào hai màn mới.

## 2. Bảng phân loại nghiệp vụ

| Nghiệp vụ | Màn cũ | Màn mới đích | Phân loại | Lý do |
|---|---|---|---|---|
| Search-gated filter | Delivery/Debt cũ | Cả hai màn New | KEEP/REBUILD | Bắt buộc chống query rộng |
| KPI PT/TM/CK/TH/HT/CN | Đơn giao hôm nay cũ | Đơn giao hôm nay New | KEEP | Nghiệp vụ giao hàng thực tế |
| Nhóm NVBH thuộc NVGH | Đơn giao hôm nay cũ | Đơn giao hôm nay New | KEEP | Cần cho NVGH/kế toán tách tiền theo NVBH |
| Danh sách đơn giao | Đơn giao hôm nay cũ | Đơn giao hôm nay New | KEEP | Lõi vận hành giao hàng trong ngày |
| Xem hàng giao/hàng trả | Đơn giao hôm nay cũ | Đơn giao hôm nay New | KEEP | returnOrders là SSoT |
| Correction sau chốt | Đơn giao hôm nay cũ | Đơn giao hôm nay New | REBUILD | Dùng DeliveryCloseoutCorrectionService, không sửa ngược |
| GPS/tuyến giao | Đơn giao hôm nay cũ | Module riêng/ẩn | MOVE OUT | Không thuộc closeout kế toán |
| Cashbook/bankbook | Công nợ cũ | Quỹ tiền | MOVE OUT | fundLedgers là SSoT, không trộn vào công nợ |
| AR ledger audit sâu | Công nợ cũ | AR Ledger Audit | MOVE OUT | Công nợ New chỉ read-only theo AR-DEBT-* |
| KPI công nợ | Công nợ cũ | Công nợ New | KEEP | Quản trị tổng nợ, khách nợ, đơn nợ |
| Danh sách khách nợ | Công nợ cũ | Công nợ New | KEEP | Lõi nghiệp vụ công nợ |
| Chi tiết đơn nợ | Công nợ cũ | Công nợ New | KEEP | Cần để lập phiếu thu |
| Lập phiếu thu submitted | Công nợ cũ | Công nợ New | KEEP | Phiếu chưa confirm không giảm nợ |
| Confirm/reject phiếu thu | Công nợ cũ | Công nợ New | KEEP | Confirm mới sinh AR-DEBT-PAYMENT/fund ledger |
| External debt | Công nợ cũ | Giữ service riêng | REBUILD/MOVE OUT | Không copy nếu contract chưa đủ sạch |

## 3. File đã sửa

| File | Lý do sửa | Thay đổi chính |
|---|---|---|
| `public/js/app/new/92-debt-new.js` | Chuyển nghiệp vụ Công nợ chuẩn sang màn New | Search-gated UI, empty state, KPI, danh sách khách, chi tiết đơn nợ, tick đơn, allocation preview, tạo phiếu thu submitted, xem/confirm/reject phiếu thu |
| `src/services/v2/debtNew.service.js` | Siết backend contract Công nợ New | Thêm `hasSearchCriteria`, guarded empty result, summary chuẩn, không query AR nếu thiếu criteria |
| `src/routes/newOperationsRoutes.js` | Expose API nghiệp vụ Công nợ New | Thêm `/api/new/debt/collections`, submit, confirm, reject qua `DebtCollectionService` |
| `test/phase91-new-services-contract.test.js` | Chống tái phát | Thêm test backend guard Công nợ New, UI search-gated/collection workflow, route collection New |
| `RELEASE_MANIFEST.json` | Đồng bộ manifest | Cập nhật hash sau khi sửa source |

## 4. Contract mới

### Đơn giao hôm nay New

Giữ contract Phase99/Phase92:

- Không tự tải khi mở màn.
- Ngày mặc định không tính là điều kiện tìm kiếm.
- Backend có `hasSearchCriteria`.
- Hàng trả lấy từ `returnOrders`.
- Đơn đã xác nhận kế toán chỉ điều chỉnh qua correction/version, không sửa ngược.

### Công nợ New

`GET /api/new/debt/customers`

- Không trả toàn bộ khách nếu thiếu criteria.
- `status` mặc định một mình không được tính là criteria.
- Chỉ đọc AR canonical categories:
  - `AR-DEBT-OPEN`
  - `AR-DEBT-PAYMENT`
  - `AR-DEBT-ADJUSTMENT`
  - `AR-DEBT-VOID`

`POST /api/new/debt/collections`

- Tạo phiếu thu trạng thái `submitted`.
- Không làm giảm công nợ chính thức.

`POST /api/new/debt/collections/:id/confirm`

- Xác nhận phiếu thu.
- Đi qua `DebtCollectionService.confirmDebtCollection()`.
- Confirm mới post AR/fund theo contract backend.

`POST /api/new/debt/collections/:id/reject`

- Từ chối phiếu thu.
- Không sinh AR/fund.
- Công nợ không đổi.

## 5. Test đã chạy

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
# 24 pass, 0 fail

npm run check:syntax
# SYNTAX_OK 1180 JavaScript files

npm run check:release-manifest
# RELEASE_MANIFEST_OK 2026-06-30-01
```

`npm run check:source-bundles` chưa chạy được trong sandbox vì môi trường không có `node_modules/terser`.

## 6. Cách tự kiểm tra UI

1. Mở `Đơn giao hôm nay (New)`:
   - Không tự hiện dữ liệu.
   - Nhập NVGH/NVBH/khách rồi bấm Tải đơn.
   - Kiểm tra KPI, nhóm NVBH, danh sách đơn, popup điều chỉnh.

2. Mở `Công nợ (New)`:
   - Không tự hiện danh sách khách.
   - Bấm Tải New khi chưa nhập filter → báo cần điều kiện tìm kiếm.
   - Nhập mã khách/NVBH/NVGH rồi tải.
   - Chọn khách → xem đơn nợ.
   - Tick đơn → kiểm tra allocation preview.
   - Tạo phiếu thu → trạng thái chờ xác nhận.
   - Confirm/reject phiếu thu trong panel phiếu thu.

## 7. Rủi ro còn lại

- Cần test runtime với MongoDB thật để xác nhận `DebtCollectionService.checkAvailableDebt()` khớp dữ liệu AR-DEBT-* production.
- Quyền thao tác confirm/reject đang dùng `writeRoles` gồm admin/manager/accountant; nên rà lại nếu cần chỉ kế toán/admin.
- External debt chưa đưa vào UI New như một form riêng vì cần giữ module/source riêng, tránh trộn vào màn công nợ đọc chính.
