# V45 API Monitor toàn hệ thống

## Đã thêm

1. Middleware đo toàn bộ API `/api/*`:
   - File: `src/middlewares/apiMonitor.middleware.js`
   - Đo: thời gian phản hồi, số dòng trả về, status code, module, số lần gọi, trung bình, max, số lần chậm.
   - Tự ghi log `[API_PERF]` và `[API_SLOW]` khi API > 1000ms hoặc lỗi 5xx.

2. API đọc thống kê ngay trên phần mềm:
   - `GET /api/system/api-monitor?limit=200`
   - `GET /api/system/api-monitor?slowOnly=1`
   - `POST /api/system/api-monitor/reset`

3. Giao diện trong tab Hệ thống:
   - Bảng API Monitor toàn phần mềm.
   - Bảng báo cáo API chạy chậm gần nhất.
   - Bộ lọc tất cả/chỉ API chậm.
   - Nút xóa thống kê để đo lại từ đầu.

## File đã sửa

- `src/app.js`
- `src/middlewares/apiMonitor.middleware.js`
- `src/services/systemService.js`
- `src/controllers/systemController.js`
- `src/routes/systemRoutes.js`
- `public/index.html`
- `public/js/app/00-dom-state.js`
- `public/js/app/09-system.js`
- `public/app.js`
- `public/style.css`

## Cách dùng

1. Mở phần mềm.
2. Vào từng màn và thao tác bình thường.
3. Vào `Hệ thống -> API Monitor toàn phần mềm`.
4. Xem API nào chậm nhất, API nào gọi nhiều nhất, API nào trả nhiều dòng.

## Quy tắc đánh giá

- `< 300ms`: tốt.
- `300ms - 1000ms`: cần theo dõi.
- `> 1000ms`: API chậm, cần tối ưu.
- API danh sách trả quá 100 dòng cần kiểm tra phân trang.
