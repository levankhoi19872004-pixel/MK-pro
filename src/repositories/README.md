# Repositories

Repository là tầng truy cập dữ liệu:
- ưu tiên Mongo repository/snapshot; không dùng `readData/writeData` cho nghiệp vụ chính
- về sau có thể thay bằng Mongo model trực tiếp mà không cần sửa controller/route

Quy tắc: service gọi repository, route/controller không gọi database trực tiếp.
