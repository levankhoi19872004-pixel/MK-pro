# PHASE16 — P1 Tối ưu tốc độ app giao hàng / Lazy-load Returns & Debt

## 1. Tổng quan dự án / phạm vi xử lý

**Baseline sử dụng:** `MK-pro-phase15-delivery-mobile-ui-p0p1-patched(1).zip`

**Mục tiêu:** giảm request thừa khi mở app giao hàng, lazy-load dữ liệu Hàng trả/Công nợ, chống request trùng khi thao tác nhanh trên mobile, không đổi nghiệp vụ và không đổi API contract.

**Phạm vi đã tác động:**

- Frontend mobile delivery: `public/mobile/js/delivery-mobile-view.source.js`
- Bundle sinh ra: `public/mobile/js/delivery-mobile-view.js`, `.map`
- CSS source part mobile: `public/mobile/mobile.source/mobile-03.css`
- Test tĩnh mobile delivery performance/debt tab
- Tài liệu benchmark request count

**Không tác động:**

- Không sửa backend/API route.
- Không sửa AR/Fund/Inventory.
- Không đổi business rule giao hàng, thu tiền, trả hàng, công nợ.
- Không đổi route lớn hoặc schema.

---

## 2. Đánh giá chất lượng & rủi ro ban đầu

### Vấn đề chính trước vá

| Vấn đề | Mức độ | Cơ chế rủi ro |
|---|---:|---|
| Mở app có thể tải cả orders + returns | P1 | Tăng request và tải `/api/delivery/returns` dù NVGH chưa cần xem hàng trả |
| Chọn đơn có thể tự gọi returns | P1 | Khi NVGH lướt nhiều đơn sẽ phát sinh nhiều request không cần thiết |
| Tab Công nợ chưa có cache/in-flight guard đủ rõ | P1 | Đổi tab nhanh có thể tạo request trùng hoặc response cũ ghi đè state mới |
| Refresh có thể bị bấm liên tục | P1 | Dễ spam API trên mạng yếu/điện thoại ngoài đường |
| CSS mobile source part vượt/nguy cơ vượt budget | P2 | Test source-size có thể fail nếu bundle source part phình to |

---

## 3. Phân tích sâu theo yêu cầu

### 3.1 Lazy-load tab phụ

Đã đổi luồng mở app:

- Trước: có nguy cơ gọi `orders + returns` ngay khi mở app.
- Sau: mở app chỉ gọi dữ liệu cần cho tab mặc định **Đơn giao**.

Luồng mới:

| Tình huống | Request sau vá |
|---|---|
| Mở app | Chỉ load orders |
| Chọn đơn | Không tự gọi returns |
| Vào tab Hàng trả | Load returns của đơn đang chọn nếu chưa có cache mới |
| Bấm tải lại Hàng trả | Force reload returns |
| Vào tab Công nợ | Load debts nếu chưa có cache mới |
| Bấm tải lại Công nợ | Force reload debts |

### 3.2 Chống request trùng / stale response

Đã bổ sung:

- `state.loadPromise` cho luồng load orders.
- `state.returnsPromise` cho luồng Hàng trả.
- `state.debtPromise` cho luồng Công nợ.
- `state.debtRequestSeq` để response công nợ cũ không ghi đè state mới.
- Cache timestamp `returnsCache` và `debtCacheAt` với TTL 60 giây.

### 3.3 Debounce / throttle

- Search vẫn giữ debounce 250ms.
- Refresh button có throttle 1200ms để tránh spam API.
- Throttle chỉ áp dụng cho refresh chủ động, không chặn filter/search cần cập nhật dữ liệu.

### 3.4 Benchmark request count

Đã thêm:

- `MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.md`
- `MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.csv`

Tóm tắt benchmark:

| Metric | Trước | Sau | Ghi chú |
|---|---:|---:|---|
| Mở app | 2 request | 1 request | Không preload `/api/delivery/returns` |
| Chọn đơn | 1 request | 0 request | Không tự tải returns khi chỉ chọn đơn |
| Vào tab Hàng trả | 0 | 1 request lazy | Có cache 60s |
| Vào tab Công nợ | 0 | 1 request lazy | Có cache 60s |
| Bấm refresh liên tục | Nhiều request | throttle 1200ms | Giảm spam API |

### 3.5 CSS/source bundle

`public/mobile/mobile.source/mobile-03.css` được nén lại trong phạm vi source part để giữ dưới budget hiện có. Các marker static test được giữ lại:

- `MOBILE_DEBT_SUBTABS_V2_START/END`
- `MOBILE_DEBT_COMPACT_CHECKBOX_V3_START/END`

Việc này không đổi nghiệp vụ hoặc API, chỉ giúp source-size gate ổn định sau khi các phase mobile UI trước đó đã làm CSS phình lên.

---

## 4. Giải pháp đã triển khai

### Phương án A — Khuyến nghị dài hạn / production-grade

**Hướng làm:** tách state/data loader theo từng tab, mỗi loader có cache TTL, in-flight guard và stale response guard.

**Đã áp dụng một phần phù hợp P1:**

- Orders loader riêng.
- Returns lazy loader riêng.
- Debt lazy loader riêng.
- Cache TTL 60 giây.
- In-flight guard tránh request trùng.
- Request sequence cho debt.

**Lợi ích:**

- Mở app nhanh hơn.
- Ít request thừa hơn.
- Hạn chế lỗi UI do response cũ ghi đè.
- Phù hợp mở rộng nếu sau này cần pagination/AbortController.

**Nhược điểm:**

- State frontend phức tạp hơn nhẹ.
- Cần test static để khóa hành vi lazy-load.

**Effort:** Medium

**Rủi ro:** Thấp, vì không đổi business rule/API/backend.

### Phương án B — Cân bằng effort

**Hướng làm:** chỉ bỏ preload returns khi mở app, chưa thêm cache/in-flight guard.

**Lợi ích:** sửa nhanh hơn.

**Nhược điểm:** vẫn có nguy cơ request trùng khi đổi tab nhanh, không khóa được stale response.

**Effort:** Easy

**Rủi ro:** Trung bình khi dữ liệu tăng.

**Kết luận:** Đã chọn Phương án A ở mức vừa đủ, không refactor rộng.

---

## 5. File thay đổi

### Modified

```text
config/source-bundles.json
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/mobile.source/mobile-03.css
test/delivery-mobile-debt-tab-static.test.js
```

### Added

```text
MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.md
MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.csv
test/delivery-mobile-performance-p1-static.test.js
```

### Deleted

```text
Không có
```

---

## 6. Kết quả test thực tế

### Source bundle

```bash
npm run check:source-bundles
```

Kết quả:

```text
[source-bundles] OK 19 bundles
```

### Source size

```bash
npm run check:source-size
```

Kết quả:

```text
[source-size-budget] OK
```

### Syntax

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 941 JavaScript files
```

### Targeted tests

```bash
node --test \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-mobile-debt-tab-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js \
  test/mobile-debt-checkbox-compact-static.test.js \
  test/mobile-debt-subtabs-static.test.js
```

Kết quả:

```text
# tests 16
# pass 16
# fail 0
```

### Full test theo yêu cầu

```bash
npm test
```

Kết quả thực tế:

```text
# tests 1007
# pass 1004
# fail 2
# skipped 1
```

Hai lỗi fail còn lại là snapshot characterization cũ, đã tồn tại từ baseline trước khi vá Prompt 5, không liên quan phần tối ưu mobile delivery:

```text
test/phase79-production-strangler.test.js:38
- assembled index page matches the approved Phase80 characterization snapshot
- expected: 935f3a5294989f410068707fbf2dacba440297c48b6ea54538610d2f3c656a0f
- actual:   ff5cc35f968b03777118101d3cab977fcc7fba428b066a6032612d094b961d3c

test/phase79-production-strangler.test.js:46
- split CSS parts preserve exact legacy cascade order
- expected: 2b201385219e49d988319457eaaf18ea50b3494cd6fe526095df1545056e6783
- actual:   a61cd0f25b01fcf5219e3b4ee65e850f36a44289336079b332c3435dd1142576
```

Không cập nhật hai snapshot này để tránh thay đổi lan rộng ngoài phạm vi P1 mobile delivery performance.

---

## 7. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---:|---|
| Chưa có benchmark runtime bằng browser thật | Thấp | Đã có benchmark request-count tĩnh; nên đo thêm bằng Chrome DevTools trên thiết bị thật khi chạy nội bộ |
| Chưa thêm pagination cho returns/debts | Thấp/Trung bình | Hiện tối ưu bằng lazy-load + cache; nếu dữ liệu lớn hơn nên thêm pagination backend nhẹ |
| Snapshot phase79 vẫn fail | Thấp | Lỗi tồn tại sẵn, không thuộc phạm vi Prompt 5 |

---

## 8. Checklist nghiệm thu nhanh

- Mở app giao hàng: chỉ thấy request orders.
- Chọn đơn: không tự gọi returns.
- Vào tab Hàng trả: lúc này mới gọi returns.
- Vào tab Công nợ: lúc này mới gọi debts.
- Bấm tab qua lại trong 60 giây: không reload lặp lại nếu không bấm Tải.
- Bấm Tải liên tục: không spam API do throttle.
- Search vẫn debounce, không lag giao diện.
