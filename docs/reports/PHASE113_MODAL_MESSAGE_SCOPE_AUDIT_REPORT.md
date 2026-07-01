# PHASE113 — Popup/Modal Message Scope Audit

## Nguyên tắc chuẩn

**Thao tác ở đâu, thông báo ở đó.** Màn chính chỉ dùng message cho thao tác màn chính. Popup/modal có submit, validate hoặc API call phải có message/loading riêng trong popup/modal.

## 1. Tổng quan popup/modal inventory

| Module | Popup/modal | File | Rủi ro | Kết luận |
|---|---|---|---|---|
| Công nợ (New) | Popup chi tiết khách, lập phiếu thu, confirm/reject phiếu thu | `public/js/app/new/92-debt-new.js` | P0: thao tác trong popup dùng message màn chính | Đã tách `mainNotice/mainError` và `popupNotice/popupError`; popup có `.debt-new-modal-message` |
| Đơn giao hôm nay (New) | Modal Điều chỉnh đơn giao | `public/js/app/new/91-delivery-today-new.js` | P0: validate/lưu correction có thể đẩy ra màn chính | Đã thêm `setModalNotice/setModalError` scope `adjustment` |
| Đơn giao hôm nay (New) | Modal Chốt sổ giao hàng | `public/js/app/new/91-delivery-today-new.js` | P0: lỗi/chốt sổ trong modal có thể hiện ngoài modal | Đã thêm `setModalNotice/setModalError` scope `closeout` |
| Sản phẩm | Popup thêm/sửa sản phẩm | `public/js/app/02-products.js` | P1: dùng `formMessage`; scope đang nằm cùng form | Chưa cần refactor sâu trong phase này |
| Khách hàng | Popup thêm/sửa khách hàng | `public/js/app/03-customers-autocomplete.js` | P1: dùng `customerMessage`; scope đang nằm cùng form | Chưa cần refactor sâu trong phase này |
| Bán hàng | Popup tạo/sửa đơn bán hàng | `public/js/app/05-sales-orders.part02.js` và source fragments | P1/P2: dùng `salesMessage`, cần audit UX riêng nếu message nằm ngoài modal | Ghi nhận rủi ro, không sửa nghiệp vụ trong phase này |
| Đơn tổng | Popup tạo/sửa đơn tổng | `public/js/app/06-master-delivery.js` | P1/P2: dùng helper message chung `masterOrderMessage` | Ghi nhận rủi ro, cần phase UI riêng nếu phát sinh lỗi thực tế |
| Import | Popup phiếu nhập/import | `public/js/app/04-import-orders.js`, `public/js/app/admin/08d-import-excel*.js` | P1: progress/preview có nhiều nhánh async | Ghi nhận rủi ro, ưu tiên giữ logic import hiện tại |
| Tồn kho DMS | Upload/history modal | `public/js/app/10-dms-inventory.js` | P2: modal đơn giản, ít thao tác kế toán trực tiếp | Theo dõi |
| Quỹ tiền | Popup/confirm thu chi/chuyển quỹ | `public/js/app/debt/07f-fund-ledger*.js` | P0 nếu message sai scope vì là nghiệp vụ tiền | Inventory đã ghi nhận, nên xử lý trong phase quỹ riêng nếu có lỗi UI thực tế |
| Báo cáo/Admin | Modal báo cáo/import/promotion | `public/js/app/admin/*` | P2/P1 tùy thao tác | Theo dõi |

## 2. Lỗi scope message đã phát hiện và sửa

| Module | Popup | Lỗi | Mức độ | Cách sửa |
|---|---|---|---|---|
| Công nợ (New) | Chi tiết khách công nợ | Lập phiếu thu, confirm, reject dùng `setMessage()` màn chính | P0 | Chuyển sang `setPopupNotice()` / `setPopupError()` |
| Công nợ (New) | Chi tiết khách công nợ | Pending collections dùng chung state với màn chính | P1 | Tách `collections` và `popupCollections` |
| Đơn giao hôm nay (New) | Điều chỉnh đơn giao | Validate/lưu correction dùng `setMessage()` màn chính | P0 | Chuyển sang `setModalError('adjustment')` / `setModalNotice('adjustment')` |
| Đơn giao hôm nay (New) | Chốt sổ giao hàng | Lỗi/chốt sổ dùng message màn chính | P0 | Chuyển sang `setModalError('closeout')` / `setModalNotice('closeout')` |

## 3. File đã sửa

| File | Lý do sửa | Thay đổi chính |
|---|---|---|
| `public/js/app/new/92-debt-new.js` | Popup Công nợ New đang dùng main message | Thêm state `mainNotice/mainError`, `popupNotice/popupError`, `.debt-new-modal-message`, `popupCollections`, silent refresh |
| `public/js/app/new/91-delivery-today-new.js` | Modal closeout/correction dùng main message | Thêm state `modalNotice`, helper `setModalNotice/setModalError`, message container cho closeout và adjustment |
| `test/popup-modal-message-scope-static.test.js` | Chống tái phát | Static guard cho Công nợ New, Đơn giao hôm nay New và inventory report |
| `docs/reports/PHASE113_MODAL_MESSAGE_SCOPE_AUDIT_REPORT.md` | Báo cáo inventory | Ghi nhận popup/modal chính và mức rủi ro |

## 4. Chuẩn message scope mới

- `setMainNotice()` / `setMainError()` chỉ dùng cho thao tác màn chính như tải danh sách, xóa lọc, search-gated error.
- `setPopupNotice()` / `setPopupError()` dùng cho popup Công nợ New: tạo phiếu thu, confirm, reject, tải phiếu trong popup.
- `setModalNotice(scope)` / `setModalError(scope)` dùng cho Đơn giao hôm nay New: `scope = closeout` hoặc `adjustment`.
- Silent refresh dùng khi popup/modal thao tác thành công nhưng cần cập nhật màn chính mà không hiển thị message ngoài màn chính.

## 5. Cách tự kiểm tra UI

1. Mở Công nợ New, tìm khách, mở popup khách.
2. Vào tab Lập phiếu thu, không tick đơn rồi bấm tạo phiếu: lỗi phải nằm trong popup.
3. Tạo phiếu hợp lệ: thông báo thành công nằm trong popup.
4. Confirm/reject phiếu trong tab Phiếu thu chờ xác nhận: message nằm trong popup.
5. Mở Đơn giao hôm nay New, mở modal Điều chỉnh đơn giao, để thiếu lý do rồi lưu: lỗi nằm trong modal.
6. Mở modal Chốt sổ giao hàng, xóa lý do rồi xác nhận: lỗi nằm trong modal.
7. Đóng popup/modal rồi mở lại: message cũ đã được clear.
8. Thao tác tải danh sách ở màn chính vẫn hiện message màn chính bình thường.

## 6. Rủi ro còn lại

Các module legacy như Bán hàng, Đơn tổng, Import, Quỹ tiền có popup/modal riêng. Phase này đã inventory và ưu tiên sửa các luồng P0 mới đang phát sinh lỗi thực tế. Nếu xuất hiện lỗi scope message ở các module legacy, nên xử lý theo từng module để tránh sửa lan vào nghiệp vụ cũ.
