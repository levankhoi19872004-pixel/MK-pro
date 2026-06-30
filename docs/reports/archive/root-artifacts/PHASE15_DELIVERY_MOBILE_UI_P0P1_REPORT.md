# PHASE15 — P0/P1 Mobile Delivery UI/UX Quick Fix Report

## 1. Baseline

- Baseline thực tế đã dùng: `MK-pro-phase14-delivery-money-inventory-debt-flow-patched(1).zip`
- Phạm vi: chỉ UI app giao hàng mobile, không sửa backend/API/business rule.

## 2. Tổng quan dự án liên quan

- App giao hàng mobile render bởi `public/mobile/delivery.html`.
- View chính nằm ở `public/mobile/js/delivery-mobile-view.source.js` và build ra `public/mobile/js/delivery-mobile-view.js`.
- CSS mobile được ghép từ `public/mobile/mobile.source/mobile-01.css`, `mobile-02.css`, `mobile-03.css` ra `public/mobile/mobile.css`.
- Source bundle được kiểm soát hash trong `config/source-bundles.json`.

## 3. Vấn đề UI/UX đã xác nhận

| Nhóm | Tình trạng trước vá | Mức độ |
|---|---|---|
| KPI | Dùng viết tắt `PT/TM/CK/TH/HT/CN`, khó hiểu khi dùng ngoài đường | P1 |
| Card đơn giao | Ưu tiên mã đơn hơn tên khách, thiếu địa chỉ/SĐT/ghi chú/NVBH dù dữ liệu có thể có sẵn | P1 |
| Thao tác nhanh | Chưa có gọi nhanh, copy địa chỉ, mở bản đồ từ card | P1 |
| Nút hành động | `Lưu thu tiền` thực tế có xác nhận giao nhưng label chưa nói rõ; `Bỏ qua hàng trả` có thể ghi returnQty=0 nhưng chưa confirm | P0/P1 |
| Responsive | Touch target chưa được khóa rõ >=44px; layout KPI/card chưa tối ưu riêng 360/390/412/768 | P1 |
| Error state | API lỗi có message nhưng thiếu nút thử lại trực tiếp ở một số luồng | P1 |

## 4. Nội dung đã sửa

### 4.1 KPI dễ hiểu hơn

Đổi nhãn hiển thị:

- `PT` → `Phải thu`
- `TM` → `Tiền mặt`
- `CK` → `Chuyển khoản`
- `TH` → `Trả hàng`
- `CN` → `Công nợ`
- `HT` được giữ đúng nghĩa dữ liệu hiện tại là `Trả thưởng`, không đổi thành “Hoàn tất” để tránh sai nghĩa vì code đang bind KPI này với `amounts.reward`.

### 4.2 Card đơn giao ưu tiên thông tin ngoài đường

Card mới ưu tiên:

- Tên khách hàng
- Mã đơn
- Trạng thái giao hàng
- Địa chỉ nếu có
- Số điện thoại nếu có
- NVBH nếu có
- Ghi chú giao hàng nếu có
- Tiền phải thu/tiền mặt/chuyển khoản/trả hàng/trả thưởng/công nợ

### 4.3 Thêm thao tác nhanh không phát sinh API

Nếu dữ liệu có sẵn trong response hiện tại:

- `Gọi` dùng `tel:`
- `Copy địa chỉ` dùng Clipboard API/fallback `execCommand`
- `Bản đồ` mở Google Maps search theo địa chỉ

Không thêm API mới, không đổi contract backend.

### 4.4 Nút hành động an toàn hơn

- Button thu tiền đổi thành: `Lưu thu tiền & xác nhận giao` để đúng hành vi thực tế.
- Button này dùng class `m-confirm` để nổi bật hơn.
- `Bỏ qua hàng trả` giờ có xác nhận trước khi ghi số lượng trả về 0.

### 4.5 Loading/error/empty state

- Lỗi tải dữ liệu giao hàng có nút `Thử lại`.
- Lỗi tải công nợ có nút `Thử lại`.
- Empty state cũ được giữ, CSS mới làm rõ hơn.

### 4.6 Responsive/touch target

Bổ sung CSS đảm bảo:

- Nút/input/select có touch target tối thiểu 44px.
- Action chính >=48px.
- Breakpoint rõ cho 360px, 390px, 412px, 768px.
- KPI co giãn 2/3/6 cột theo màn hình.
- Card dùng layout không phụ thuộc bảng rộng, giảm nguy cơ scroll ngang.

## 5. File đã sửa/thêm

### Modified

```text
config/source-bundles.json
public/mobile/delivery.html
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/mobile.source/mobile-03.css
```

### Added

```text
test/delivery-mobile-ui-p0p1-static.test.js
```

### Deleted

```text
Không có
```

## 6. Không thay đổi

- Không sửa backend.
- Không sửa API contract.
- Không sửa AR/Fund/Inventory.
- Không sửa business rule giao hàng.
- Không thêm GPS/push/offline/tính năng phức tạp.
- Không sửa web desktop.

## 7. Test đã chạy

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/build-source-bundles.js --refresh-hashes --target=public/mobile/js/delivery-mobile-view.js
node scripts/build-source-bundles.js --refresh-hashes --target=public/mobile/mobile.css
npm run check:source-bundles
npm run check:syntax
node --test test/delivery-mobile-ui-p0p1-static.test.js
```

Kết quả:

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 940 JavaScript files
# tests 5
# pass 5
# fail 0
```

## 8. Rủi ro còn lại

| Rủi ro | Ghi chú |
|---|---|
| Dữ liệu địa chỉ/SĐT/ghi chú/NVBH phụ thuộc API hiện tại | Nếu backend không trả trường đó thì UI tự ẩn, không lỗi |
| Chưa có kiểm thử browser bằng thiết bị thật | Đã có static check CSS breakpoint/touch target; vẫn nên mở thử trên 360/390/412 ngoài đời |
| Nhãn `Trả thưởng` thay vì `Hoàn tất` | Đây là lựa chọn an toàn vì KPI đang đọc `amounts.reward`; đổi sang “Hoàn tất” sẽ gây hiểu sai số tiền |

## 9. Khuyến nghị tiếp theo

### Phương án A — Production-grade dài hạn

- Thiết kế lại app giao hàng theo field workflow: danh sách tuyến → chi tiết khách → trả hàng/thu tiền → xác nhận.
- Có design token mobile riêng, accessibility audit, browser/device smoke test tự động.
- Effort: Hard.
- Lợi ích: bền vững, dễ đào tạo NVGH, ít bấm nhầm.
- Rủi ro: cần kiểm thử nghiệp vụ nhiều hơn.

### Phương án B — Cân bằng effort, phù hợp chạy thử nội bộ

- Giữ layout hiện tại, tiếp tục vá từng điểm đau: sticky action bar, trạng thái đơn rõ hơn, modal xác nhận cuối trước khi giao.
- Effort: Medium.
- Lợi ích: nhanh, ít rủi ro lan rộng.
- Rủi ro: app vẫn còn nợ kỹ thuật frontend cũ.

Bản vá lần này đang đi theo Phương án B để phù hợp mục tiêu “cải thiện nhanh để chạy thử nội bộ”.
