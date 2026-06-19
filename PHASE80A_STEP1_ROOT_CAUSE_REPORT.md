# PHASE80A - Bước 1: Phân tích nguyên nhân gốc

## Hiện tượng

Render dừng khi chạy `npm start` với lỗi:

```text
Error: Cannot find module '../services/AuditService'
Require stack:
- src/application/CommandPipeline.js
```

## Nguyên nhân gốc

Source Phase80 chứa đồng thời hai file chỉ khác chữ hoa/thường:

```text
src/services/AuditService.js
src/services/auditService.js
```

`CommandPipeline.js` tham chiếu file chữ hoa trong khi các luồng legacy tham chiếu file chữ thường. Git client hoặc filesystem không phân biệt hoa/thường có thể chỉ lưu một file. Render chạy Linux phân biệt hoa/thường nên đường dẫn chữ hoa bị thiếu khi khởi động.

## Phân loại

- Mức độ: Critical - chặn hoàn toàn startup.
- Loại lỗi: Case-collision / cross-platform path portability.
- Không liên quan: MongoDB, Node.js 20.20.2, feature flag hoặc dữ liệu production.
- Vùng ảnh hưởng trực tiếp: Command pipeline và mọi route nạp `MobileSyncService`.
