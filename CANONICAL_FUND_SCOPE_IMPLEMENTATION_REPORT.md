# Canonical Fund Delivery Scope Fix — Option A

## Mục tiêu
Loại bỏ split-read giữa **Đơn giao hôm nay (New)** và **Tạo phiếu nộp quỹ giao hàng**. Tập đơn nghiệp vụ theo ngày/NVGH phải dùng cùng một orders-first canonical boundary; `masterOrders` chỉ được dùng như metadata.

## RED reproduction
Fixture khóa đúng case đã quan sát: `05/08/2026 + ghth`, canonical có **36 đơn**, legacy master-child refs chỉ có **32 đơn**; tiền mặt tương ứng **54.903.962** so với **53.143.962**, lệch **1.760.000**; chuyển khoản cùng **6.484.000**. RED được chạy trước production change và FAIL đúng assertion `32 !== 36`. Xem `RED_CANONICAL_FUND_PARITY.log` và `CANONICAL_FUND_SCOPE_RED_GREEN_EVIDENCE.json`.

## Kiến trúc sau sửa
- `CanonicalDeliveryFinancialScopeReader.listOrdersPage()` là boundary dùng chung cho Delivery Today.
- `CanonicalDeliveryFinancialScopeReader.listAllOrders()` lấy đủ các page cho nghiệp vụ quỹ, dedupe theo canonical order identity và fail-closed nếu vượt safety bound.
- `CanonicalDeliveryFinancialScopeAdapter` giữ compatibility contract `listDeliveryTodayOrdersCompact()` cho `fundService`, nhưng nguồn tập đơn là canonical reader, **không còn masterOrders-first**.
- `DeliveryPaymentStateReadService` vẫn là resolver trạng thái tiền cho fund preview; patch không thay đổi AR/fund write semantics.
- `config/canonical-flows.json` đã đăng ký shared reader/adapter và source contract.

## GREEN / Regression
- Same RED test sau fix: PASS, 36 orders, cash 54.903.962, bank 6.484.000; legacy master reader calls = 0; canonical reader calls = 1.
- Targeted regression: **28/28 PASS**.
- Syntax toàn codebase: **1681 JavaScript files PASS**.
- Fund update refresh behavior và Phase258A canonical payment-state regression đều nằm trong final suite và PASS.

## Source bundle integrity
`fundService.js` là generated bundle. Runtime output đã được thay đúng **một require literal** từ `./master-order/masterOrderDelivery.service` sang `./delivery/CanonicalDeliveryFinancialScopeAdapter`. Byte-level proof: file fixed bằng chính baseline generated file sau đúng một literal replacement. Canonical source hash trong `config/source-bundles.json` cũng khớp nội dung fragments mới.

Official `build-source-bundles --check` chưa chạy được trong sandbox vì thiếu package `terser`; `verify-source-artifact-clean` cũng bị chặn vì thiếu `jszip`. Đây là giới hạn môi trường dependency, không phải test failure của logic patch. Trước deploy ở môi trường có `npm ci`, nên chạy lại `npm run check:source-bundles` và `npm run test:artifact-clean`.

## Source-size gate
`check-source-size-budget` vẫn FAIL ở 7 file legacy đã vượt budget từ input baseline. Output baseline và fixed giống hệt; `src/services/fundService.js` hiện **40.071 bytes < 40.960 bytes**, nên patch này không tạo thêm vi phạm size budget.

## Phạm vi không thay đổi
Không migration dữ liệu, không sửa dữ liệu production, không thay công thức AR, return, closeout hoặc fund posting. Chỉ thống nhất **order scope read boundary** cho hai màn và cập nhật test harness theo dependency mới.
