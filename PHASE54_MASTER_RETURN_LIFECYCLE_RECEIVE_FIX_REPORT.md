# PHASE 54 — Sửa nhập kho đơn tổng trả hàng theo lifecycle chuẩn

## 1. Hiện tượng

Khi chọn đơn tổng trả hàng và bấm **Nhập kho**, hệ thống trả về hai lỗi:

1. `Đơn tổng trả hàng đã hủy/xóa, không thể nhập kho` dù đơn thực tế có thể đã nhận kho trước đó.
2. `Không cho phép chuyển trạng thái phiếu trả từ grouped sang received` đối với đơn đang chờ kho nhận.

## 2. Nguyên nhân gốc

### 2.1. Trộn trạng thái gộp với trạng thái vòng đời

Khi tạo đơn tổng trả, `src/services/masterReturnOrderService.js` ghi phiếu con:

```js
status: 'grouped'
```

Trong khi state machine chỉ cho phép luồng chuẩn:

```text
draft -> waiting_receive -> received -> accounting_confirmed -> posted_to_ar
```

`grouped` chỉ mô tả phiếu đã được gộp vào đơn tổng, không phải trạng thái nghiệp vụ kho. Vì vậy thao tác nhận kho bị chặn tại `grouped -> received`.

### 2.2. Nhận diện sai đơn đã nhận kho thành đơn hủy/xóa

Hàm `isInactiveStatus()` dùng chung tập trạng thái chặn gộp, trong đó có cả `received` và `completed`. Kết quả là đơn đã nhận kho bị báo sai thành “đã hủy/xóa”, thay vì trả về kết quả idempotent “đã nhận kho trước đó”.

## 3. Bản sửa production-grade

### 3.1. Tách lifecycle và merge status

Phiếu con khi được gộp hiện được ghi theo chuẩn:

```js
{
  status: 'waiting_receive',
  returnStatus: 'waiting_receive',
  returnState: 'waiting_receive',
  warehouseReceiveStatus: 'waiting_receive',
  returnMergeStatus: 'merged',
  masterReturnOrderId,
  masterReturnOrderCode
}
```

Không còn tạo mới dữ liệu `status: 'grouped'`.

### 3.2. Tương thích dữ liệu cũ

`ReturnStateMachine` ánh xạ dữ liệu cũ:

```text
grouped -> waiting_receive
```

Nhờ đó đơn cũ có thể nhập kho ngay sau khi deploy, trước cả khi chạy migration.

### 3.3. Chuẩn hóa trạng thái sau nhận kho

Sau khi nhận kho thành công, phiếu con giữ hai chiều trạng thái độc lập:

```js
returnState: 'received'
returnMergeStatus: 'merged'
warehouseReceiveStatus: 'received'
stockReceiveStatus: 'posted'
stockPosted: true
```

Biến động tồn kho vẫn được ghi trong cùng MongoDB transaction và tiếp tục dùng idempotency key của `stockTransactions`, nên không cộng tồn hai lần.

### 3.4. Sửa phân loại đơn hủy/xóa

Tập trạng thái inactive hiện chỉ gồm:

```text
cancelled, canceled, void, voided, deleted, removed,
duplicate_cancelled, cleared
```

`received` và `completed` không còn bị coi là đơn hủy/xóa. Gọi lại API cho đơn đã nhận kho sẽ trả kết quả `alreadyReceived` và không ghi tồn lặp.

### 3.5. Bảo vệ giao diện

- Đơn đã hủy/xóa bị khóa checkbox.
- “Chọn tất cả” bỏ qua checkbox bị khóa.
- Batch nhập kho kiểm tra lại trạng thái trước khi gửi API.
- File JavaScript được cache-bust bằng version Phase 54.

### 3.6. Migration an toàn

Script `scripts/migrate-return-state-machine.js` được nâng cấp:

- Có chế độ dry-run.
- Chỉ ghi khi dùng `--write`.
- Chạy theo batch 500 bản ghi.
- Chuẩn hóa `grouped/merged` về `waiting_receive` và giữ `returnMergeStatus = merged`.

Lệnh:

```bash
npm run migrate:return-state:dry
npm run migrate:return-state
```

## 4. File thay đổi

- `src/domain/lifecycle/ReturnStateMachine.js`
- `src/services/masterReturnOrderService.js`
- `src/models/ReturnOrder.js`
- `src/models/MasterReturnOrder.js`
- `public/js/app/debt/07d-master-return-orders.js`
- `public/index.html`
- `scripts/migrate-return-state-machine.js`
- `package.json`
- `test/master-return-lifecycle-separation.test.js`

## 5. Tác động và rủi ro

### Lợi ích

- Nhập kho được các đơn tổng trả đang ở dữ liệu cũ `grouped`.
- Không còn báo sai đơn đã nhận kho thành đơn hủy/xóa.
- Trạng thái gộp và trạng thái nghiệp vụ không còn ghi đè nhau.
- Giữ nguyên transaction và idempotency chống cộng tồn lặp.

### Rủi ro

- Migration thay `status/returnState` cũ `grouped` thành `waiting_receive`; đây là thay đổi có chủ đích và không làm thay đổi số lượng tồn kho.
- Cần chạy migration sau deploy để dữ liệu MongoDB thống nhất hoàn toàn, dù lớp tương thích đã cho phép xử lý dữ liệu cũ ngay lập tức.

## 6. Kết quả kiểm thử

- Targeted master-return/lifecycle: `16/16` pass.
- Full test suite: `528/528` pass.
- Syntax check: `636` file JavaScript hợp lệ.
- OpenAPI: `256` operations, tài liệu không lệch.
- npm audit: `0` vulnerabilities.
