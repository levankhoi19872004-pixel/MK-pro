# Phase 66 - Báo cáo hàng thiếu khi import

- Tự động lưu báo cáo hàng thiếu sau khi commit đơn bán DMS có cắt tồn.
- Báo cáo tồn tại độc lập với import_sessions TTL trong collection `import_shortage_reports`.
- Theo dõi mã đơn, khách hàng, mã/tên sản phẩm, số lượng yêu cầu, tồn tại thời điểm import, số lượng thiếu và giá trị cắt.
- Hỗ trợ trạng thái báo cáo: chưa đối soát, đang đối soát, đã xử lý.
- Hỗ trợ trạng thái từng dòng: chưa kiểm tra, đã kiểm tra, đã xử lý; có ghi chú từng dòng và ghi chú chung.
- Có danh sách lịch sử, tìm kiếm, lọc trạng thái, xem chi tiết và tải CSV.
- API:
  - GET `/api/import/shortage-reports`
  - GET `/api/import/shortage-reports/:id`
  - PATCH `/api/import/shortage-reports/:id`
- Sau deploy chạy `npm run mongo:indexes`.
- Regression: 587/587 test pass; syntax: 663 file pass.
