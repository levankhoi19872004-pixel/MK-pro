# PHASE 35 - Bước 5: Tách các service nghiệp vụ còn lại

## Đã thực hiện
- Chuyển 6 entry point lớn thành facade nhỏ: Return Order, Sales Order, Reports, Import/Export, Delivery Engine và Print Data Builder.
- Tách API theo Query / Command / Posting / Accounting / Receiving / Draft Sync / Report Domain / Export Domain.
- Implementation cũ được đổi tên rõ `*.legacy.*`, vẫn là rollback path trong giai đoạn Strangler.
- Tất cả consumer hiện hữu tiếp tục require đúng entry point cũ nên API contract không đổi.

## Ý nghĩa vận hành
- Controller/routes không còn phụ thuộc trực tiếp file implementation hàng nghìn dòng.
- Mỗi thay đổi mới có vị trí đích rõ; có thể di chuyển từng function khỏi legacy mà không đổi consumer.
- Giảm nguy cơ import nhầm toàn bộ domain và tạo điều kiện loại legacy theo từng use case.

## Bước tiếp theo
Tách CSS theo module và giảm trách nhiệm của `public/style.css`; đồng thời chuẩn hóa bootstrap/HTML script ownership.
