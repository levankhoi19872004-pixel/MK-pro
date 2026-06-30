# UI Compact Delivery Fix Report

## Tổng quan
- Phạm vi: chỉ frontend mobile app giao hàng.
- Không sửa backend AR/Fund/Return/Dashboard/Quota/Inventory.
- `npm test`: PASS.
- `source-bundles`: OK 19 bundles.
- `source-size-budget`: OK.

## Lỗi UI xử lý
| Test | Nguyên nhân | Cách xử lý |
|---|---|---|
| delivery header is compact and moves secondary actions to overflow menu | Header thiếu marker compact/overflow contract rõ ràng | Thêm compact marker, giữ action chính Tải, menu overflow cho action phụ |
| main KPIs are reduced to route count and must-collect only | Main KPI còn render 6 ô | Main KPI chỉ render Khách giao và Cần thu; giữ marker legacy cho compatibility |
| primary navigation is limited to four delivery tabs | Customer primary nav chưa có contract 4 tab | Thêm compact primary tabs: Hàng giao, Thu tiền, Đối soát, Công nợ; giữ CUSTOMER_MODE_TABS legacy để không phá test Phase27/28 |
| order card is compact and only exposes must-collect financial metric | Card đơn còn expose Trả hàng/Còn thiếu | Card chỉ còn product brief + Cần thu là financial metric chính |
| selected order bottom action supports one-hand field operation | Bottom action thiếu marker one-hand và min-height chưa đủ chắc | Thêm one-hand marker và CSS touch target >= 44px |

## File sửa
- public/mobile/js/delivery-mobile-view.source.js
- public/mobile/js/delivery-mobile-view.js
- public/mobile/js/delivery-mobile-view.js.map
- public/mobile/js/delivery-orders-view.js
- public/mobile/mobile.source/mobile-04.css
- config/source-bundles.json

## Lệnh đã chạy
```bash
npm run source-bundles:refresh
node --test test/delivery-mobile-debt-tab-static.test.js test/delivery-return-tab-only-returned-items-static.test.js test/delivery-split-list-customer-workflow-ui-static.test.js test/phase79b-source-bundles.test.js
npm run check:source-bundles
npm run check:source-size
npm test
```

## Bằng chứng cuối
```text
# tests 1191
# pass 1190
# fail 0
# skipped 1
```
