'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const helper = read('public/js/ui/clearable-search-inputs.js');
const css = read('public/css/97-clearable-search-inputs.css');
const autocomplete = read('public/js/search/autocompleteEngine.js');

function loadRules() {
  const document = { readyState: 'loading', addEventListener() {} };
  const window = { addEventListener() {}, setInterval() { return 1; } };
  vm.runInNewContext(helper, {
    window,
    document,
    Event: class Event {},
    MutationObserver: class MutationObserver {},
    Node: { ELEMENT_NODE: 1 },
    queueMicrotask,
    console
  });
  return Array.from(window.ClearableSearchInputs.rules, (rule) => ({ ...rule }));
}

const rules = loadRules();
const selectors = new Set(rules.map((rule) => rule.selector));

// Hành vi cơ bản (1-10)
test('01. Trường rỗng không hiển thị nút xóa', () => assert.match(helper, /button\.hidden = true/));
test('02. Nhập một ký tự làm nút xóa xuất hiện', () => assert.match(helper, /state\.button\.hidden = !hasValue/));
test('03. Bấm nút xóa đặt đúng input về chuỗi rỗng', () => assert.match(helper, /input\.value = ''/));
test('04. Sau khi xóa nút được đồng bộ và biến mất', () => assert.match(helper, /input\.value = '';[\s\S]{0,180}syncControl\(input\)/));
test('05. Không reset các bộ lọc khác', () => assert.doesNotMatch(helper, /\.reset\(\)/));
test('06. Kết quả rỗng đi qua đúng action hiện hữu', () => {
  assert.deepEqual([...new Set(rules.map((rule) => rule.action))].sort(), ['click', 'input']);
  rules.filter((rule) => rule.action === 'click').forEach((rule) => assert.ok(rule.trigger));
});
test('07. Không reload toàn trang', () => {
  assert.doesNotMatch(helper, /location\.reload|window\.location|document\.location/);
});
test('08. Nút không submit form ngoài ý muốn', () => assert.match(helper, /button\.type = 'button'/));
test('09. Mỗi rule chỉ có một action, không phát input và change đồng thời', () => {
  assert.ok(rules.every((rule) => ['click', 'input'].includes(rule.action)));
  assert.doesNotMatch(helper, /new Event\('change'/);
});
test('10. Sau khi xóa con trỏ trở lại input', () => assert.match(helper, /input\.focus\(\{ preventScroll: true \}\)/));

// Debounce/request/pagination (11-14)
test('11. Xóa khi debounce chưa chạy sẽ hủy timer autocomplete cũ', () => assert.match(autocomplete, /wrapped\.cancel[\s\S]*clearTimeout/));
test('12. Xóa khi request gợi ý đang chạy sẽ vô hiệu response cũ', () => assert.match(autocomplete, /requestSeq\+\+/));
test('13. Response autocomplete cũ không được render sau clear', () => {
  assert.match(autocomplete, /const seq = \+\+requestSeq/);
  assert.match(autocomplete, /seq !== requestSeq/);
});
test('14. Trường phân trang dùng lại nút apply/input hiện hữu để reset trang đúng module', () => {
  assert.ok(selectors.has('#deliveryCashSubmissionStaffCode'));
  const paged = ['#salesOrderSearchInput', '#masterOrderSearch', '#returnOrderSearchInput', '#fundSearchInput', '#reportSearchInput'];
  paged.forEach((selector) => assert.ok(selectors.has(selector)));
  paged.map((selector) => rules.find((rule) => rule.selector === selector)).forEach((rule) => assert.ok(rule.action));
});

// Autocomplete (15-19)
test('15. Xóa tên hiển thị autocomplete', () => assert.match(helper, /input\.value = ''/));
test('16. Xóa mã hoặc ID ẩn theo cấu hình fill', () => {
  assert.match(helper, /\(config\.fill \|\| \[\]\)\.forEach/);
  assert.match(helper, /target\.value = ''/);
});
test('17. Xóa trạng thái item được chọn', () => {
  assert.match(helper, /selectedId/);
  assert.match(helper, /delete element\.dataset\[key\]/);
  assert.match(helper, /__selectedSalesProduct = null/);
});
test('18. Đóng và làm rỗng dropdown gợi ý', () => {
  assert.match(helper, /box\.hidden = true/);
  assert.match(helper, /box\.innerHTML = ''/);
});
test('19. Không giữ filter ẩn sau khi text đã rỗng', () => {
  assert.match(helper, /targetHidden/);
  assert.match(helper, /hiddenTarget\.value = ''/);
});

// Giao diện (20-28)
test('20. Padding phải bảo vệ placeholder khỏi nút xóa', () => assert.match(css, /padding-right:38px!important/));
test('21. Nội dung dài không bị nút che', () => {
  assert.match(css, /box-sizing:border-box/);
  assert.match(css, /padding-right:41px!important/);
});
test('22. Wrapper không thay đổi chiều cao input', () => {
  assert.match(css, /display:inline-flex/);
  assert.doesNotMatch(css, /\.clearable-search-control[^}]*height:/);
});
test('23. Layout desktop giữ min-width và max-width an toàn', () => {
  assert.match(css, /min-width:0/);
  assert.match(css, /max-width:100%/);
});
test('24. Mobile có vùng bấm tối thiểu 30x30', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /width:30px/);
  assert.match(css, /height:30px/);
});
test('25. Nút có z-index riêng và không chồng dropdown', () => {
  assert.match(css, /z-index:3/);
  assert.match(css, /clearable-search-control \+ \.suggestions/);
});
test('26. Nút xóa native của input search bị ẩn', () => assert.match(css, /::-webkit-search-cancel-button/));
test('27. Trường modal/tab render động được khởi tạo bằng observer giới hạn', () => {
  assert.match(helper, /MutationObserver/);
  assert.match(helper, /\['\.app', '\.sales-app-page', '#mobileDeliveryRoot'\]/);
  assert.doesNotMatch(helper, /observe\(document\.body/);
});
test('28. Có quy tắc dark mode', () => {
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /\[data-theme="dark"\]/);
});

// Loại trừ (29-33)
test('29. Trường Từ ngày không nằm trong registry', () => {
  ['#salesOrderDateFrom', '#fundSummaryDateFrom', '#debtFromDate'].forEach((selector) => assert.ok(!selectors.has(selector)));
});
test('30. Trường Đến ngày không nằm trong registry', () => {
  ['#salesOrderDateTo', '#fundSummaryDateTo', '#debtToDate'].forEach((selector) => assert.ok(!selectors.has(selector)));
});
test('31. Date picker tùy chỉnh và các type thời gian bị chặn', () => assert.match(helper, /date', 'datetime-local', 'time', 'month', 'week'/));
test('32. Trường tiền và số lượng bị chặn', () => {
  assert.match(helper, /'number'/);
  ['#paidAmountInput', '#caseQtyInput', '#looseQtyInput', '#debtPaymentAmount'].forEach((selector) => assert.ok(!selectors.has(selector)));
});
test('33. Trường ghi chú không nằm trong registry', () => {
  ['#mobileDebtCollectionNote', '#importShortageReportEditNote', '#returnNote'].forEach((selector) => assert.ok(!selectors.has(selector)));
});

// Accessibility (34-39)
test('34. Nút là phần tử button có thể Tab tới mặc định', () => {
  assert.match(helper, /document\.createElement\('button'\)/);
  assert.doesNotMatch(helper, /tabindex|-1/);
});
test('35. Enter kích hoạt hành vi native của button', () => {
  assert.match(helper, /button\.addEventListener\('click'/);
  assert.doesNotMatch(helper, /keydown[^\n]*preventDefault/);
});
test('36. Space kích hoạt hành vi native của button', () => {
  assert.match(helper, /button\.type = 'button'/);
  assert.match(helper, /button\.addEventListener\('click'/);
});
test('37. Có aria-label mô tả đúng chức năng', () => assert.match(helper, /aria-label', 'Xóa nội dung tìm kiếm'/));
test('38. Có focus-visible rõ ràng', () => assert.match(css, /\.search-clear-button:focus-visible\{outline:2px solid/));
test('39. Có title và text × nhưng screen reader dùng nhãn ngữ nghĩa', () => {
  assert.match(helper, /title', 'Xóa tìm kiếm'/);
  assert.match(helper, /button\.textContent = '×'/);
});
