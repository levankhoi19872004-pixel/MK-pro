# PHASE207 - DMS Gap Simulator UI Fragment Fix

## Lỗi thực tế

Khi bấm menu `Công cụ: Sinh đơn chấm DMS`, sidebar active nhưng vùng nội dung bên phải trống.

## Nguyên nhân

Phase206 đã thêm fragment `public/fragments/index/06b-dms-gap-simulator.html` vào sau `public/fragments/index/06-index-body.html` trong `config/index-page-fragments.json`.

Tuy nhiên `06-index-body.html` không kết thúc ở ranh giới tab độc lập. File này đã mở phần đầu của `systemTab`, còn `07-index-body.html` mới đóng tiếp phần còn lại của `systemTab`.

Vì vậy fragment `06b-dms-gap-simulator.html` bị ghép vào bên trong `systemTab` thay vì là một tab top-level. Khi `dmsGapSimulatorTab` được active, section này vẫn nằm dưới parent `systemTab` không active nên bị CSS ẩn, dẫn đến màn trắng.

## Cách sửa

Tách lại ranh giới fragment:

1. Giữ `public/fragments/index/06-index-body.html` kết thúc ngay sau `orderSplitToolTab`.
2. Giữ `public/fragments/index/06b-dms-gap-simulator.html` là tab top-level riêng.
3. Tạo mới `public/fragments/index/06c-system-start.html` chứa phần mở đầu của `systemTab`.
4. Sửa `config/index-page-fragments.json` để thứ tự ghép đúng:

```txt
06-index-body.html
06b-dms-gap-simulator.html
06c-system-start.html
07-index-body.html
```

Như vậy tab `dmsGapSimulatorTab` nằm độc lập cùng cấp với các tab khác, không còn bị lồng trong `systemTab`.

## File đã sửa/thêm

- `public/fragments/index/06-index-body.html`
- `public/fragments/index/06b-dms-gap-simulator.html`
- `public/fragments/index/06c-system-start.html`
- `config/index-page-fragments.json`
- `PHASE207_DMS_GAP_SIMULATOR_UI_FRAGMENT_FIX_REPORT.md`

## Kiểm tra

Đã kiểm tra static:

```txt
dmsGapSimulatorTab count = 1
systemTab count = 1
dmsGapSimulatorTab xuất hiện trước systemTab = true
```

Đã chạy:

```txt
npm run check:source-size
npm run check:syntax
```

Kết quả:

```txt
[source-size-budget] OK
SYNTAX_OK 1327 JavaScript files
```

## Phạm vi an toàn

Bản sửa chỉ chỉnh ranh giới fragment UI. Không sửa nghiệp vụ đơn hàng, tồn kho, công nợ, khuyến mại thật, báo cáo hoặc API backend.
