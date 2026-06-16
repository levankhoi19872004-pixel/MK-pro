# PHASE 55 — DASHBOARD ACTUAL CONFIRMED SALES FIX

## 1. Mục tiêu

Sửa sai lệch doanh số trên Dashboard theo **Phương án A — production-grade**:

- `Thực đạt` chỉ tính đơn bán đã xác nhận kế toán.
- Giá trị doanh số lấy từ số tiền thực tế đã khóa trên chứng từ tại thời điểm bán.
- Không cộng dòng hàng khuyến mại vào doanh số.
- Tách riêng đơn và giá trị đang chờ xác nhận kế toán.
- Tách riêng giá trị khuyến mại/chiết khấu.
- Hàng trả chỉ trừ khi đã xác nhận và dùng giá trị thực tế trên phiếu trả.
- Loại đơn hủy/xóa theo toàn bộ trạng thái legacy.
- Chống cộng trùng document có cùng mã nghiệp vụ.

## 2. Nguyên nhân gốc

Phiên bản trước tính số lượng của mọi dòng hàng với `products.salePrice` hiện tại. Cách tính này gây tăng doanh số khi:

1. Dòng khuyến mại có `quantity > 0` nhưng số tiền thực tế bằng 0.
2. Đơn chưa xác nhận kế toán vẫn được cộng vào `Thực đạt`.
3. Giá sản phẩm hiện tại khác giá tại thời điểm bán.
4. Đơn đã hủy/xóa chỉ được đánh dấu ở `lifecycleStatus`, `deliveryStatus`, `deleted` hoặc `isDeleted`.
5. Dữ liệu legacy có nhiều document khác `_id` nhưng cùng mã đơn.

## 3. Quy tắc nghiệp vụ sau sửa

### 3.1 Thực đạt tháng

```text
Tổng giá trị thực tế của đơn đang hiệu lực và đã xác nhận kế toán
```

Nguồn giá trị ưu tiên:

1. Tổng tiền sau khuyến mại đã khóa trên đơn (`afterPromoAmount`, `totalAfterPromotion`, `goodsAmountAfterPromotion`, `netAmount`, `totalAmount`, ...).
2. Tổng tiền thực tế từng dòng (`lineAmountAtOrder`, `finalAmount`, `amount`, ...).
3. Số lượng × giá bán thực tế đã lưu trên dòng.
4. Snapshot giá lịch sử; giá sản phẩm hiện tại chỉ là fallback cuối cùng cho dữ liệu cũ và được ghi cảnh báo chất lượng dữ liệu.

### 3.2 Chờ xác nhận

Đơn đang hiệu lực nhưng chưa đạt điều kiện xác nhận kế toán được hiển thị riêng, không cộng vào `Thực đạt` và không tính KPI.

### 3.3 Khuyến mại

Dòng được nhận diện là khuyến mại khi có một trong các dấu hiệu:

- `isPromo = true`;
- `lineType` là `PROMO`, `PROMOTION`, `KM`, `FREE_GOOD`;
- có `promoQuantity/freeQty > 0` và không có số lượng bán.

Giá trị khuyến mại được hiển thị riêng và không cộng vào doanh số thực đạt.

### 3.4 Hàng trả

Chỉ tính phiếu trả đã xác nhận kế toán/đã post AR. Giá trị ưu tiên số tiền thực tế trên phiếu trả, không định giá lại toàn bộ bằng giá sản phẩm hiện tại.

### 3.5 Chống trùng

Dashboard group theo mã nghiệp vụ của đơn/phiếu trả, giữ phiên bản cập nhật mới nhất và không cộng các bản ghi trùng còn lại. Số document và số tiền bị loại được đưa vào `dataQuality.warnings`.

## 4. File đã thay đổi

| File | Nội dung |
|---|---|
| `src/services/dashboard/SalesDashboardQuery.js` | Viết lại pipeline doanh số/hàng trả, loại KM, tách confirmed/pending, định giá lịch sử, dedupe và audit |
| `src/services/dashboard/DashboardMongoExpressions.js` | Bộ lọc hủy/xóa đầy đủ cho status/lifecycle/delivery/return/delete flags |
| `src/services/dashboard/HomeDashboardService.js` | Tách thực đạt, chờ xác nhận, KM; bổ sung cảnh báo chất lượng dữ liệu |
| `public/index.html` | Bổ sung thẻ và cột Chờ xác nhận/Khuyến mại, cập nhật diễn giải nghiệp vụ |
| `public/js/app/00-dashboard.js` | Render dữ liệu mới và cập nhật cache-busting Phase 55 |
| `public/css/05-home-dashboard.css` | Mở rộng bảng Dashboard cho 12 cột |
| `test/home-dashboard.test.js` | Bổ sung regression test cho toàn bộ quy tắc Phase 55 |

## 5. Bảo vệ dữ liệu và tương thích

- Không migration MongoDB.
- Không ghi/chỉnh sửa đơn hàng, phiếu trả, tồn kho, AR hoặc quỹ.
- Chỉ thay đổi truy vấn đọc và hiển thị Dashboard.
- Giữ alias `buildCatalogSalesPipeline`, `buildCatalogReturnsPipeline` và `dataQuality.catalogPricing` để client/module cũ không bị gãy.
- Dashboard cache mặc định vẫn tắt; khi bật cache, freshness version tiếp tục theo dõi orders, returnOrders, arLedgers, masterOrders, users, targets và products.

## 6. Kết quả quality gate

| Kiểm tra | Kết quả |
|---|---:|
| JavaScript syntax | 636 file hợp lệ |
| Dashboard regression tests | 23/23 pass |
| Toàn bộ test hệ thống | 529/529 pass |
| OpenAPI | 256 operations, up to date |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

## 7. Lưu ý khi đối soát production

ZIP không chứa dữ liệu MongoDB production, vì vậy số tiền chính xác sau sửa chỉ có thể xác nhận sau khi deploy. Khi Dashboard trả cảnh báo `dataQuality`, cần kiểm tra các nhóm:

- dòng thiếu giá trị thực tế và snapshot giá;
- dòng phải fallback sang giá danh mục hiện tại;
- đơn lệch giữa tổng chứng từ và tổng dòng;
- document trùng mã đã bị loại;
- đơn/phiếu trả chưa map được NVBH.

Các cảnh báo không làm Dashboard cộng trùng; chúng cho biết dữ liệu legacy cần chuẩn hóa thêm.
