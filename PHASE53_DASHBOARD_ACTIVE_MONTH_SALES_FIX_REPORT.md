# PHASE 53 — Dashboard tính toàn bộ đơn bán hợp lệ trong tháng

## Hiện tượng

Bảng Dashboard hiển thị doanh số tháng của một NVBH thấp hơn rất nhiều so với tổng giá trị các đơn tổng đã gộp. Ví dụ ảnh đối chiếu cho thấy Lương Thị Lan có 38 đơn / 97.007.305 đồng trên Dashboard, trong khi các đơn tổng gộp cùng kỳ chứa 80 chứng từ con / 228.884.880 đồng.

## Nguyên nhân gốc

Phase 52 đã đổi công thức giá trị sang `số lượng × products.salePrice`, nhưng truy vấn doanh số tháng vẫn áp dụng `accountingConfirmedFilter()`.

Do đó:

- Đơn vừa bán, đã gộp, đã in hoặc đang giao nhưng chưa xác nhận kế toán không được tính vào `Thực đạt`.
- Cột `Hôm nay` lại lấy toàn bộ đơn hợp lệ nên số hôm nay có thể đúng, trong khi lũy kế tháng bị thiếu.
- Tổng đơn gộp sử dụng toàn bộ đơn con được chọn, nên hai báo cáo dùng hai phạm vi chứng từ khác nhau.

## Bản sửa

`HomeDashboardService` gọi doanh số tháng với:

```js
SalesDashboardQuery.aggregateSales(range.dateFrom, range.dateTo, {
  requireAccountingConfirmed: false
})
```

Doanh số tháng mới gồm mọi đơn bán hợp lệ trong kỳ, loại trừ đơn bị hủy, xóa hoặc vô hiệu. Công thức giá trị vẫn là:

```text
Số lượng × products.salePrice hiện tại
```

Hàng trả vẫn chỉ trừ khi đã xác nhận nghiệp vụ để tránh phiếu nháp làm giảm KPI.

## Ảnh hưởng

- `Thực đạt`, số đơn tháng, tỷ lệ và doanh số ròng tăng đúng theo toàn bộ đơn hợp lệ.
- `Hôm nay` giữ nguyên phạm vi toàn bộ đơn hợp lệ.
- Không thay đổi tồn kho, công nợ, giá trị đơn, VAT, posting kế toán hoặc đơn tổng.
- Không migration dữ liệu.

## Giao diện

Nhãn `đơn đã xác nhận` được đổi thành `đơn phát sinh hợp lệ` để phản ánh đúng phạm vi số liệu.
