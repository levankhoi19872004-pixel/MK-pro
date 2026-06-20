# BÁO CÁO KHẢO SÁT VÀ TRIỂN KHAI NÚT XÓA NHANH TRƯỜNG TÌM KIẾM

## 1. Kết luận triển khai

Đã triển khai **Phương án A — component/helper dùng chung, production-grade** trên bản sao mã nguồn.

- Khảo sát: **230 control tĩnh** trong HTML, gồm 191 `input`, 38 `select`, 1 `textarea`, cùng toàn bộ template tạo động bằng JavaScript.
- Trường tìm kiếm/autocomplete hợp lệ: **44**.
- Trường tĩnh được áp dụng: **39**.
- Trường tạo động được áp dụng: **5**.
- Control tĩnh bị loại trừ: **152**, gồm ngày/giờ, số lượng, tiền, mật khẩu, hidden, ghi chú và dữ liệu nghiệp vụ không phải tìm kiếm.
- Autocomplete được áp dụng: **19**.
- Cơ chế xóa dùng `input`: **27**; dùng nút áp dụng hiện hữu: **17**.
- `input[type="search"]` có dấu xóa native: **8**; đã ẩn native để không xuất hiện hai dấu `×`.
- Nút xóa tùy chỉnh có sẵn trước patch: **0**.

Không thay đổi API contract, query parameter, backend, schema hoặc nghiệp vụ tìm kiếm.

## 2. Kiến trúc hiện tại và rủi ro đã phát hiện

### Kiến trúc

- Frontend web dùng HTML fragment + JavaScript thuần, assemble thành trang chính.
- Mobile có hai entry riêng: `public/mobile/sales.html` và `public/mobile/delivery.html`.
- Autocomplete dùng chung qua:
  - `public/js/search/searchFieldsConfig.js`
  - `public/js/search/configuredAutocomplete.js`
  - `public/js/search/autocompleteEngine.js`
- Một số màn hình được render sau bằng template JavaScript: giao hàng web và giao hàng mobile.

### Rủi ro trước patch

1. `input[type="search"]` chỉ có dấu xóa native trên một số trình duyệt, giao diện và hành vi không thống nhất.
2. Phát đồng thời `input` và `change` có thể tạo hai request.
3. Bấm nút áp dụng trong lúc debounce cũ còn chờ có thể tạo request kép.
4. Autocomplete có thể xóa text nhưng giữ `selectedId`, code/name hidden hoặc object đang chọn.
5. Request gợi ý cũ có thể trả về sau thao tác xóa và render lại dropdown.
6. Field render động không được xử lý nếu chỉ initialize một lần ở `DOMContentLoaded`.
7. `#userSearchInput` có hai listener gọi `loadUsers`, gây nguy cơ request trùng.
8. CSS legacy có selector ID + `!important`, có thể làm padding-right của component dùng chung bị ghi đè.

## 3. Bảng toàn bộ trường tìm kiếm đã phát hiện và áp dụng

| STT | Màn hình/module | Đường dẫn file | Selector | Loại component | Placeholder/label | Hàm xử lý / nguồn dữ liệu | Kích hoạt hiện tại | Debounce | Nút xóa trước patch | Xử lý khi bấm × |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | Danh mục sản phẩm | public/fragments/index/01-index-body.html<br>public/js/app/02-products.js | #searchInput | Text search | Tìm mã, tên, barcode, nhóm hàng... | loadProducts() / truy vấn danh mục | Nút Áp dụng hoặc Enter | Không | Không | Click nút áp dụng sau khi xóa |
| 2 | Khách hàng | public/fragments/index/01-index-body.html<br>public/js/app/03-customers-autocomplete.js | #customerSearchInput | Text search | Tìm mã, tên, SĐT, MST, địa chỉ... | loadCustomers() / truy vấn khách hàng | Nút Áp dụng hoặc Enter | Không | Không | Click nút áp dụng sau khi xóa |
| 3 | Đơn bán | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.part03.js<br>part04.js | #salesOrderSearchInput | Realtime search | Tìm mã đơn, khách hàng, ghi chú... | debounceLoadSalesOrders() → loadSalesOrders({page:1}) | input | 250 ms | Không | Phát 1 input; timer cũ được thay thế |
| 4 | Đơn bán - NVBH | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.part03.js<br>public/js/search/searchFieldsConfig.js | #salesOrderStaffFilter | Autocomplete + realtime | Tìm NV bán hàng... | SearchAutocomplete + debounceLoadSalesOrders() | input | 250/280 ms | Không | Xóa identity + phát 1 input |
| 5 | Tồn kho | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.part02.js | #stockSearchInput | Search input | Tìm mã / tên sản phẩm... | loadStock()/stock toolbar hiện hữu | Nút hoặc Enter | Không | Native browser | Ẩn native ×; click nút áp dụng |
| 6 | Đối chiếu tồn DMS | public/fragments/index/02-index-body.html<br>public/js/app/10-dms-inventory.js | #dmsInventorySearch | Search input | Tìm toàn bộ theo mã hoặc tên sản phẩm... | load DMS inventory theo state.search | Nút hoặc Enter | Không | Native browser | Ẩn native ×; click nút áp dụng |
| 7 | Đơn tổng | public/fragments/index/02-index-body.html<br>public/js/app/06-master-delivery.js | #masterOrderSearch | Text search | Tìm mã đơn tổng, NV giao, NV bán... | loadMasterOrders() | Nút hoặc Enter | Không | Không | Click nút áp dụng |
| 8 | Khách hàng - chọn NVBH | public/fragments/index/01-index-body.html<br>public/js/app/03-customers-autocomplete.js | #customerStaffSearch | Autocomplete | Gõ mã/tên NVBH... | Autocomplete NVBH / fill mã-tên | input | Theo engine | Không | Xóa text + selectedId + target |
| 9 | Import - sản phẩm | public/fragments/index/02-index-body.html<br>public/js/app/04-import-orders.js | #importProductSearch | Autocomplete | Gõ mã/tên/barcode sản phẩm... | Product autocomplete / importProductSelect | input | Theo engine | Không | Xóa text, hidden product và object chọn |
| 10 | Bán hàng - khách | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.js | #salesCustomerSearch | Autocomplete | Gõ mã/tên/SĐT/tuyến... | UnifiedSearchEngine.searchCustomer() | input | Theo engine | Không | Xóa text + customer hidden ID |
| 11 | Bán hàng - NVBH | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.js | #salesStaffSearch | Autocomplete | Gõ mã/tên/tài khoản NVBH... | UnifiedSearchEngine.searchSalesStaff() | input | Theo engine | Không | Xóa text + mã/tên ẩn |
| 12 | Bán hàng - sản phẩm | public/fragments/index/02-index-body.html<br>public/js/app/05-sales-orders.js | #salesProductSearch | Autocomplete | Gõ mã/tên/barcode sản phẩm... | Product autocomplete / salesProductSelect | input | Theo engine | Không | Xóa text, hidden ID và __selectedSalesProduct |
| 13 | Tạo đơn tổng - mã NVGH | public/fragments/index/03-index-body.html<br>public/js/search/searchFieldsConfig.js | #masterOrderForm [name="deliveryStaffCode"] | Autocomplete | Mã NV giao hàng | deliveryStaffByCode / fill code-name | input | Theo engine | Không | Xóa cả mã và tên liên kết |
| 14 | Tạo đơn tổng - tên NVGH | public/fragments/index/03-index-body.html<br>public/js/search/searchFieldsConfig.js | #masterOrderForm [name="deliveryStaffName"] | Autocomplete | Tên NV giao hàng | deliveryStaffByName / fill code-name | input | Theo engine | Không | Xóa cả tên và mã liên kết |
| 15 | Nợ ngoài luồng - khách | public/fragments/index/04-index-body.html<br>public/js/search/searchFieldsConfig.js | #externalDebtCustomerSearch | Autocomplete | Gõ mã, tên hoặc SĐT khách hàng | external debt customer autocomplete | input | Theo engine | Không | Xóa text + customerId/code/name |
| 16 | Nợ ngoài luồng - NVBH | public/fragments/index/04-index-body.html<br>public/js/search/searchFieldsConfig.js | #externalDebtSalesStaffSearch | Autocomplete | Chọn nhân viên bán hàng | staff autocomplete | input | Theo engine | Không | Xóa text + code/name ẩn |
| 17 | Nợ ngoài luồng - NVGH | public/fragments/index/04-index-body.html<br>public/js/search/searchFieldsConfig.js | #externalDebtDeliveryStaffSearch | Autocomplete | Chọn nhân viên giao hàng | staff autocomplete | input | Theo engine | Không | Xóa text + code/name ẩn |
| 18 | Popup gộp đơn - từ khóa | public/fragments/index/03-index-body.html<br>public/js/app/06-master-delivery.js | #unmergedOrderSearch | Realtime search | Tìm mã đơn, khách, địa chỉ... | scheduleUnmergedChildOrdersReload() | input | Có | Không | Phát 1 input, reset trang theo handler |
| 19 | Popup gộp đơn - NVBH | public/fragments/index/03-index-body.html<br>public/js/app/06-master-delivery.js<br>searchFieldsConfig.js | #unmergedSalesStaffFilter | Autocomplete + realtime | Lọc NV bán hàng... | SearchAutocomplete + schedule reload | input | Có | Không | Xóa identity + phát 1 input |
| 20 | Popup gộp trả hàng - NVGH | public/fragments/index/03-index-body.html<br>public/js/app/debt/07d-master-return-orders.js | #masterReturnDeliveryStaff | Autocomplete + realtime | Mã/tên NVGH | loadUnmergedReturnOrders() | input | 250 ms | Không | Xóa identity + phát 1 input |
| 21 | Popup gộp trả hàng - từ khóa | public/fragments/index/03-index-body.html<br>public/js/app/debt/07d-master-return-orders.js | #unmergedReturnOrderSearchInput | Realtime search | Tìm mã trả hàng, khách, NVGH... | loadUnmergedReturnOrders() | input | Có | Không | Phát 1 input |
| 22 | Công nợ - khách | public/fragments/index/03-index-body.html<br>public/js/app/debt/07a-debt-core.js | #debtSearchInput | Autocomplete/filter | Mã KH / tên / SĐT | loadDebts()/apply filter | Nút Tìm kiếm | Không | Không | Xóa identity; click nút áp dụng |
| 23 | Công nợ - NVBH | public/fragments/index/03-index-body.html<br>public/js/app/debt/07a-debt-core.js | #debtSalesmanFilter | Autocomplete/filter | Mã hoặc tên NVBH | staff autocomplete + loadDebts() | Nút Tìm kiếm | Theo engine | Không | Xóa identity; click nút áp dụng |
| 24 | Công nợ - NVGH | public/fragments/index/03-index-body.html<br>public/js/app/debt/07a-debt-core.js | #debtDeliveryFilter | Autocomplete/filter | Mã hoặc tên NVGH | staff autocomplete + loadDebts() | Nút Tìm kiếm | Theo engine | Không | Xóa identity; click nút áp dụng |
| 25 | Công nợ - phiếu thu legacy | public/fragments/index/03-index-body.html<br>public/js/app/debt/07a-debt-core.js | #receiptSearchInput | Realtime local filter | Trường kỹ thuật legacy | listener lọc phiếu thu hiện hữu | input | Không | Không | Phát 1 input; không tác động form khác |
| 26 | Công nợ - sổ thu legacy | public/fragments/index/03-index-body.html<br>public/js/app/debt/07a-debt-core.js | #cashbookSearchInput | Realtime local filter | Trường kỹ thuật legacy | listener lọc sổ thu hiện hữu | input | Không | Không | Phát 1 input |
| 27 | Phiếu thu nợ | public/fragments/index/04-index-body.html<br>public/js/app/debt/07e-debt-collections.js | #debtCollectionSearchInput | Text search | Mã phiếu / khách / nhân viên | loadDebtCollections() | Nút Tìm kiếm hoặc Enter | Không | Không | Click nút áp dụng |
| 28 | Trả hàng | public/fragments/index/04-index-body.html<br>public/js/app/debt/07b-return-orders.js | #returnOrderSearchInput | Text search | Mã trả hàng, khách hàng... | loadReturnOrders() | Nút Tìm kiếm hoặc Enter | Không | Không | Click nút áp dụng |
| 29 | Quỹ - sổ quỹ | public/fragments/index/04-index-body.html<br>public/js/app/debt/07f-fund-ledger.js | #fundSearchInput | Search input | Mã phiếu, NVGH, khách, ghi chú | reloadActiveFundTab() | Nút Tìm kiếm hoặc Enter | Không | Native browser | Ẩn native ×; click nút áp dụng |
| 30 | Quỹ - sổ tổng hợp | public/fragments/index/04-index-body.html<br>public/js/app/debt/07g-fund-summary.js | #fundSummaryPersonSearch | Search input | Mã hoặc tên người | loadFundSummary() | Nút Tìm kiếm hoặc Enter | Không | Native browser | Ẩn native ×; click nút áp dụng |
| 31 | Quỹ - xem trước nộp NVGH | public/fragments/index/05-index-body.html<br>public/js/app/debt/07f-fund-ledger.part03.js | #deliveryCashSubmissionStaffCode | Debounced lookup | Mã NV giao hàng | scheduleDeliveryCashSubmissionPreview() | input/change/blur hiện hữu | Có | Không | Phát 1 input; thay timer preview cũ |
| 32 | Danh mục báo cáo | public/fragments/index/05-index-body.html<br>public/js/app/admin/08a-reports.js | #reportCatalogSearch | Local search | Tên hoặc nội dung báo cáo... | render/filter report catalog | Nút Tìm kiếm hoặc Enter | Không | Không | Click nút áp dụng |
| 33 | Popup báo cáo | public/fragments/index/05-index-body.html<br>public/js/app/admin/08a-reports.js | #reportSearchInput | Text search | Mã, tên, chứng từ... | load/render report data | Nút Tìm kiếm hoặc Enter | Không | Không | Click nút áp dụng |
| 34 | Người dùng | public/fragments/index/06-index-body.html<br>public/js/app/admin/08b-users.js | #userSearchInput | Realtime debounce | Tìm mã, tên, tài khoản, quyền... | debounce(loadUsers,250) | input | 250 ms | Không | Phát 1 input; listener trùng đã loại |
| 35 | Khuyến mại | public/fragments/index/06-index-body.html<br>public/js/app/admin/08e-promotion-programs.js | #promotionSearchAllInput | Realtime/local search | Mã CTKM, nội dung, mã SP... | promotion search handler | input | Theo module | Không | Phát 1 input |
| 36 | Báo cáo hàng thiếu import | public/fragments/index/06-index-body.html<br>public/js/app/admin/08d-import-excel.part03.js | #importShortageReportSearch | Text search | Mã báo cáo / đơn / SP / khách | loadImportShortageReports() | Nút Tải lại hoặc Enter | Không | Không | Click nút tải lại |
| 37 | Giao hàng web - từ khóa | public/js/delivery/delivery-web-view.source/part-01.jsfrag<br>public/js/delivery/delivery-web-view.js | #deliveryCoreSearch | Dynamic realtime search | Mã đơn / khách hàng | debounce(load,300) | input | 300 ms | Không | Phát 1 input; timer cũ được thay thế |
| 38 | Giao hàng web - NVGH | public/js/delivery/delivery-web-view.source/part-01.jsfrag<br>public/js/search/searchFieldsConfig.js | #deliveryCoreDeliveryStaff | Dynamic autocomplete | Mã/tên NVGH | autocomplete + deliveryCoreApply | Nút Áp dụng | Theo engine | Không | Xóa identity; click áp dụng |
| 39 | Giao hàng web - NVBH | public/js/delivery/delivery-web-view.source/part-01.jsfrag<br>public/js/search/searchFieldsConfig.js | #deliveryCoreSalesStaff | Dynamic autocomplete | Mã/tên NVBH | autocomplete + deliveryCoreApply | Nút Áp dụng | Theo engine | Không | Xóa identity; click áp dụng |
| 40 | Mobile bán hàng - khách | public/mobile/sales.html<br>public/mobile/js/sales.source/part-01.jsfrag | #customerSearch | Mobile search | Mã / tên / SĐT / địa chỉ | debounce(loadCustomers,250) | input | 250 ms | Native browser | Ẩn native ×; phát 1 input |
| 41 | Mobile bán hàng - sản phẩm | public/mobile/sales.html<br>public/mobile/js/sales.source/part-02.jsfrag | #productSearch | Mobile autocomplete | Mã / tên sản phẩm | product autocomplete/resetSelectedProduct | input | Theo module | Native browser | Xóa selection + phát 1 input |
| 42 | Mobile bán hàng - công nợ | public/mobile/sales.html<br>public/mobile/js/sales.source/part-01.jsfrag | #debtCustomerSearch | Mobile local search | Mã / tên / SĐT khách hàng | renderDebtCustomerList() | input | Không | Native browser | Phát 1 input |
| 43 | Mobile giao hàng - đơn | public/mobile/js/delivery-mobile-view.js | #mSearch | Dynamic mobile search | Tìm khách/mã đơn | debounce(load,250) | input | 250 ms | Không | Phát 1 input |
| 44 | Mobile giao hàng - công nợ | public/mobile/js/delivery-mobile-view.js | #mDebtCustomerSearch | Dynamic mobile search | Mã / tên / SĐT khách hàng | render/filter debt customers | input | Theo module | Native browser | Ẩn native ×; phát 1 input |

## 4. Danh sách trường bị loại trừ

| Nhóm | Ví dụ | Lý do |
|---|---|---|
| Ngày/thời gian | `#salesOrderDateFrom`, `#salesOrderDateTo`, `#fundSummaryDateFrom`, `#fundSummaryDateTo`, `#deliveryCashSubmissionDate` | Thuộc loại ngày; cấm gắn nút × |
| Số lượng | `caseQty`, `looseQty`, `conversionRate`, các input quantity | Dữ liệu nghiệp vụ, không phải tìm kiếm |
| Tiền | `#debtPaymentAmount`, `#externalDebtAmount`, `#deliveryCashSubmissionCashInput`, `#deliveryCashSubmissionBankInput` | Trường nhập tiền |
| Mật khẩu/xác nhận nguy hiểm | password, `#systemResetConfirm` | Dữ liệu bảo mật hoặc xác nhận thao tác |
| Ghi chú/nội dung | note, reason, `#importShortageReportEditNote`, `#mobileDebtCollectionNote` | Không dùng để lọc danh sách |
| Form danh mục | product/customer code, name, phone, address, taxCode | Dữ liệu tạo/sửa bản ghi |
| Quỹ - đối tượng chi | receiverCode, receiverName, bankName | Dữ liệu chứng từ, không có listener tìm kiếm |
| Hidden autocomplete | `#collectionCustomerSearch` | Field legacy `type="hidden"`; không có UI để bấm |
| Selector legacy không còn DOM | `#deliveryStaffFilter`, `#deliverySalesmanFilter` | Config cũ còn tồn tại nhưng trang hiện tại không render control |
| Select dropdown thường | status, role, fund, page size | Không phải combobox nhập từ khóa |

## 5. Phân tích phương án

### Phương án A — Helper dùng chung, production-grade — **đã chọn**

**Thiết kế**

- Registry 44 selector đã xác minh trong `clearable-search-inputs.js`.
- Helper tạo wrapper và `<button type="button">×</button>` tự động.
- Mỗi field khai báo đúng một action: `input` hoặc `click` nút hiện hữu.
- Autocomplete engine bổ sung `cancel()` và `clear()` để hủy debounce, vô hiệu response cũ và xóa selection.
- MutationObserver chỉ theo dõi ba root có render động, không theo dõi toàn bộ `document.body`.
- Một stylesheet dùng chung cho desktop/mobile/dark mode.

**Lợi ích**

- Đồng nhất giao diện và accessibility.
- Không lặp handler theo từng màn hình.
- Kiểm soát chặt danh sách field, không quét mọi `input[type=text]`.
- Hỗ trợ field động và autocomplete.
- Dễ thêm field mới bằng một rule.

**Nhược điểm**

- Registry phải được cập nhật khi có màn hình tìm kiếm mới.
- Cần hiểu action của từng field trước khi thêm rule.

**Effort:** Medium.  
**Rủi ro:** Thấp sau khi có registry, test và duplicate guard.  
**Mobile:** Tương thích; vùng bấm 30×30 px dưới 640 px.

### Phương án B — Vá cục bộ từng màn hình

**Lợi ích:** Dễ hiểu trong từng module, ít abstraction ban đầu.  
**Nhược điểm:** Lặp HTML/CSS/JS, khó giữ accessibility, dễ gọi API hai lần, khó hỗ trợ render động.  
**Effort:** Medium–Hard do 44 field.  
**Rủi ro:** Trung bình–cao; hành vi dễ lệch giữa web/mobile.  
**Khả năng mở rộng:** Kém.

## 6. Danh sách file thay đổi

```text
public/css/97-clearable-search-inputs.css                         [Mới]
public/js/ui/clearable-search-inputs.js                           [Mới]
public/js/search/autocompleteEngine.js                            [Sửa]
public/js/bootstrap/02-delivery-system.js                         [Sửa]
public/index.shell.html                                           [Sửa]
public/fragments/index/07-index-body.html                         [Sửa]
public/mobile/sales.html                                          [Sửa]
public/mobile/delivery.html                                       [Sửa]
test/clearable-search-inputs.test.js                              [Mới]
test/clearable-search-acceptance.test.js                          [Mới]
test/fixtures/index-page/phase79-assembled.sha256                 [Cập nhật có chủ đích]
```

Không sửa backend, route, controller, service nghiệp vụ, schema hoặc package.

## 7. Diff quan trọng

### 7.1 Registry và đúng một action cho mỗi field

**Mã cũ**

```javascript
// Không có cơ chế dùng chung; type=search phụ thuộc dấu × của trình duyệt.
```

**Mã mới**

```javascript
const FIELD_RULES = [
  { selector: '#searchInput', action: 'click', trigger: '#applyProductFiltersButton' },
  { selector: '#salesOrderSearchInput', action: 'input' },
  { selector: '#salesProductSearch', action: 'input', autocomplete: true },
  { selector: '#deliveryCashSubmissionStaffCode', action: 'input' }
  // ...44 selector đã khảo sát
];
```

**Lý do:** Không suy đoán theo `type=text`; giữ nguyên cơ chế từng màn hình và ngăn request kép.

### 7.2 Nút xóa có accessibility

```javascript
const button = document.createElement('button');
button.type = 'button';
button.className = 'search-clear-button';
button.setAttribute('aria-label', 'Xóa nội dung tìm kiếm');
button.setAttribute('title', 'Xóa tìm kiếm');
button.textContent = '×';
```

### 7.3 Xóa autocomplete an toàn

```javascript
SearchAutocomplete.clear(input);
input.value = '';
// xóa fill target, selectedId, code/name/type/label, object đang chọn
// đóng dropdown và chỉ phát một event theo rule
```

`autocompleteEngine.js` bổ sung:

```javascript
wrapped.cancel = () => clearTimeout(timer);
const cancelPending = () => {
  requestSeq++;
  refresh.cancel();
  hide(box);
};
```

**Lý do:** Request cũ không được render lại sau khi đã xóa; hidden ID không còn treo.

### 7.4 Chống listener API trùng ở quản lý người dùng

**Mã cũ**

```javascript
userSearchInput.addEventListener('input', loadUsers);
// đồng thời module users còn debounce(loadUsers, 250)
```

**Mã mới**

```javascript
// userSearchInput is owned by app/admin/08b-users.js (debounced);
// do not bind a second API request here.
```

### 7.5 CSS không phá layout

- Wrapper `inline-flex`, `min-width:0`, không đặt height.
- Input giữ width/height hiện tại.
- Padding phải dùng CSS variable và inline `!important` để thắng selector legacy ID + `!important`.
- Nút 28×28 desktop, 30×30 mobile.
- Ẩn `::-webkit-search-cancel-button` để không có hai dấu ×.
- Có hover, active, focus-visible, disabled và dark mode.

## 8. Kết quả kiểm thử

### 8.1 Test chuyên biệt

| Nhóm | Số test | Kết quả | Ghi chú |
|---|---:|---:|---|
| 39 tiêu chí nghiệm thu bắt buộc | 39 | 39 đạt | Basic, debounce, autocomplete, UI, loại trừ, accessibility |
| Registry/kiến trúc/component | 11 | 11 đạt | Đúng 44 selector, không listener trùng, observer giới hạn |
| Tổng test riêng | **50** | **50 đạt** | Không lỗi |

### 8.2 Regression toàn dự án

| Hạng mục | ZIP gốc | Bản vá | Đánh giá |
|---|---:|---:|---|
| Tổng test | 734 | 784 | Bản vá thêm 50 test chuyên biệt |
| Kết quả | 730 đạt / 4 lỗi | 780 đạt / 4 lỗi | Không phát sinh lỗi mới |
| Cú pháp JavaScript | — | 828 file đạt | PASS |
| Source bundle | — | 18/18 | PASS |
| OpenAPI | — | 306 operations | Không đổi contract |
| Path portability | — | 997 paths | PASS |
| Source size budget | — | PASS | Không tạo God File |
| Enterprise smoke | — | 10 modules, 9 flags | PASS |
| npm audit | — | 0 vulnerabilities | PASS |

Bốn lỗi có sẵn trong ZIP gốc:

1. Cache-version test của DMS inventory.
2. Hai assertion cũ của import worker về `importMode`.
3. Cache-version test của sales-order source shard.

Đây là lỗi nền, không liên quan patch nút × và không được sửa lan phạm vi.

## 9. Đánh giá side effect

| Vùng ảnh hưởng | Kết luận |
|---|---|
| API contract | Không đổi |
| Request parameters | Không đổi; helper gọi lại handler/nút hiện hữu |
| Phân trang | Field realtime tiếp tục reset trang qua handler cũ; field button dùng đúng nút apply |
| Debounce | Timer cũ được thay thế; không thêm debounce thứ hai |
| Autocomplete | Xóa text, hidden ID/code/name, selected item, dropdown và vô hiệu response cũ |
| URL query/history | Không reset URL hoặc filter khác; giữ hành vi module hiện hữu |
| Mobile | Dùng chung helper/CSS; vùng bấm lớn hơn; field động được hỗ trợ |
| Modal/tab động | Observer giới hạn ở `.app`, `.sales-app-page`, `#mobileDeliveryRoot` |
| Bộ lọc khác | Không gọi `form.reset()`, không quét/xóa input khác |
| Hiệu năng | Registry 44 selector; WeakMap chống bind lặp; observer không theo dõi body; đồng bộ value chỉ trên managed input |
| Backend/dữ liệu | Không tác động |

## 10. Giới hạn kiểm chứng

- Đã kiểm tra tự động cấu trúc desktop/mobile, CSS responsive, DOM contract, event và regression.
- Chromium headless của môi trường CI không khởi chạy ổn định do giới hạn sandbox/DBus; không dùng kết quả screenshot giả để tuyên bố pixel-perfect.
- Không có lỗi JavaScript mới qua syntax gate và test classic-script global scope.

## 11. Tiêu chí nghiệm thu

- 44/44 trường tìm kiếm hợp lệ có cơ chế × dùng chung.
- Trường ngày/thời gian, số, tiền, mật khẩu, ghi chú không bị tác động.
- Nút chỉ hiện khi có giá trị và bị `hidden` thật khi rỗng.
- Không reload trang, không reset form, không xóa filter khác.
- Không phát đồng thời `input` + `change`.
- Realtime debounce dùng `input` để thay timer cũ; button-search dùng đúng nút hiện hữu.
- Autocomplete không giữ mã/ID ẩn hoặc response cũ.
- Không nhân đôi listener.
- Không hiển thị hai dấu ×.
- Accessibility đầy đủ bằng button native, Tab, Enter, Space, aria-label và focus-visible.
