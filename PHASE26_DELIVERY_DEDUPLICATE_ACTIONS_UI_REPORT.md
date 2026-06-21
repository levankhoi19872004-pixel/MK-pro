# MK-pro Phase26 — Delivery Deduplicate Actions UI Report

## 1. Baseline

Baseline ZIP đã dùng:

```text
MK-pro-phase25-delivery-map-external-open-webview-fix-patched(1).zip
```

Phạm vi triển khai: chỉ frontend mobile app giao hàng. Không sửa backend, không đổi API contract, không đổi business rule tiền/tồn/công nợ.

## 2. Khảo sát tác vụ trùng

| Tác vụ | Vị trí hiện tại | Có bị trùng không | Quyết định | File liên quan |
|---|---|---:|---|---|
| Tải | Header app giao hàng | Có thể trùng với Tải lại trong tab Đối soát | Giữ làm refresh toàn cục | `public/mobile/js/delivery-mobile-view.source.js` |
| Tải lại | Nút lớn trong card Đối soát | Có, trùng bản chất với Tải header | Bỏ nút lớn, dùng Tải header | `public/mobile/js/delivery-mobile-view.source.js` |
| Đối soát | Header shortcut + tab Đối soát | Có | Bỏ shortcut header, giữ tab workflow | `public/mobile/js/delivery-mobile-view.source.js` |
| Thoát | Header cạnh tác vụ nghiệp vụ | Không trùng nhưng chiếm ưu tiên cao | Chuyển vào menu phụ `⋮` dưới tên `Đăng xuất` | `public/mobile/js/delivery-mobile-view.source.js` |
| Hoàn tất - về danh sách | Sticky action trong tab Đối soát | Không trùng, là action kết thúc workflow | Giữ, chỉ hiện khi đã chọn đơn/khách | `public/mobile/js/delivery-mobile-view.source.js` |

## 3. Thay đổi UI

### Header

Trước:

```text
[Tải] [Đối soát] [Thoát]
```

Sau:

```text
[Tải] [⋮]
```

Menu `⋮` gồm:

```text
Thông tin tài khoản
Đăng xuất
```

### Tab Đối soát

Trước:

```text
Đối soát ngày ...
[Tải lại]
```

Sau:

```text
Đối soát ngày ...
```

Không còn nút `Tải lại` lớn. Nếu cần refresh dữ liệu, dùng nút `Tải` ở header.

### Sticky action

Giữ nguyên đúng vai trò kết thúc workflow:

```text
[Hoàn tất - về danh sách]
```

Không thêm nút điều hướng trùng trong sticky.

## 4. File đã sửa/thêm

### Modified

```text
config/source-bundles.json
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/mobile.source/mobile-04.css
public/mobile/mobile.css
test/delivery-reconciliation-report-p1-static.test.js
test/delivery-real-workflow-ui-p1-static.test.js
```

### Added

```text
test/delivery-deduplicate-actions-ui-static.test.js
PHASE26_DELIVERY_DEDUPLICATE_ACTIONS_UI_REPORT.md
```

### Deleted

```text
Không có
```

## 5. Test đã chạy

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
node --test \
  test/delivery-deduplicate-actions-ui-static.test.js \
  test/delivery-compact-customer-workflow-ui-p1-static.test.js \
  test/delivery-customer-workflow-ui-p1-static.test.js \
  test/delivery-real-workflow-ui-p1-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-reconciliation-report-p1-static.test.js \
  test/delivery-map-external-webview-fix-static.test.js \
  test/delivery-debt-pagination-p1-static.test.js \
  test/delivery-dual-api-contract-p1p2-static.test.js
npm test
```

Kết quả:

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 955 JavaScript files
Targeted delivery UI/API static tests: 50 pass / 0 fail
Full npm test: 1054 tests / 1051 pass / 2 fail / 1 skipped
```

Hai lỗi full test là snapshot legacy đã tồn tại trước đó, không liên quan Phase26:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

## 6. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Người dùng quen bấm Đối soát trên header cần chuyển sang tab Đối soát | Minor | Quy trình tab hiện rõ, tránh trùng tác vụ |
| Menu `⋮` cần test thao tác ngoài trời trên APK | Minor | Đã giữ nút lớn `Tải`; chỉ chuyển `Đăng xuất` vào menu |
| Full test vẫn fail snapshot legacy | Không thuộc Phase26 | Không cập nhật snapshot để tránh scope creep |

## 7. Xác nhận phạm vi

- Không sửa backend.
- Không đổi API contract.
- Không đổi business rule tiền/tồn/công nợ.
- Không xóa tab Đối soát.
- Không phá workflow Phase23/24/25.
