# PHASE80B — BƯỚC 1: CHỐT QUY TẮC EXCEL SẢN PHẨM

Ngày thực hiện: 19/06/2026

## Quy tắc nghiệp vụ

Mọi file Excel xuất từ hệ thống có dòng sản phẩm phải có:

1. **Quy cách**: chỉ là số lượng đóng gói dạng số lấy từ danh mục sản phẩm, ví dụ `24`.
2. **Giá bán**: lấy từ `Product.salePrice` của danh mục sản phẩm.

Không dùng chuỗi mô tả như `1 thùng = 24 gói` trong cột Quy cách.
Không suy ra Giá bán từ thành tiền, giá vốn, giá nhập, giá trên chứng từ hoặc giá sau khuyến mại.

## Ngoại lệ được giữ nguyên

Đơn con vẫn giữ riêng **Giá sau KM**. Hai cột có ý nghĩa độc lập:

- Giá bán: giá danh mục sản phẩm.
- Giá sau KM: giá giao dịch thực tế sau khuyến mại/chiết khấu của đơn.

## Vùng áp dụng

- Đơn con.
- Đơn tổng và chi tiết sản phẩm.
- Phiếu nhập và chi tiết hàng nhập.
- Kết quả import/preview.
- Trung tâm báo cáo.
- Báo cáo tồn kho, nhập–xuất–tồn, thẻ kho và báo cáo theo sản phẩm.
- VAT và danh sách đơn không xuất VAT.
- Export collection chung có dữ liệu sản phẩm.
- Excel xuất từ cửa sổ in đơn con, đơn tổng, nhập kho và trả hàng.

## Nguyên tắc kỹ thuật

- Đối chiếu theo mã sản phẩm.
- Chỉ một truy vấn batch danh mục sản phẩm cho một lần export; không truy vấn từng dòng.
- Trường danh mục không tồn tại được để trống, không fallback sang giá chứng từ.
- Không thay đổi mẫu in giấy; cột bổ sung trong cửa sổ in chỉ hiện khi xuất Excel.
