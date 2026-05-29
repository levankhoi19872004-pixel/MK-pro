# V45 Mongo cleanup notes

Trạng thái hiện tại sau bước này:

- `server.js` chỉ khởi động server.
- Route nghiệp vụ đã được tách ra trước `legacyApp` để giữ tương thích API cũ.
- Đã thêm helper dùng chung:
  - `src/utils/identity.util.js`: thống nhất filter id/code/_id/username.
  - `src/utils/httpError.js`: lỗi nghiệp vụ có status rõ ràng.
  - `src/utils/transaction.util.js`: wrapper Mongo transaction cho nghiệp vụ quan trọng.
  - `src/middlewares/asyncHandler.js`, `errorHandler.js`, `validate.js`.
- `userRepository` không còn gọi `MongoStore` trực tiếp; đã dùng model riêng `Staff`, `Role`, `Permission`.

Việc chưa nên xóa ngay:

- `data/kho-data.json` vẫn giữ làm dữ liệu mẫu/fallback.
- `legacyApp.js` vẫn giữ fallback để tránh vỡ các API chưa bóc hết.

Bước tiếp theo nên làm:

1. Chuyển từng service quan trọng sang transaction:
   - tạo đơn bán + trừ tồn + ghi công nợ
   - trả hàng + nhập lại tồn + giảm công nợ
   - thu tiền + cashbook/bankbook + giảm công nợ
2. Tách tiếp auth/import/print khỏi `legacyApp.js`.
3. Sau khi route mới chạy ổn, xóa từng API trùng trong `legacyApp.js`.
