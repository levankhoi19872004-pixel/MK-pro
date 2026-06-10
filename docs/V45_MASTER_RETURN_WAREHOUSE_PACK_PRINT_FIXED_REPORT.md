# V45 - Sửa in đơn tổng trả hàng theo kho và quy cách sản phẩm

## Mục tiêu

Sửa mẫu in đơn tổng trả hàng để:

- Chia đúng KHO HC / KHO PC theo kho đã lưu ở từng dòng sản phẩm.
- Không gom mặc định toàn bộ hàng về KHO HC khi sản phẩm thuộc KHO PC.
- Tính lại Thùng/Lẻ theo quy cách thật của sản phẩm (`conversionRate`, `packingQty`, `unitsPerCase`, `qtyPerCase`).
- Gộp sản phẩm trả hàng theo `warehouseCode + productCode + salePrice`.
- Tổng từng kho tính riêng theo số lượng lẻ và giá bán.

## File đã chỉnh

- `public/js/app/07-debt-cashbook.js`

## Nội dung chỉnh chính

### 1. Bổ sung helper lấy giá trị đầu tiên hợp lệ

Thêm hàm:

- `masterReturnFirstValue(...)`

Dùng để đọc dữ liệu an toàn từ nhiều nguồn khác nhau.

### 2. Chuẩn hóa mã kho

Thêm hàm:

- `masterReturnNormalizeWarehouse(raw)`

Quy tắc:

- Có `PC`, `KHO_PC`, `KHO PC` => `KHO_PC`
- Có `HC`, `KHO_HC`, `KHO HC` => `KHO_HC`
- Không nhận diện được => rỗng, để hàm chính tiếp tục dò nguồn khác

### 3. Sửa nguồn xác định kho

Sửa `masterReturnWarehouseCode(item, child)` để ưu tiên:

1. Kho trên dòng hàng trả
2. Kho trong `productSnapshot`
3. Kho trong `product`
4. Kho trên phiếu trả con
5. Cuối cùng mới fallback `KHO_HC`

Các trường đã hỗ trợ:

- `item.warehouseCode`
- `item.defaultWarehouse`
- `item.warehouse`
- `item.warehouseId`
- `item.stockWarehouseCode`
- `item.productSnapshot.defaultWarehouse`
- `item.productSnapshot.warehouseCode`
- `item.product.defaultWarehouse`
- `item.product.warehouseCode`
- `child.warehouseCode`
- `child.defaultWarehouse`

### 4. Sửa quy cách sản phẩm

Sửa `masterReturnItemPack(item)` để lấy đúng quy cách theo thứ tự:

- `item.packingQty`
- `item.conversionRate`
- `item.unitsPerCase`
- `item.qtyPerCase`
- `item.unitPerCase`
- `item.pack`
- `item.productSnapshot.conversionRate`
- `item.productSnapshot.packingQty`
- `item.product.conversionRate`
- `item.product.packingQty`

Không parse từ tên sản phẩm.

### 5. Sửa hiển thị Thùng/Lẻ

Sửa `masterReturnCaseDisplay(qty, pack)` theo công thức chuẩn:

```js
caseQty = Math.floor(qty / pack)
oddQty = qty % pack
```

Ví dụ:

- SL lẻ = 8, quy cách = 15 => `0/8`
- SL lẻ = 8, quy cách = 4 => `2/0`
- SL lẻ = 8, quy cách = 8 => `1/0`

### 6. Sửa build dữ liệu in

Sửa `buildMasterReturnPrintPages(r, children)`:

- Không khởi tạo cứng chỉ `KHO_HC`, `KHO_PC`.
- Tạo map theo kho thực tế.
- Gộp sản phẩm theo:

```text
warehouseCode + productCode + salePrice
```

- Sau khi cộng số lượng, tính lại `caseDisplay`.
- Sắp xếp ưu tiên KHO HC rồi KHO PC.
- Sắp xếp sản phẩm theo mã sản phẩm.

## Kết quả sau sửa

Mẫu in đơn tổng trả hàng sẽ hiển thị đúng dạng:

```text
KHO HC - Hàng trả nhập kho
...

KHO PC - Hàng trả nhập kho
...
```

Mỗi kho có bảng riêng, tổng SL và tổng tiền riêng.

