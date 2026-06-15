# PHASE 52 — Dashboard doanh số theo giá bán sản phẩm

## Mục tiêu

Toàn bộ giá trị bán hàng trong bảng “Báo cáo nhân viên bán hàng theo tháng” được tính bằng:

`Số lượng dòng hàng × salePrice hiện đang lưu tại danh mục products`

Không sử dụng `totalAmount`, giá sau khuyến mại hoặc giá thực bán trên đơn.

## Phạm vi

- Thực đạt tháng: đơn đã xác nhận kế toán, tính theo giá bán sản phẩm.
- Hàng trả tháng: phiếu trả đã xác nhận, tính theo giá bán sản phẩm.
- Doanh số ròng: thực đạt danh mục trừ hàng trả danh mục.
- Tỷ lệ hoàn thành: doanh số ròng danh mục / chỉ tiêu.
- Hôm nay: toàn bộ đơn hợp lệ phát sinh hôm nay, không chờ xác nhận kế toán, tính theo giá bán sản phẩm.
- Công nợ: giữ nguyên nguồn chuẩn `arLedgers`.

## Giải pháp kỹ thuật

`SalesDashboardQuery` unwind từng dòng hàng, lookup `products.code`, đọc giá hiện tại từ `products.salePrice`, sau đó mới group theo chứng từ và NVBH. Pipeline không fallback sang giá thực bán.

Các dòng không tìm thấy sản phẩm hoặc sản phẩm có giá bán bằng 0 được tính giá trị 0 và đưa vào cảnh báo chất lượng dữ liệu; không âm thầm dùng giá trên đơn.

`DashboardCacheService` đã bổ sung phiên bản collection `products` để cache tự hết hiệu lực khi giá bán sản phẩm thay đổi.

## Lưu ý nghiệp vụ

Do dùng giá hiện tại trong danh mục, khi thay đổi `products.salePrice`, báo cáo tháng cũ cũng được tính lại theo giá mới. Đây là đúng yêu cầu “giá bán được lưu ở phần sản phẩm”, không phải snapshot giá tại thời điểm bán.
