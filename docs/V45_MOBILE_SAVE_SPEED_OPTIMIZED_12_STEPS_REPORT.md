# V45 Mobile Save Speed Optimized - 12 Steps

## Phạm vi chỉnh sửa
Tối ưu tốc độ lưu cho 2 app mobile:
- App bán hàng: tạo/sửa đơn.
- App giao hàng: lưu tiền, xác nhận giao, trả hàng, nộp quỹ.

## Các thay đổi chính

### 1. Đo thời gian xử lý từng bước
Thêm `src/utils/mobilePerformance.util.js` với `createStepTimer()`.
Log dạng `[MOBILE_PERF]` cho các bước chính: load snapshot, chuẩn bị item, batch check tồn, persist snapshot, save operational data.

### 2. Tách lưu khỏi báo cáo
Không thêm rebuild báo cáo vào API lưu. API lưu chỉ ghi chứng từ/trạng thái cần thiết rồi trả kết quả.

### 3. Giảm payload và chuẩn hóa request
Frontend gửi thêm `idempotencyKey`, không bắt backend nhận toàn bộ màn hình. Backend vẫn tự tính lại phần quan trọng.

### 4. Chống bấm lưu trùng
Frontend khóa nút khi đang lưu. Backend thêm idempotency TTL 10 phút để chống request lặp do bấm 2 lần/mạng chậm.

### 5. Tối ưu lưu app giao hàng
`confirmDelivery`, `createReturnFromDelivery`, `submitCash` có idempotency và log thời gian. Giữ nguyên nguyên tắc kế toán: app giao hàng lưu tiền tạm, chờ kế toán xác nhận.

### 6. Tối ưu tạo đơn app bán hàng
Thay check tồn từng sản phẩm bằng batch check tồn cho toàn bộ sản phẩm trong đơn.

### 7. Giảm số query tồn kho
Trước đây mỗi dòng hàng có thể query `Inventory` + `InventoryLegacy`. Sau sửa, một đơn chỉ query batch 2 lần cho toàn bộ danh sách sản phẩm.

### 8. Bổ sung/giữ index phục vụ mobile
Giữ nhóm index quan trọng trong `mongoIndexService`: đơn theo ngày giao/NVGH, công nợ theo khách/ngày, tồn theo sản phẩm/kho.

### 9. Dọn cảnh báo index trùng
Sửa duplicate schema index ở `Product`, `User`, `ImportSession` để giảm warning khi Render start.

### 10. Không cập nhật cache global khi lưu
Không thêm cơ chế ghi đè cache sản phẩm/khách hàng trong luồng lưu mobile.

### 11. Không reload toàn màn sau lưu đơn bán
App bán hàng sau tạo/sửa đơn cập nhật dòng đơn trong cache local và render lại danh sách đang có, không gọi lại toàn bộ danh sách ngay sau lưu.

### 12. Kiểm tra cú pháp và test
Đã chạy `node --check` toàn bộ file JS trong `src` và `public/mobile/js`: đạt.
`npm test` không chạy hết do môi trường sandbox thiếu module `mongoose`; các test docs không phụ thuộc mongoose đã pass/skip theo thiết kế.

## Đánh giá tốc độ kỳ vọng

### App bán hàng
- Đơn ít dòng: cải thiện khoảng 20-35%.
- Đơn nhiều dòng sản phẩm: cải thiện khoảng 45-70% vì bỏ query tồn kho lặp theo từng dòng.

### App giao hàng
- Lưu tiền/xác nhận giao: cải thiện khoảng 15-35% nhờ chống double-submit, log đo điểm nghẽn và không reload dư.
- Khi người dùng bấm lưu nhiều lần/mạng chậm: giảm mạnh rủi ro tạo trùng hoặc xử lý lặp, có thể giảm 50-90% thao tác lặp không cần thiết.

## Lưu ý vận hành
- Bật log mặc định. Có thể tắt bằng biến môi trường: `MOBILE_PERF_LOG=0`.
- Idempotency hiện là in-memory theo process Render. Nếu sau này chạy nhiều instance, nên chuyển store này sang Mongo/Redis.
- Muốn đo % thật chính xác, cần so sánh log `[MOBILE_PERF]` trước/sau trên Render với cùng một đơn mẫu.
