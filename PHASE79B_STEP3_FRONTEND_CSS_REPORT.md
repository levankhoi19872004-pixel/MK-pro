# PHASE79B — BƯỚC 3: FRONTEND, MOBILE VÀ CSS

## JavaScript đã xử lý

- `public/js/app/05-sales-orders.js`: 4 runtime shard.
- `public/js/app/admin/08d-import-excel.js`: 3 runtime shard.
- `public/js/app/debt/07f-fund-ledger.js`: 3 runtime shard.
- `public/js/delivery/delivery-web-view.js`: compatibility bundle.
- `public/mobile/js/sales.js`: ES module compatibility bundle.
- `public/mobile/js/delivery-mobile-view.js`: compatibility bundle.

## CSS đã xử lý

- `public/mobile/mobile.css`: manifest nhập 3 phần.
- `public/print.css`: manifest nhập 2 phần.

## Bảo toàn hành vi

- Classic script shard được tải đúng thứ tự trong index fragment.
- Không đổi tên global variable giữa các classic script.
- Quality gate ghép toàn bộ classic script và parse trong cùng global lexical scope.
- CSS giữ nguyên thứ tự cascade của mã nguồn cũ.
- Cache-bust được nâng lên `phase79b-source-shards-v1`.

## Kết quả

- Mỗi runtime shard nhỏ hơn 24 KiB.
- Runtime bundle đơn nhỏ hơn 40 KiB.
- Source fragment nhỏ hơn 24 KiB.
