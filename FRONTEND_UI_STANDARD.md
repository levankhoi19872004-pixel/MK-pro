# MK-Pro Frontend UI Standard — Phase 08

## 1. Phạm vi và mục tiêu

Tài liệu này quy định cách phát triển và bảo trì frontend web/mobile của MK-Pro mà không yêu cầu viết lại bằng framework mới. Mục tiêu là giảm global state, tránh listener/request bị nhân đôi, giữ giao diện nhất quán và bảo đảm danh sách lớn vẫn phản hồi sớm trên thiết bị di động.

Các quy tắc dưới đây áp dụng cho code mới và các màn hình được chạm tới trong quá trình bảo trì. Không được tự thay đổi business rule hoặc API chỉ để phù hợp UI.

## 2. Ranh giới module theo feature

Mỗi màn hình/feature phải có một composition root rõ ràng và giữ state trong scope của module:

```text
Page entry
  ├─ feature state
  ├─ request lifecycle
  ├─ render lifecycle
  └─ delegated event handlers
```

Không tạo thêm biến toàn cục khi có thể giữ trong closure/module. Chỉ expose API tối thiểu lên `window` khi HTML hoặc module legacy thực sự cần gọi; tên và contract phải được test tĩnh.

## 3. Lifecycle và event listener

- Một feature chỉ đăng ký listener một lần khi khởi tạo.
- Dùng event delegation cho row/card/action được render động.
- Không chạy `querySelectorAll(...).forEach(addEventListener)` sau mỗi lần render danh sách.
- Listener, debounce timer, request và chunk renderer phải được cleanup khi `pagehide`, đóng modal hoặc hủy feature.
- Với shared mobile runtime, dùng:

```javascript
const lifecycle = MobileUiRuntime.createLifecycle();
lifecycle.listen(button, 'click', handler);
lifecycle.delegate(list, 'click', '[data-row-id]', onRowClick);
lifecycle.destroy();
```

## 4. Request và chống race condition

- Search text: debounce 250–300 ms.
- Filter ngày/trạng thái: thực thi ngay nếu nghiệp vụ yêu cầu phản hồi tức thời.
- Request có thể chồng nhau phải dùng `AbortController` hoặc request sequence.
- Response cũ không được mutate state hoặc ghi đè DOM sau response mới.
- Không gửi request mới nếu dữ liệu filter không đổi và module đã có in-flight guard hợp lệ.

Mẫu chuẩn:

```javascript
const gate = MobileUiRuntime.createRequestGate();
const token = gate.begin();
const response = await fetch(url, { signal: token.signal });
if (!gate.isCurrent(token)) return;
```

## 5. Render danh sách

### 5.1 Ngưỡng render

- Danh sách nhỏ: có thể render đồng bộ.
- Danh sách lớn hơn 80 dòng: render 60 dòng đầu, sau đó append theo chunk 80 dòng.
- Server pagination vẫn là cơ chế chính; chunk render không được dùng để hợp thức hóa việc tải toàn collection.
- Với bảng cực lớn cần xem xét virtualization riêng, không tự thêm trong một patch không có benchmark.

### 5.2 DOM update

- Ưu tiên `replaceChildren`, `DocumentFragment`, template hoặc append theo batch.
- Không cập nhật DOM từng dòng bằng nhiều lần reflow.
- Loading/error/empty state dùng DOM node và `textContent`, không nhúng message server trực tiếp vào HTML.
- HTML renderer chỉ được dùng khi toàn bộ dynamic field đã escape.

### 5.3 Identity

- Dùng `_id`, `id`, code nghiệp vụ ổn định hoặc key chuẩn của domain.
- Không dùng index mảng làm identity cho action có thể tồn tại qua filter/sort/reload.

## 6. An toàn dữ liệu động

- Plain text: dùng `textContent`.
- Attribute hoặc HTML card: bắt buộc escape `& < > " '`.
- Không truyền trực tiếp error message, customer name, product name, note hoặc API response vào `innerHTML`.
- `MobileUiRuntime.appendTrustedHtml()` chỉ nhận HTML đã được renderer chịu trách nhiệm escape; tên hàm cố ý thể hiện đây không phải sanitizer.

## 7. Component/helper dùng chung

### Search field + nút X

Web và mobile dùng `public/js/ui/clearable-search-inputs.js` khi cấu trúc DOM phù hợp. Nút X phải:

- chỉ hiển thị khi có nội dung;
- xóa input và phát event tương thích;
- không tự debounce filter ngày;
- giữ focus trong ô tìm kiếm.

### Toolbar và filter

- Web admin tuân theo `96-ui-toolbar-system.css` và các controller trong `public/js/ui/*-toolbar.js`.
- Hành động chính đặt cùng một khu vực, không trộn với filter dữ liệu.
- Nút nguy hiểm phải tách khỏi nút tải/tìm kiếm.

### Table/list state

Các trạng thái bắt buộc:

```text
loading → content | empty | error
```

Error state phải có thông báo dễ hiểu và retry action khi có thể retry an toàn.

### Modal

- Có lifecycle riêng.
- Đóng modal phải cleanup listener/request/timer.
- Không đăng ký lại handler mỗi lần mở nếu handler cũ chưa bị hủy.
- Không để background request cũ ghi vào modal mới.

## 8. Accessibility và mobile UX

- Touch target tối thiểu 44×44 px cho hành động chính.
- Input có label hoặc `aria-label`.
- Loading/error/empty region dùng `aria-live` khi phù hợp.
- Keyboard focus không bị mất sau khi xóa tìm kiếm.
- Text dài dùng ellipsis và title/tooltip khi nội dung đầy đủ cần xem lại.
- Không dùng chỉ màu sắc để thể hiện trạng thái.

## 9. Performance budget

| Hạng mục | Budget/Quy tắc |
|---|---|
| `public/mobile/js/sales.js` | ≤ 40.960 byte raw |
| `public/mobile/js/ui-runtime.js` | ≤ 8.192 byte raw |
| Initial DOM của list lớn | Không quá 60 row; benchmark hiện tại 360 descendant node |
| Row action listener | Một delegated listener cho mỗi list/action type |
| Gõ liên tiếp 10 ký tự | Tối đa một request sau debounce |
| Request cũ | Không được mutate state/DOM |
| Source bundle | Build/check deterministic trước test |

Bundle shared tăng transfer lần đầu nhưng phải được cache và tái sử dụng giữa màn hình. Không sao chép helper vào từng bundle feature.

## 10. Source bundle và cache busting

- File `*.source.js` hoặc `*.jsfrag` trong manifest là canonical source.
- Generated output không chỉnh tay.
- `npm run check:source-bundles` phải fail khi output lệch source.
- Khi thay generated runtime, cập nhật cache version trong HTML.
- Không tải module shared sau feature code phụ thuộc nó.

## 11. Checklist review

- [ ] State nằm trong feature scope.
- [ ] Listener chỉ bind một lần hoặc được cleanup.
- [ ] Dynamic list dùng delegation.
- [ ] Search được debounce, date filter không bị debounce ngoài ý muốn.
- [ ] Có sequence/abort chống stale response.
- [ ] Loading/error/empty đầy đủ.
- [ ] Dynamic data được escape hoặc dùng `textContent`.
- [ ] Danh sách lớn có pagination/chunking/virtualization phù hợp.
- [ ] Không tăng query hoặc đổi API contract.
- [ ] Bundle, syntax, targeted test, full test và benchmark đều chạy.
