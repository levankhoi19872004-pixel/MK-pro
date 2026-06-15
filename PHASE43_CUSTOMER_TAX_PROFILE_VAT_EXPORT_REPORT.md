# PHASE43 - CUSTOMER TAX PROFILE & VAT EXPORT

## Phạm vi
- Thêm `taxCode` và `taxInvoiceAddress` vào hồ sơ khách hàng.
- Bổ sung hai trường vào popup thêm/sửa khách hàng.
- Bổ sung hai cột vào mẫu import khách hàng và luồng preview/commit MongoDB.
- Xuất VAT TT78 ưu tiên địa chỉ hóa đơn thuế, không dùng địa chỉ giao hàng khi hồ sơ thuế đã có.

## Tương thích dữ liệu cũ
- Mã số thuế: đọc thêm `customerTaxCode`, `taxNumber`, `vatNumber`, `vatCode`, `mst`.
- Địa chỉ hóa đơn: đọc thêm `customerTaxInvoiceAddress`, `invoiceAddress`, `vatInvoiceAddress`, `billingAddress`.
- Import bằng mẫu cũ không chứa hai cột mới sẽ không xóa thông tin thuế đang có.
- Request cập nhật từ client cũ không chứa hai field mới cũng không xóa dữ liệu đang có.

## Thứ tự ưu tiên khi xuất VAT
1. Snapshot thuế riêng trên đơn, nếu có.
2. Hồ sơ thuế khách hàng trong collection `customers`.
3. Alias dữ liệu cũ.
4. Địa chỉ giao hàng thông thường chỉ dùng khi không có địa chỉ hóa đơn thuế.

## Không thay đổi
- Công thức tiền hàng, VAT 8%, khuyến mại và đối trừ trả hàng.
- Trạng thái `vatInvoiceRequired`.
- Luồng đơn hàng, công nợ, tồn kho, quỹ và giao hàng.
