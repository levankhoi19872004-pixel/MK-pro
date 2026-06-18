# PHASE79A — BƯỚC 2: MASTER ORDER STRANGLER

## Mục tiêu

Tách logic thật khỏi `masterOrderLegacy.service.js`, giữ nguyên facade và toàn bộ public contract.

## Kết quả

| Chỉ số | Trước | Sau |
|---|---:|---:|
| `masterOrderLegacy.service.js` | 180.292 byte / 3.946 dòng | 2.503 byte / 44 dòng |
| Module logic chính | 1 God File | 12 module use-case + utility |
| Module lớn nhất | 180 KB | khoảng 33 KB |

## Module đã tách

- `masterOrderQuery.impl.js`
- `masterOrderCommand.impl.js`
- `masterOrderReturn.impl.js`
- `deliveryCommon.impl.js`
- `deliveryTodayList.impl.js`
- `deliverySummary.impl.js`
- `deliverySalesSummary.impl.js`
- `deliveryOrdersCompact.impl.js`
- `deliveryOrderCommand.impl.js`
- `deliveryAccountingCore.impl.js`
- `deliveryAccountingCommand.impl.js`
- `masterOrderPrintLegacy.impl.js`
- `lazyDependency.util.js`

## Contract được giữ nguyên

- Query: danh sách đơn con chưa gộp, đơn tổng, đơn giao hôm nay, KPI và compact list.
- Command: tạo/sửa/hủy/xóa đơn tổng, cập nhật đơn giao.
- Accounting: xác nhận kế toán và mở khóa.
- Print: dữ liệu in đơn tổng.
- `_internal`: toàn bộ helper trả hàng theo fixture trước refactor.

## Cơ chế an toàn

- `src/services/master-order/index.js` vẫn là public facade.
- `src/services/masterOrderService.js` không đổi contract gọi bên ngoài.
- Circular dependency được loại bằng lazy dependency và import trực tiếp implementation, không quay lại public facade.
- Accounting có feature flag `USE_NEW_DELIVERY_SETTLEMENT`:
  - `false`: compatibility implementation đã trích xuất.
  - `true`: đi qua `DeliverySettlementService`.

## Vùng ảnh hưởng

- Chỉ thay đổi ranh giới module và dependency wiring.
- Không thay đổi repository query, transaction boundary, posting logic hoặc cách tính tiền.
- Không thay đổi route/controller.

## Trạng thái

**HOÀN THÀNH** — God File đã trở thành compatibility facade nhỏ; logic thật nằm trong các module use-case.
