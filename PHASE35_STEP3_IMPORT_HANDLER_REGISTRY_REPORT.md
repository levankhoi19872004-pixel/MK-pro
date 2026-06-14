# PHASE 35 - Bước 3: Import Handler Registry

## Đã thực hiện
- Thêm `ImportHandlerRegistry` và `ImportCommitOrchestrator`.
- Mỗi loại import có một handler riêng, cùng contract `commit(rows, context)`.
- Xóa chuỗi `if/else` dispatch khỏi `excelImportService.commit()`.
- Giữ nguyên các writer hiện hữu làm operation implementation để không làm thay đổi transaction/data behavior trong cùng một bước.
- Handler `salesOrders` tự áp dụng `autoCutStock: true`.

## Lợi ích
- Thêm loại import không còn phải sửa nhánh trung tâm.
- Có thể di chuyển từng writer sang file riêng ở bước sau mà không đổi orchestrator/controller.
- Registry trả danh sách supported types rõ ràng và chặn type không hợp lệ.

## Bước tiếp theo
Tách `masterOrderLegacy.service.js` bằng facade/Strangler Pattern: query, command, delivery-today, accounting và return projection.
