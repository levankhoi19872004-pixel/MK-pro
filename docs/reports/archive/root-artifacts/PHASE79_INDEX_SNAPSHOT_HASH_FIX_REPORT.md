# PHASE79 INDEX SNAPSHOT HASH FIX REPORT

## 1. Hiện trạng lỗi

Test fail:

```text
test/phase79-production-strangler.test.js
assembled index page matches the approved Phase80 characterization snapshot
```

Nguyên nhân trực tiếp: `public/fragments/index/03-index-body.html` bị thay đổi giá trị option mặc định của bộ lọc Công nợ:

```html
<option value="open">Khách còn nợ</option>
```

Trong khi characterization snapshot Phase80 đã chốt assembled index page với option cũ:

```html
<option value="">Khách còn nợ</option>
```

Do `readPublicIndex()` assemble HTML từ `config/index-page-fragments.json`, chỉ một thay đổi nhỏ trong fragment cũng làm SHA256 lệch.

## 2. Root cause

Đây không phải lỗi nghiệp vụ AR/debt read model. Đây là lỗi static characterization gate do thay đổi HTML snapshot ngoài phạm vi cần thiết.

Flow đúng vẫn có thể giữ bằng JavaScript:

```js
params.set('status', criteria.status || 'open');
```

Vì vậy UI vẫn gửi status canonical `open` khi option mặc định có value rỗng, không cần thay đổi HTML snapshot.

## 3. File đã sửa

| File | Thay đổi |
|---|---|
| `public/fragments/index/03-index-body.html` | Revert option mặc định “Khách còn nợ” từ `value="open"` về `value=""` để khớp snapshot Phase80. |

Không sửa frontend để ép hiện khách. Không thay đổi AR ledger, debt read model, API, tồn kho, quỹ, import hoặc mobile UI.

## 4. Kiểm chứng

Đã kiểm chứng assembled index hash:

```text
actual:   e61af7620b60f8cb4b5a364aa18cf974c8a47c572b2a6596c98b7052a9d4899d
expected: e61af7620b60f8cb4b5a364aa18cf974c8a47c572b2a6596c98b7052a9d4899d
ok: true
```

Đã chạy:

```bash
node --test test/phase79-production-strangler.test.js test/debt-ui-status-filter-static.test.js
```

Kết quả phần snapshot:

```text
assembled index page matches the approved Phase80 characterization snapshot: pass
split CSS parts preserve exact legacy cascade order: pass
debt UI static filter tests: 3/3 pass
```

Hai subtest còn lại trong `phase79-production-strangler.test.js` không chạy được trong sandbox vì ZIP không kèm `node_modules`, thiếu `mongoose`. Đây là giới hạn môi trường, không phải lỗi snapshot.

## 5. Kết luận

Lỗi snapshot hash đã được sửa khoanh vùng. Phase79 vẫn giữ contract: bộ lọc trạng thái rỗng ở HTML được JavaScript map thành `status=open` khi gọi API Công nợ. Không fallback ledger bẩn, không tính công nợ từ `salesOrders`, không sửa dữ liệu production.
