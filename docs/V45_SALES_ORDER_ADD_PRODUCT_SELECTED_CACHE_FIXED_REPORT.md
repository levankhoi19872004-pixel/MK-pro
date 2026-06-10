# V45 - Fix thêm sản phẩm vào đơn bán hàng

## Lỗi
Ô sản phẩm đã hiển thị label nhưng khi bấm **Thêm vào đơn** vẫn báo chưa chọn sản phẩm.

## Nguyên nhân
Kết quả gợi ý sản phẩm lấy từ `/api/search/products` chưa được đồng bộ vào cache `UnifiedProductSearch`. Vì vậy `salesProductSelect` hoặc `dataset.selectedId` có thể có mã nhưng `findProductByKey()` không tìm thấy sản phẩm trong catalog.

## Đã sửa
- `UnifiedSearchEngine.searchProduct()` tự sync kết quả vào `UnifiedProductSearch`.
- Khi chọn sản phẩm, lưu object vào `window.__selectedSalesProduct`.
- `getSelectedSalesProduct()` fallback theo hidden value, dataset, object vừa chọn, và mã tách từ label `Mã | Tên`.
- Sau khi thêm dòng thành công thì reset object sản phẩm vừa chọn.
