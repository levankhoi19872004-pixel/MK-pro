# PHASE 56 — CHUẨN HÓA TOÀN BỘ NGHIỆP VỤ BÁO CÁO

## 1. Tổng quan

Bản vá Phase 56 được phát triển từ Phase 55 theo phương án A: tách nghiệp vụ báo cáo thành các domain service độc lập, dùng đúng nguồn dữ liệu chuẩn và để API/Dashboard/Excel dùng chung một công thức.

Kiến trúc dự án giữ nguyên Node.js/Express + MongoDB/Mongoose; không thay đổi luồng ghi nghiệp vụ và không thực hiện migration tự động trên dữ liệu production.

## 2. Nguồn dữ liệu chuẩn sau sửa

| Nghiệp vụ | Nguồn chuẩn |
|---|---|
| Tồn kho hiện tại | `inventories` |
| Nhập – xuất – tồn, thẻ kho | `stockTransactions` + đối chiếu/backcast từ `inventories` |
| Doanh số | `orders` đã xác nhận kế toán + snapshot giá trị trên đơn |
| Trả hàng | `returnOrders` đã xác nhận + `arLedgers` loại AR-RETURN |
| Công nợ | `arLedgers` |
| Quỹ tiền | `fundLedgers` |
| Giao hàng | `master_orders` + các đơn con còn hiệu lực + `fundLedgers` |

## 3. Nội dung đã sửa

### 3.1. Tồn kho

- `stock-report` luôn là tồn kho hiện tại, không còn tự đổi sang báo cáo phát sinh khi giao diện gửi ngày.
- Tách báo cáo mới `inventory-movement-report` cho nhập – xuất – tồn theo kỳ.
- Tách rõ `onHand`, `reservedQty`, `availableQty`; không gán tồn khả dụng thành tồn vật lý.
- Phân loại reversal theo dấu của `quantity`; transaction âm không còn bị cộng dương chỉ vì tên chứa `RETURN` hoặc `IMPORT`.
- Công thức nhập – xuất – tồn:

```text
Tồn đầu kỳ + Tổng nhập - Tổng xuất = Tồn cuối kỳ
```

- Tồn cuối kỳ được backcast từ `inventories` khi xem kỳ quá khứ; đồng thời xuất thêm tồn theo ledger và chênh lệch đối soát.
- Thẻ kho bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.

### 3.2. Bán hàng

- Chỉ tính đơn còn hiệu lực và đã xác nhận kế toán.
- Loại dòng hàng khuyến mại khỏi số lượng bán và doanh số thực tế.
- Ưu tiên snapshot giá/giá trị tại thời điểm bán; giá danh mục hiện tại chỉ là fallback dữ liệu cũ và được đếm trong cảnh báo chất lượng.
- Tổng tiền đã khóa trên đơn là nguồn chuẩn, kể cả khi bằng 0 do giảm giá 100%.
- Loại trùng theo mã nghiệp vụ, giữ phiên bản mới nhất.
- Bộ lọc ngày sử dụng một ngày nghiệp vụ ưu tiên; không OR với `createdAt` làm kéo đơn cũ vào kỳ import mới.

### 3.3. Công nợ

- Báo cáo theo kỳ có đủ:

```text
Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ
```

- Phân loại riêng tiền thu, trả hàng, chiết khấu/điều chỉnh và phát sinh Có khác.
- Sổ công nợ chi tiết bắt đầu từ dư trước kỳ của từng khách hàng.
- Báo cáo thông tin khách hàng lấy công nợ hiện tại từ domain công nợ chuẩn thay vì tự cộng lại bằng logic riêng.

### 3.4. Quỹ tiền

- Chỉ đọc `fundLedgers`.
- Tính tồn đầu kỳ, thu, chi và tồn cuối kỳ.
- Tách riêng tiền mặt/ngân hàng và từng tài khoản quỹ.
- Không còn cộng chung mọi tài khoản vào một running balance duy nhất.

### 3.5. Trả hàng

- Chỉ tính phiếu còn hiệu lực và đã xác nhận kế toán/đã post AR.
- Ưu tiên giá trị AR-RETURN đã post; fallback về giá trị khóa trên chứng từ khi dữ liệu cũ chưa có liên kết AR.
- Báo cáo hiển thị đồng thời giá trị chứng từ và giá trị AR để đối chiếu.

### 3.6. Giao hàng

- Tính lại số đơn và tổng tiền từ đơn con hiện còn thuộc đơn tổng và đã giao.
- Không tin hoàn toàn vào snapshot `master_orders.totalAmount/orderCount`.
- Tiền thu lấy từ `fundLedgers`.
- Xuất chênh lệch snapshot để phát hiện đơn tháo/gán lại hoặc dữ liệu tổng cũ.
- Kiểm tra mọi field trạng thái giao hàng; field alias `pending` cũ không còn che trạng thái `completed` hợp lệ.

### 3.7. Báo cáo tổng hợp khác

- Báo cáo NVBH, NVGH, khách hàng và sản phẩm dùng lại các domain service chuẩn.
- Báo cáo sản phẩm bổ sung `Tồn vật lý`, `Đã giữ chỗ`, `Tồn khả dụng` từ `inventories`.
- Doanh số tháng trong thông tin khách hàng chỉ lấy đơn đã xác nhận kế toán.
- Dashboard report mặc định dùng domain mới; `mode=legacy` chỉ được giữ làm đường rollback có chủ đích.

## 4. Kiến trúc mới

```text
InventoryReportService
SalesReportService
ReturnReportService
DebtReportService
FinanceReportService
DeliveryReportService
DashboardReportService
        ↓
DTO báo cáo chuẩn
        ↓
API / Dashboard / Excel
```

Excel không còn tự tính lại nghiệp vụ chính bằng công thức riêng.

## 5. API bổ sung

- `GET /api/inventory-movement`
- `GET /api/reports/inventory-movement`
- `GET /api/reports/returns`

`GET /api/stock` và `GET /api/reports/stock` luôn trả tồn hiện tại từ `inventories`.

## 6. Kiểm thử

- 640 file JavaScript: syntax hợp lệ.
- 535/535 test pass khi chạy theo 4 shard.
- OpenAPI: 259 operations, tài liệu đồng bộ.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- Test mới bao phủ:
  - reversal theo dấu quantity;
  - tách on-hand/reserved/available;
  - loại hàng khuyến mại;
  - phân bổ giá trị dòng khớp tổng đơn;
  - giữ tổng tiền khóa bằng 0;
  - tách quỹ theo loại/tài khoản;
  - trạng thái giao hàng alias không che trạng thái hoàn tất.

## 7. Lưu ý dữ liệu production

Bản vá sửa công thức đọc và đối soát, không tự sửa lịch sử MongoDB. Nếu cột `Chênh lệch đối soát` khác 0, điều đó cho thấy `stockTransactions` lịch sử và `inventories` hiện tại đang không khớp. Không chạy rebuild/xóa dữ liệu tự động; cần kiểm tra chứng từ nguồn và transaction bị thiếu/trùng trước khi sửa dữ liệu.
