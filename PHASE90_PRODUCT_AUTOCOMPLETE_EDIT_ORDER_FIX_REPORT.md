# PHASE90 PRODUCT AUTOCOMPLETE EDIT ORDER FIX REPORT

## 1. Executive Summary

Phase90 xử lý lỗi **Bán hàng → Sửa đơn bán hàng → Thêm sản phẩm**: nhập mã 3-4 ký tự như `0864` nhưng không hiện gợi ý sản phẩm và báo sai `Không tìm thấy sản phẩm phù hợp`.

Kết quả triển khai:

- Đã sửa backend product search để hỗ trợ **partial numeric code/barcode có số 0 đầu**.
- Đã chuẩn hóa response search thêm `success: true` và `data` nhưng vẫn giữ `ok/items/products` để không phá màn cũ.
- Đã làm frontend autocomplete đọc được cả response shape cũ và mới.
- Đã mở rich product renderer cho đúng box `salesProductSuggestions`, không chỉ riêng mobile `productSuggestions`.
- Đã thêm test khoanh vùng cho edit-order product autocomplete.

Final Decision: **GO**.

## 2. Nguyên nhân gốc

Root cause nằm ở `src/repositories/searchRepository.js`.

Luồng autocomplete màn sửa đơn bán hàng dùng:

```text
salesProductSearch
→ configuredAutocomplete.js
→ UnifiedSearchEngine.searchProduct()
→ /api/search/products?q=0864
→ searchController.products()
→ searchService.searchProducts()
→ searchRepository.findProducts()
```

Trong `findProducts()`, backend chạy fast lookup theo exact/prefix trước. Với từ khóa toàn số, code cũ trả kết quả ngay nếu là numeric keyword:

```js
if (indexedMatches.length >= limit || isNumericKeyword(q)) return indexedMatches.slice(0, limit);
```

Vì vậy nếu nhập `0864` mà mã/barcode chỉ **chứa `0864` ở giữa/cuối**, fast lookup không trả dòng nào và backend dừng luôn. Bounded regex scan phía sau không được chạy. Kết quả API trả rỗng nên UI hiện `Không tìm thấy sản phẩm phù hợp`.

## 3. API product search hiện tại

Các endpoint liên quan:

| Endpoint | Vai trò | Kết quả sau sửa |
|---|---|---|
| `/api/search/products` | Unified autocomplete chính | Hỗ trợ partial numeric fragment, giữ số 0 đầu |
| `/api/catalog/products/search` | Catalog autocomplete compatibility | Dùng chung search controller |
| `/api/products/search` | Product route compatibility | Trả thêm `success/data` |
| `/api/products` | Danh sách sản phẩm | Trả thêm `success/data` |

Response mới tương thích hai chiều:

```js
{
  ok: true,
  success: true,
  items: [...],
  products: [...],
  data: [...]
}
```

## 4. Frontend autocomplete hiện tại

Frontend đã được kiểm tra theo các file:

- `public/js/search/searchFieldsConfig.js`
- `public/js/search/configuredAutocomplete.js`
- `public/js/search/unifiedSearchEngine.js`
- `public/js/search/catalogCacheService.js`
- `public/js/search/productSearchBox.js`
- `public/js/search/autocompleteEngine.js`
- `public/fragments/index/02-index-body.html`

Luồng `salesProductSearch` đã bind đúng với:

```js
key: 'salesProduct'
inputId: 'salesProductSearch'
boxId: 'salesProductSuggestions'
source: 'unifiedProducts'
```

Không phát hiện selector sai hoặc listener chỉ gắn cho modal tạo đơn. Modal tạo và modal sửa dùng chung form/input, nên lỗi chính không phải DOM binding mà là backend numeric search dừng quá sớm.

## 5. Files changed

| File | Nội dung thay đổi |
|---|---|
| `src/repositories/searchRepository.js` | Không dừng numeric search sau exact/prefix lookup rỗng; cho fallthrough sang bounded regex scan để match partial `0864` |
| `src/controllers/searchController.js` | Thêm `success: true`, `data: items` |
| `src/controllers/productController.js` | Thêm `success: true`, `data: products` cho list/search |
| `public/js/search/unifiedSearchEngine.js` | Đọc thêm `json.data` |
| `public/js/search/catalogCacheService.js` | Đọc thêm `json.data`, không bắt buộc chỉ `json.ok` |
| `public/js/search/productSearchBox.js` | Đọc thêm `json.data`, không bắt buộc chỉ `json.ok` |
| `public/js/search/autocompleteEngine.js` | Nhận diện `salesProductSuggestions/importProductSuggestions` là product suggestion box để render sản phẩm đúng dạng |
| `test/product-autocomplete-edit-order-search.test.js` | Test mới cho partial code, response shape, frontend binding, async empty state |
| `RELEASE_MANIFEST.json` | Regenerate sau thay đổi source |

## 6. Backend changes

### 6.1 Sửa numeric partial search

Backend vẫn ưu tiên exact/prefix để nhanh, nhưng không còn return rỗng quá sớm khi keyword là số.

Trường hợp `q = 0864`:

1. Chạy exact/prefix lookup.
2. Nếu đủ kết quả thì trả ngay.
3. Nếu không đủ/rỗng thì chạy bounded regex scan trên:
   - `code`
   - `sku`
   - `productCode`
   - `barcode`
   - `name/productName`
   - group/category/brand/packing/unit/baseUnit/searchText
4. Sort theo score, ưu tiên code/barcode.
5. Giữ nguyên string `0864`, không convert sang number.

### 6.2 Chuẩn hóa response contract

Không phá compatibility cũ:

- Cũ vẫn đọc được `ok/items/products`.
- Mới đọc được `success/data`.

## 7. Frontend changes

### 7.1 Robust response parsing

Frontend hiện đọc được:

```js
json.items || json.data || json.products
```

và các compatibility cache đọc:

```js
json.products || json.items || json.data
```

### 7.2 Không báo rỗng trước khi API hoàn tất

`autocompleteEngine.js` vẫn giữ trạng thái:

1. Input đủ ký tự.
2. Nếu `getItems()` là Promise thì hiện `Đang tìm...`.
3. Chỉ render empty text sau khi Promise trả về mảng rỗng.

### 7.3 Rich renderer cho sales edit modal

Trước đây rich renderer chỉ nhận `productSuggestions`. Sau sửa nhận thêm:

- `salesProductSuggestions`
- `importProductSuggestions`

Mục tiêu là dropdown trong popup sửa đơn hiển thị rõ mã, tên, tồn, giá.

## 8. Test added/updated

Thêm file:

```text
test/product-autocomplete-edit-order-search.test.js
```

Test bao phủ:

1. Numeric partial code có số 0 đầu `0864` phải fallthrough sang bounded scan và tìm được sản phẩm.
2. Regex phải giữ `0864`, không thành `864`.
3. Search controller/product controller có `success/data`.
4. Frontend đọc được `items/data/products`.
5. `salesProductSearch` bind đúng vào `/api/search/products`.
6. Không render empty text trước khi API hoàn tất.
7. `salesProductSuggestions` dùng product rich renderer.

## 9. Command results

| Command | Result |
|---|---:|
| `npm run check:syntax` | PASS — `SYNTAX_OK 1161 JavaScript files` |
| `npm test` | PASS — exit 0, tổng hợp TAP: `1384 tests / 1383 pass / 0 fail / 1 skipped` |
| `npm run check:source-bundles` | PASS — `OK 19 bundles` |
| `npm run check:release-manifest` | Lần 1 stale do source thay đổi |
| `npm run release:manifest` | PASS — manifest regenerated |
| `npm run check:release-manifest` | PASS — `RELEASE_MANIFEST_OK 2026-06-30-01` |
| `npm run docs:check` | PASS — OpenAPI up to date, 343 operations |
| `node scripts/audit-global-software-rules.js --strict` | PASS — 0 issues |
| `node scripts/audit-ar-access-violations.js --strict` | PASS — 0 issues |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS — 0 issues |
| `node scripts/audit-fund-access-violations.js --strict` | PASS — 0 issues |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS — 0 issues |

## 10. Risks

| Risk | Mức độ | Kiểm soát |
|---|---:|---|
| Numeric short keyword có thể match nhiều sản phẩm hơn trước | Low | Limit 50, bounded scan tối đa 150 dòng trước khi score/slice |
| Regex contains có thể tốn hơn prefix lookup | Low/Medium | Chỉ chạy khi fast lookup không đủ kết quả; vẫn limit chặt |
| Frontend nhận nhiều response shape hơn | Low | Backward-compatible, không đổi API cũ |
| Rich renderer thay đổi layout dropdown | Low | Chỉ áp dụng product suggestion boxes |

## 11. Backlog

1. Bổ sung index MongoDB cho `code/productCode/sku/barcode` nếu catalog sản phẩm tăng lớn.
2. Có thể thêm endpoint debug `/api/search/products?explain=1` ở môi trường dev để kiểm tra query path fast/scan.
3. Bổ sung browser smoke test thực tế cho modal sửa đơn nếu có Playwright/jsdom trong phase sau.
4. Kiểm tra dữ liệu sản phẩm thực tế: sản phẩm cần tìm bằng `0864` phải có `0864` trong code/productCode/sku/barcode/name/searchText.

## 12. Final Decision

**GO**.

Lý do:

- Lỗi root cause đã được xử lý đúng ở backend search.
- Frontend contract được làm bền hơn, không sửa UI lớn.
- Không tác động công nợ, delivery closeout, AR ledger, tồn kho, import, promotion.
- Tất cả command bắt buộc và audit strict đều PASS.

## 13. SHA256

SHA256 được ghi trong file `SHA256SUMS_PHASE90_PRODUCT_AUTOCOMPLETE.txt` sau khi đóng gói.
