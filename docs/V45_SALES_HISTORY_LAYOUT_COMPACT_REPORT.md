# V45 - Báo cáo chỉnh sửa bố cục Lịch sử đơn bán

## Mục tiêu
Chuẩn hóa phần **Bán hàng → Lịch sử đơn bán** theo dạng bảng ERP 1 dòng, dễ đọc, đủ cột, giảm khoảng trắng và tránh nhầm ngày bán/ngày giao.

## Nội dung đã hoàn thành

### 1. Thêm header cố định cho danh sách đơn
Đã thêm hàng tiêu đề:

- Mã đơn
- Khách hàng
- Ngày bán
- Ngày giao
- Giá trị
- Nguồn
- Trạng thái
- Thao tác

File chỉnh:

```text
public/index.html
```

### 2. Đổi render đơn bán sang row compact
Đã thay card lịch sử đơn bán bằng dòng compact:

```text
☑ | Mã đơn | Khách hàng | Ngày bán | Ngày giao | Giá trị | Nguồn | Trạng thái | Sửa/Xóa
```

File chỉnh:

```text
public/js/app/05-sales-orders.js
```

### 3. Thêm KPI ngay trên lịch sử
Thay `92 / 92 đơn bán` bằng thông tin có giá trị hơn:

```text
92 đơn · Tổng doanh số · Đã giao · Chưa giao
```

### 4. Chuẩn hóa badge nguồn đơn
Đã hỗ trợ các nguồn:

```text
DMS
S3
APP
Thủ công
```

Mỗi nguồn có badge màu riêng.

### 5. Chuẩn hóa badge trạng thái vòng đời
Đã đổi trạng thái dài bị cắt chữ thành badge ngắn:

```text
Chờ gộp
Đã gộp
Đã giao
Đã CN
Đã hủy
```

### 6. Căn lại nút thao tác
Nút `Sửa` / `Xóa` được đưa về cuối dòng, không còn chen vào phần trạng thái.

### 7. Cải thiện CSS responsive
Trên màn nhỏ, danh sách tự co lại theo grid nhiều dòng, không làm vỡ bố cục.

File chỉnh:

```text
public/style.css
```

## Kiểm tra đã chạy

```text
node --check public/js/app/05-sales-orders.js: OK
node --check server.js: OK
```

`npm test` trong sandbox không chạy đủ do thiếu dependency `mongoose` trong môi trường kiểm tra hiện tại. Test static `delivery 6-metrics` vẫn OK. Trên máy anh có `node_modules` đầy đủ thì có thể chạy lại `npm test`.

## Ghi chú nghiệp vụ
Phần này chỉ thay đổi giao diện và render lịch sử đơn bán, không thay đổi API, không xóa dữ liệu, không ảnh hưởng vòng đời đơn hàng đã chuẩn hóa trước đó.
