# PHASE 21 - ĐƠN CON GIỐNG MẪU INVOICE-36

## Mục tiêu

Chuẩn hóa toàn bộ in đơn con Web/App/DMS về profile `SALES_INVOICE_DMS_EXACT_V1`, tách biệt khỏi profile A4 của đơn tổng và chứng từ kho.

## Kiến trúc

```text
SalesOrder Mongo snapshot
  -> DmsExactSalesInvoiceBuilder
  -> buildPrintData compatibility adapter
  -> DmsExactPagination
  -> dmsExactSalesInvoice.template
  -> dms-exact-sales-invoice.css
```

## Quy chuẩn chính

- Letter portrait: 612 x 792 pt.
- Vùng bảng: 572,76 pt.
- 10 cột theo đúng kích thước đo từ PDF mẫu.
- Hai liên có cùng số trang và cùng điểm ngắt.
- Tối đa 24 dòng ở trang hàng đầu tiên; dòng dài được tính chiều cao để tránh tràn.
- Summary/chữ ký đặt sau dòng hàng cuối; nếu không đủ chỗ sẽ sang trang mới.
- Khuyến mại và cấn trừ tiếp tục tận dụng phần trống cuối trang, sau đó phân trang động.
- Font stack ưu tiên Myriad Pro, fallback Helvetica/Arial.

## Dữ liệu lịch sử

Các field được ưu tiên khi in lại:

```text
conversionRateAtOrder
catalogSalePriceAtOrder
preTaxPriceAtOrder
finalPrice
vatAmountAtOrder
lineAmountAtOrder
warehouseCodeAtOrder
appliedPromotionRows
```

Dữ liệu legacy thiếu snapshot mới fallback sang giá trị hiện có.

## Không ảnh hưởng

- Không thay đổi logic tồn kho.
- Không thay đổi công nợ/quỹ.
- Không thay đổi đơn tổng, phiếu nhập hoặc đơn trả.
- Không thay đổi endpoint in hiện tại; alias cũ tự chuyển sang profile exact.

## Kiểm thử

- Syntax check các file mới/sửa.
- Test profile, kích thước Letter, chiều rộng cột, hai liên.
- Test phân trang đơn 25 dòng và đơn 16 dòng.
- Regression toàn bộ nhóm Print Domain.
- Render xác minh bằng WeasyPrint: 6 trang Letter cho fixture 3 trang x 2 liên.

## Giới hạn cần biết

Để pixel giống tuyệt đối PDF Adobe LiveCycle, máy in/trình duyệt cần có Myriad Pro và in Scale 100%. Hệ thống không đóng gói hoặc phân phối font thương mại; CSS chỉ ưu tiên font đã được cài trên máy người dùng.
