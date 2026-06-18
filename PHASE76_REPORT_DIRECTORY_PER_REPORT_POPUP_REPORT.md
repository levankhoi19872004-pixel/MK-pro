# PHASE 76 — Danh sách báo cáo ngoài màn hình, từng báo cáo mở popup

## Yêu cầu hiệu chỉnh

Danh sách báo cáo phải luôn hiển thị tại tab Báo cáo. Mỗi báo cáo có nút **Xem báo cáo**; chỉ khi bấm nút này mới mở popup chi tiết.

## Thay đổi

- Loại bỏ launcher “Mở trung tâm báo cáo”.
- Đưa danh mục báo cáo ra cửa sổ chính, nhóm theo nghiệp vụ.
- Mỗi thẻ báo cáo có nút `Xem báo cáo` riêng.
- Popup chỉ chứa báo cáo đang chọn, bộ lọc, KPI, biểu đồ, bảng và xuất Excel.
- Khi vào tab Báo cáo chỉ gọi API catalog; không tự mở popup và không chạy báo cáo mặc định.
- Giữ báo cáo `rewards-by-customer` và toàn bộ quyền/nguồn dữ liệu Phase 75.
- Giữ kho mẫu Excel ở cửa sổ chính dưới dạng khối thu gọn.

## Vùng ảnh hưởng

- `public/index.html`
- `public/js/app/admin/08a-reports.js`
- `public/js/bootstrap/03-tab-loader.js`
- `public/css/95-report-center-popup.css`
- `test/report-center-popup-reward.test.js`

Không thay đổi API, schema MongoDB, công thức báo cáo hoặc dữ liệu nguồn.
