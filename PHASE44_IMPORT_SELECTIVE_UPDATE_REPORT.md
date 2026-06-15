# PHASE44 - IMPORT SELECTIVE UPDATE

## Mục tiêu
Bổ sung chế độ **Cập nhật an toàn dữ liệu hiện có** cho ba danh mục:

- Sản phẩm (`products`).
- Khách hàng (`customers`).
- Tài khoản (`users`).

Chế độ mới không yêu cầu xóa bản ghi cũ rồi import lại.

## Quy tắc cập nhật

1. Nhận diện bản ghi bằng khóa nghiệp vụ:
   - Sản phẩm: `code`.
   - Khách hàng: `code`.
   - Tài khoản: `username`.
2. Chỉ cập nhật bản ghi đã tồn tại; không tự tạo bản ghi mới trong chế độ update.
3. Cột không có trong file hoặc ô để trống: giữ nguyên dữ liệu MongoDB.
4. Giá trị mới giống dữ liệu cũ: không phát sinh lệnh ghi.
5. Giá trị mới khác dữ liệu cũ: preview hiển thị field cũ → field mới trước khi commit.
6. Dòng không có thay đổi được đánh dấu `Không thay đổi` và không được commit.
7. Mật khẩu users để trống: giữ nguyên hash hiện tại; chỉ thay khi file có mật khẩu mới.
8. Giá trị số `0` vẫn được coi là giá trị cập nhật hợp lệ.

## Luồng kỹ thuật

```text
UI chọn Chế độ import
  -> POST /api/import/preview (importMode=create|update)
  -> import_sessions.importMode
  -> async preview worker
  -> so sánh trực tiếp dữ liệu Mongo
  -> lưu danh sách changes vào import_session_rows
  -> POST /api/import/commit
  -> commit lấy mode từ session, không tin mode do client gửi lại
  -> $set đúng các field thay đổi, upsert=false
```

## An toàn dữ liệu

- Không dùng replace document.
- Không `$unset` field cũ trong chế độ update.
- Không cập nhật bằng payload mặc định sinh từ ô trống.
- Không tạo sản phẩm/khách hàng/users mới khi chọn update.
- Không tác động tồn kho, công nợ, đơn bán, giao hàng, trả hàng hoặc quỹ.
- Import session cũ không có `importMode` tự động dùng `create`, không cần migration.

## Preview
Mỗi dòng update trả thêm:

- `action`: `update`, `no_change` hoặc `error`.
- `changeCount`.
- `changes[]`: field, nhãn, giá trị cũ, giá trị mới.
- `canImport=false` đối với dòng không thay đổi.

## Tương thích

- Chế độ `Import thông thường` giữ luồng hiện tại.
- Chế độ update chỉ hiện cho products/customers/users.
- Các loại import chứng từ luôn bị ép về `create`.
- API thay đổi theo hướng additive-only bằng field multipart `importMode`.
