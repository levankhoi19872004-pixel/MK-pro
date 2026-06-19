# Hướng dẫn audit và dọn MongoDB index

## Mục tiêu

- Ngừng tự tạo lại index cũ/alias sau mỗi lần khởi động.
- Giữ nguyên index `unique`, TTL và index phục vụ các truy vấn nghiệp vụ chính.
- Chỉ xóa index không dùng sau khi có bằng chứng từ `$indexStats`.
- Không thay đổi dữ liệu nghiệp vụ trong collection.

## Thay đổi chính

- Mongoose `autoIndex` mặc định tắt. Chỉ bật tạm bằng `MONGOOSE_AUTO_INDEX=true` khi thực sự cần.
- `mongoIndexService` quản lý index theo **collection vật lý**, tránh nhiều model alias cùng tạo index trên một collection.
- Policy index được rút gọn, đặc biệt với `orders`, `returnOrders`, `master_orders`, `inventories`, `journals`.
- Công cụ audit mặc định là dry-run; không xóa dữ liệu/index nếu chưa truyền `--write`.

## Quy trình production khuyến nghị

### 1. Deploy mã nguồn mới

Giữ cấu hình:

```env
MONGOOSE_AUTO_INDEX=false
```

Ứng dụng vẫn gọi `ensureMongoIndexes()` để tạo index chuẩn còn thiếu, nhưng không tự xóa index cũ.

### 2. Audit trước khi xóa

```bash
npm run mongo:index-audit
```

Audit riêng collection quan trọng:

```bash
node scripts/audit-mongo-indexes.js --collections=orders,returnOrders,master_orders,inventories,journals
```

Các trạng thái chính:

- `WOULD_DROP`: index đã có bản thay thế tương đương, bị compound index khác bao phủ, trùng hoàn toàn hoặc thuộc collection nghỉ hưu đang rỗng.
- `UNUSED_CANDIDATE`: index không còn trong policy và `$indexStats.ops = 0` đủ thời gian; chỉ là ứng viên, chưa tự xóa.
- `KEEP`: index chuẩn, unique/TTL, đang được sử dụng hoặc chưa đủ bằng chứng.
- `required_unique_replacement_missing`: chưa được xóa vì index unique thay thế chưa tồn tại.

### 3. Xóa nhóm an toàn

Sau khi xem kết quả dry-run và có backup:

```bash
npm run mongo:index-cleanup
```

Lệnh này **không xóa** index chỉ vì tên cũ hoặc `ops = 0`; index vẫn có lượt dùng sẽ được giữ.

### 4. Quan sát tối thiểu 7 ngày

Sau một chu kỳ vận hành đầy đủ, chạy lại:

```bash
npm run mongo:index-audit
```

Chỉ khi chắc chắn traffic trong thời gian quan sát có đủ các luồng ngày/tháng/import/báo cáo mới chạy:

```bash
npm run mongo:index-cleanup:unused
```

Lệnh trên yêu cầu index có `ops = 0` và thời gian quan sát tối thiểu 168 giờ.

## Rollback

Nếu truy vấn chậm sau khi xóa index:

1. Xác định query bằng MongoDB profiler/Atlas Performance Advisor.
2. Khôi phục index cần thiết bằng `createIndex()` hoặc bổ sung lại vào `INDEX_DEFINITIONS`.
3. Không bật lại `MONGOOSE_AUTO_INDEX=true` trên production như một cách rollback chung, vì có thể tái tạo toàn bộ index schema cũ.

## Lưu ý

- `$indexStats` được reset khi MongoDB process restart/primary election; cần kiểm tra thời điểm `since` trước khi coi `ops = 0` là bằng chứng.
- Index `unique`/TTL trên collection có dữ liệu không được tự động xóa bởi cleanup mặc định.
- Collection nghỉ hưu chỉ được dọn toàn bộ index ngoài `_id_` khi `documentCount = 0`.
- Công cụ không drop collection và không sửa document.
