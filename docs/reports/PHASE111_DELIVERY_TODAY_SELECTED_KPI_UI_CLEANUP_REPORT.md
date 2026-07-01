# PHASE111 — Delivery Today New Selected KPI UI Cleanup

## Mục tiêu

Tinh gọn màn **Đơn giao hôm nay (New)**:

- Bỏ dòng KPI trung gian trong khối `NVBH thuộc NVGH`.
- Bỏ nút `Chọn tất cả / Bỏ chọn tất cả` khỏi khối NVBH.
- Dùng cụm KPI phía trên làm nguồn tổng duy nhất theo NVBH đang tick chọn.
- Đổi nhãn viết tắt ở header bảng đơn sang nhãn đầy đủ trên desktop.

## File đã kiểm tra / chỉnh sửa

| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Sửa render khối NVBH, cập nhật KPI theo selected NVBH, đổi label header bảng đơn, cập nhật CSS grid |
| `test/delivery-today-new-salesman-group-ui-static.test.js` | Cập nhật static guard cho UI mới |
| `test/phase91-new-services-contract.test.js` | Cập nhật guard không còn dòng KPI trung gian |
| `RELEASE_MANIFEST.json` | Cập nhật hash release |

## Nguyên nhân UI cũ bị rối

Khối NVBH đang hiển thị thêm dòng tổng:

```text
Tổng theo NVBH đã chọn: ... PT ... TM ... CK ... TH ... HT ... CN ...
```

Trong khi phía trên màn đã có cụm KPI tổng. Hai nguồn tổng cùng hiển thị làm người dùng khó xác định đâu là KPI chính. Ngoài ra nút `Chọn tất cả / Bỏ chọn tất cả` trong block NVBH tạo thêm cụm thao tác không cần thiết vì người dùng có thể tick trực tiếp từng NVBH.

## Layout mới

Khối NVBH giờ chỉ còn:

- Tiêu đề `NVBH thuộc NVGH ...`
- Danh sách NVBH
- Checkbox từng NVBH
- Số đơn và số liệu riêng từng NVBH

Đã bỏ:

- Dòng `Tổng theo NVBH đã chọn...`
- Nút `Chọn tất cả`
- Nút `Bỏ chọn tất cả`

## KPI phía trên là tổng duy nhất

Thêm helper:

```js
updateTopKpisFromSelectedSalesmen()
```

Khi tick/bỏ tick NVBH, hệ thống gọi:

```js
applySummary(summarizeVisibleRows(getVisibleRowsBySelectedSalesmen()))
```

Vì vậy cụm KPI phía trên phản ánh đúng phạm vi NVBH đang tick chọn.

## Nhãn đầy đủ

Header bảng danh sách đơn đã đổi từ:

```text
PT / TM / CK / TH / HT / CN
```

thành:

```text
Phải thu / Tiền mặt / Chuyển khoản / Trả thưởng / Hàng trả / Còn nợ
```

Dòng NVBH cũng đổi nhãn tương ứng sang dạng đầy đủ.

## Test đã chạy

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
```

Kết quả:

```text
58 pass
0 fail
```

```text
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1183 JavaScript files
```

```text
npm run release:manifest
npm run check:release-manifest
```

Kết quả:

```text
RELEASE_MANIFEST_OK 2026-07-01-01
```

`npm run check:source-bundles` chưa chạy được trong sandbox vì thiếu dependency `terser`.

## Cách tự kiểm tra UI

1. Mở `Đơn giao hôm nay (New)`.
2. Tìm theo NVGH, ví dụ `ghtp`.
3. Kiểm tra block `NVBH thuộc NVGH` không còn dòng `Tổng theo NVBH đã chọn`.
4. Kiểm tra block NVBH không còn nút `Chọn tất cả / Bỏ chọn tất cả`.
5. Tick/bỏ tick từng NVBH.
6. Kiểm tra KPI phía trên thay đổi theo NVBH được tick.
7. Kiểm tra header bảng đơn hiển thị nhãn đầy đủ: `Phải thu`, `Tiền mặt`, `Chuyển khoản`, `Trả thưởng`, `Hàng trả`, `Còn nợ`.

## Rủi ro còn lại

- Các nút chọn tất cả/bỏ chọn trong **danh sách đơn** vẫn được giữ nguyên vì phục vụ chọn đơn để chốt sổ, không liên quan tới block NVBH.
- Trên màn hình nhỏ, bảng đơn có thể scroll ngang do dùng nhãn đầy đủ; đây là chủ ý để không làm dính cột hoặc sai layout.
