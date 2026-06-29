# Phase47 - Admin Data Correction Standard

## 1. Tổng quan vấn đề

Mục tiêu của phase này là cho Admin có quyền chỉnh sửa số liệu khi phát hiện dữ liệu đầu vào/import sai, nhưng không phá vỡ các nguồn chuẩn của MK-Pro:

- Inventory/stock movement: ghi bằng `stockTransactions`, không sửa tay tồn hiện tại.
- Công nợ: ghi bằng `arLedgers`, không sửa tay tổng nợ.
- Quỹ: ghi bằng `fundLedgers`, không sửa tay số dư.
- Đơn bán/trả hàng: chỉnh field nghiệp vụ có kiểm soát, audit trước/sau.

Rủi ro nếu cho sửa trực tiếp không kiểm soát:

- Lệch tồn kho so với giao dịch thực tế.
- Lệch công nợ khách hàng so với AR ledger.
- Lệch quỹ tiền mặt/ngân hàng so với sổ quỹ.
- Không truy vết được ai sửa, sửa lúc nào, sửa vì sao.
- Báo cáo doanh số/KPI bị thay đổi mà không có bằng chứng.

## 2. Phân loại dữ liệu và mức độ rủi ro

| Nhóm | Ví dụ | Mức rủi ro | Cách sửa | Cần duyệt | Ledger điều chỉnh |
|---|---|---:|---|---:|---:|
| A - Master data | Tên KH, địa chỉ, SĐT, nhóm hàng, ghi chú | Thấp | Sửa trực tiếp qua correction + audit | Không bắt buộc | Không |
| B - Nghiệp vụ | NVBH/NVGH, ngày bán, ngày giao, trạng thái, quy cách | Trung bình | Correction request + validate + audit | Có | Tùy trường |
| C - Tài chính/kho/công nợ | Tồn kho, công nợ, quỹ, số tiền đơn đã xác nhận | Cao | Phiếu điều chỉnh + ledger bù trừ | Có | Có |

## 3. Quy chuẩn chỉnh sửa đề xuất

- Trước khi phát sinh nghiệp vụ: có thể sửa trực tiếp field master/field staging, vẫn ghi audit.
- Sau khi phát sinh nghiệp vụ: sửa bằng correction request để hiển thị diff và cảnh báo ảnh hưởng.
- Sau khi kế toán xác nhận: không sửa trực tiếp số tiền/số lượng; tạo phiếu điều chỉnh.
- Sau khi đã vào báo cáo/quỹ/công nợ/tồn kho: rollback bằng bút toán đảo, không xóa ledger cũ.

## 4. Kiến trúc module Admin Data Correction

### UI

- Tab mới: `Chỉnh sửa số liệu`.
- Màn hình: `Trung tâm chỉnh sửa số liệu`.
- Có danh sách phiếu, trạng thái, mức rủi ro, lý do, người tạo.
- Có form tạo phiếu chỉnh sửa bằng JSON patch.
- Có nút xem quy chuẩn, kiểm tra patch, duyệt, áp dụng, rollback.

### API

- `GET /api/admin/data-correction/standard`
- `GET /api/admin/corrections`
- `GET /api/admin/corrections/:id`
- `POST /api/admin/corrections`
- `POST /api/admin/corrections/:id/approve`
- `POST /api/admin/corrections/:id/reject`
- `POST /api/admin/corrections/:id/apply`
- `POST /api/admin/corrections/:id/rollback`
- `GET /api/admin/entities/:entityType/:id/edit-context`
- `POST /api/admin/entities/:entityType/:id/validate-change`
- `POST /api/admin/entities/:entityType/:id/request-change`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/:entityType/:id`

### Database

Đã thêm model/collection:

- `adminCorrectionRequests`
- `inventoryAdjustments`
- `arAdjustments`
- `fundAdjustments`

Audit tiếp tục ghi vào `audit_logs` để tương thích hệ thống cũ.

### Service

- `src/services/admin-correction/AdminDataCorrectionService.js`
- `src/policies/adminCorrectionPolicy.js`
- `src/utils/adminCorrectionDiff.util.js`

## 5. Quy chuẩn theo từng nghiệp vụ

| Nghiệp vụ | Quy chuẩn |
|---|---|
| Đơn bán | Field master/ngày/NVBH/NVGH được tạo correction; số tiền/số lượng sau khi đã kế toán/tồn kho phải dùng điều chỉnh ledger |
| Đơn trả hàng | Tương tự đơn bán; nếu đã nhập kho/AR-RETURN thì rollback bằng bút toán đảo |
| Tồn kho | Không sửa `availableQty/currentQty`; tạo `inventoryAdjustments` và `stockTransactions` |
| Công nợ | Không sửa tổng nợ; tạo `arAdjustments` và `arLedgers` debit/credit |
| Quỹ | Không sửa số dư; tạo `fundAdjustments` và `fundLedgers` in/out |
| Import Excel/DMS | Trước commit sửa staging row; sau commit tạo correction |
| Sản phẩm | Tên/quy cách/nhóm hàng sửa trực tiếp có audit; giá/quy cách ảnh hưởng đơn tương lai |
| Khách hàng | Tên/địa chỉ/SĐT/tuyến sửa trực tiếp có audit |
| Nhân viên | Thông tin nhân viên sửa trực tiếp; thay NVBH/NVGH trên đơn phải correction |

## 6. Code mẫu đã triển khai

- Helper diff: `buildObjectDiff(before, after)`.
- Middleware lý do bắt buộc: `requireCorrectionReason`.
- Service tạo phiếu: `createCorrectionRequest`.
- Service apply: `applyCorrectionRequest`.
- AR adjustment: tạo `ArAdjustment` + `ArLedger`.
- Inventory adjustment: tạo `InventoryAdjustment` + `StockTransaction`.
- Fund adjustment: tạo `FundAdjustment` + `FundLedger`.
- Rollback: tạo bút toán đảo, không xóa ledger cũ.

## 7. Test/kiểm chứng

Đã thêm test:

- `test/admin-data-correction-static.test.js`

Các case bảo vệ:

- API được mount dưới `/api/admin`.
- Field rủi ro cao không được direct-write.
- Tồn kho/công nợ/quỹ tạo adjustment + ledger.
- Rollback dùng bút toán đảo, không delete/remove ledger.
- UI có tab Trung tâm chỉnh sửa số liệu.

## 8. Phương án triển khai

### Phương án A - Production-grade dài hạn

Nội dung:

- Chuẩn hóa DTO correction cho từng nghiệp vụ.
- Màn hình sửa trực quan theo từng entity, không cần nhập JSON.
- Duyệt 2 lớp cho phiếu rủi ro cao.
- Tích hợp file chứng từ đính kèm.
- Tạo integration test với Mongo test DB.

Ưu điểm:

- An toàn nhất.
- Phù hợp mở rộng SaaS/multi-tenant.
- Dễ audit và rollback.

Nhược điểm:

- Nhiều effort UI/API/test.
- Cần huấn luyện Admin/kế toán theo quy trình mới.

Effort: Hard  
Rủi ro: Medium

### Phương án B - Cân bằng effort, phù hợp nội bộ hiện tại

Nội dung:

- Dùng module hiện tại làm nền.
- Cho Admin tạo phiếu bằng patch JSON cho các case đặc biệt.
- Tồn kho/công nợ/quỹ đã có phiếu điều chỉnh ledger.
- Sau này bổ sung form riêng cho từng nghiệp vụ hay sửa nhiều nhất.

Ưu điểm:

- Nhanh đưa vào sử dụng.
- Không phá flow hiện tại.
- Vẫn có audit, diff, rollback.

Nhược điểm:

- JSON patch chưa thân thiện với người không kỹ thuật.
- Cần bổ sung form nghiệp vụ riêng khi dùng thường xuyên.

Effort: Medium  
Rủi ro: Low-Medium

## 9. Kết luận

Đề xuất MK-Pro nội bộ dùng Phương án B trước. Với quy mô NPP hiện tại, nên ưu tiên:

1. Chỉnh sửa master data trực tiếp có audit.
2. Tạo phiếu điều chỉnh tồn kho/công nợ/quỹ.
3. Không cho sửa thẳng ledger/số dư/số tồn.
4. Sau 1-2 tuần vận hành, thống kê loại chỉnh sửa thường dùng để xây form riêng dễ dùng hơn.
