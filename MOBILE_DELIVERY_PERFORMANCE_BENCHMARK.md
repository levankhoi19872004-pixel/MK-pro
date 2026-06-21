# MOBILE DELIVERY PERFORMANCE BENCHMARK — Phase 16

## Mục tiêu

Giảm request thừa khi mở app giao hàng, đặc biệt là `/api/delivery/returns` và `/api/mobile/debts` khi NVGH chưa vào tab tương ứng.

## Kết quả benchmark tĩnh

| Kịch bản | Trước vá | Sau vá | Ghi chú |
|---|---:|---:|---|
| Mở app ở tab Đơn giao | 2 request | 1 request | Chỉ còn `/api/delivery/orders`; không preload toàn bộ returns. |
| Chọn một đơn giao | Có thể phát sinh 1 request returns | 0 request | Chọn đơn chỉ mở tab Sản phẩm giao. |
| Vào tab Hàng trả | 0 thêm nếu đã preload | 1 request lazy-load | Gọi `/api/delivery/returns` theo đơn đang chọn, cache 60s. |
| Vào tab Công nợ | 0 nếu chưa vào tab | 1 request lazy-load | Gọi `/api/mobile/debts` khi vào tab Công nợ, cache 60s. |
| Bấm Tải liên tục | Có nguy cơ spam API | Throttle 1200ms | Tránh request trùng do thao tác nhanh ngoài đường. |

## Kết luận

- Mở app nhanh hơn vì chỉ tải dữ liệu cần cho tab mặc định `Đơn giao`.
- Hàng trả dùng lazy-load theo đơn, tránh gọi `/api/delivery/returns` toàn tuyến khi chưa cần.
- Công nợ dùng lazy-load theo tab, có in-flight guard và cache ngắn hạn.
- Response cũ không được ghi đè state mới nhờ request gate/sequence ở luồng orders, returns và debt.
