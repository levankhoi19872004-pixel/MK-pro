# Phase 77 - Chuẩn hóa dóng thẳng tiêu đề và cột dữ liệu

## Phạm vi
- Chỉ thay đổi lớp hiển thị web: HTML, CSS và JavaScript phía trình duyệt.
- Không thay đổi API, MongoDB, tính tồn kho, công nợ, quỹ, đơn hàng hay báo cáo.
- Không thay đổi mẫu in và lưới Excel tương tác.

## Nguyên nhân gốc
1. Quy tắc căn cột nằm rải rác ở nhiều CSS và nhiều màn hình dùng `nth-child` riêng.
2. Nhiều ô số có `text-align:right` nhưng tiêu đề tương ứng vẫn căn trái.
3. Báo cáo động chỉ căn phải nội dung `<span>`, không gắn kiểu căn cho `<th>`.
4. Bảng được cập nhật bằng `innerHTML` sau khi tải dữ liệu nên CSS tĩnh không đủ để phân loại mọi cột.
5. Thanh thêm sản phẩm của đơn bán có 6 phần tử nhưng chỉ khai báo 5 grid track.
6. Placeholder bảng tài khoản khai báo `colspan=8` trong khi bảng chỉ có 7 cột.

## Giải pháp
- Thêm `public/js/ui/table-alignment.js`: phân loại cột theo tiêu đề và áp cùng lớp căn cho TH/TD; theo dõi các dòng sinh động bằng `MutationObserver`.
- Thêm `public/css/99-table-alignment.css`: hợp đồng căn trái/giữa/phải thống nhất, số dùng tabular numerals.
- Báo cáo động gắn lớp alignment trực tiếp theo `column.type`.
- Khoanh vùng các grid giả lập bảng: bán hàng, đơn tổng, đơn trả, giao hàng.
- Loại trừ lưới Excel, bảng sản phẩm responsive và bảng in để tránh side effect.

## Kiểm thử
- Static regression test kiểm tra thứ tự load CSS/JS.
- Kiểm tra TH/TD báo cáo nhận cùng alignment type.
- Kiểm tra MutationObserver và danh sách loại trừ.
- Kiểm tra lỗi 6 control/5 grid track và colspan tài khoản.
