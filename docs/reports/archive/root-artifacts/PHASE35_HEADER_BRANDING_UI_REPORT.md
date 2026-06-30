# PHASE35 — HEADER BRANDING UI REPORT

## 1. Khảo sát hệ thống

### File đã kiểm tra

| File | Vai trò |
|---|---|
| `public/fragments/index/01-index-body.html` | Chứa header/topbar chính, menu trái và phần đầu body của web admin |
| `public/index.shell.html` | Shell HTML, title trình duyệt và danh sách CSS/JS được nạp |
| `public/index.html` | Trang fallback khi truy cập trực tiếp file tĩnh |
| `public/css/base/00-base-01.css` | CSS base cũ cho `.header`, `.status` |
| `public/css/base/00-base-02.css` | CSS compact override cũ cho `.header`, `.status` |
| `public/css/overrides/10-operational-02.css` | CSS của badge speed monitor/API performance |
| `public/js/auth-guard.js` | Gắn thông tin tài khoản và nút đăng xuất lên header |
| `public/js/app/01-utils-print-tabs.js` | Cập nhật trạng thái `serverStatus` qua `/api/health` |
| `public/js/utils/v45-speed-monitor.js` | Badge API/performance đang append trực tiếp vào header |

### Thành phần liên quan

- Header chính: `.header`
- Server status: `#serverStatus`
- User/session/logout: `auth-guard.js` → `renderAccount(user)`
- Debug/API performance: `v45-speed-monitor.js` → `ensurePanel()`

---

## 2. Nguyên nhân header hiện tại chưa hợp lý

1. Tên `KHO Minh Khai Pro V44` chưa phản ánh đúng định vị vận hành NPP Unilever Minh Khai Thái Bình.
2. Dòng `Step 6: ...` là thông tin nội bộ phát triển, không phù hợp với người dùng vận hành.
3. Badge speed/API monitor được append trực tiếp vào `.header`, khiến thông tin kỹ thuật lấn át tên hệ thống.
4. Header cũ chỉ chia dạng flex đơn giản, chưa có 3 vùng rõ ràng: thương hiệu / trạng thái / tài khoản.

---

## 3. Thiết kế giải pháp

### Cấu trúc mới

```text
brand area | server status | debug area | user action area
```

### Nội dung mới

- Tên hệ thống: `Unilever - Minh Khai Thái Bình`
- Mô tả: `Phần mềm quản lý tổng thể NPP | Lập trình: Lê Văn Khởi`
- Trạng thái: `Server đang chạy`
- Tài khoản: giữ dữ liệu user/role hiện có
- Đăng xuất: giữ nguyên cơ chế logout hiện có

### Xử lý debug/API badge

- Không hiển thị badge API/performance mặc định cho người dùng vận hành.
- Vẫn giữ logic đo hiệu năng.
- Chỉ hiện speed monitor khi bật debug qua:
  - Query string: `?debug=1`, `?v45debug=1`, `?perf=1`
  - LocalStorage: `MKPRO_DEBUG_UI=1`, `V45_DEBUG_UI=1`, `V45_SPEED_MONITOR=1`

---

## 4. File đã sửa

| File | Thay đổi |
|---|---|
| `public/fragments/index/01-index-body.html` | Đổi cấu trúc header, tên hệ thống, mô tả, thêm vùng status/debug/actions |
| `public/index.shell.html` | Đổi title trình duyệt, nạp CSS mới `98-header-branding.css` |
| `public/index.html` | Đổi title fallback |
| `public/css/base/00-base-01.css` | Cập nhật comment brand cũ |
| `public/css/98-header-branding.css` | Thêm CSS header mới, responsive, user pill, logout button, debug badge nhỏ gọn |
| `public/js/auth-guard.js` | Đưa user/role/logout vào `.app-header__actions` thay vì append trực tiếp vào header |
| `public/js/utils/v45-speed-monitor.js` | Ẩn speed monitor mặc định; chỉ render trong `.app-header__debug` khi bật debug flag |
| `test/header-branding-ui-static.test.js` | Thêm static test cho header Phase35 |

---

## 5. Diff Old/New quan trọng

### 5.1 Header HTML

Old:

```html
<header class="header">
  <div>
    <h1>KHO Minh Khai Pro V44</h1>
    <p>Step 6: Sản phẩm + khách hàng + nhập kho + bán hàng + công nợ + quỹ tiền</p>
  </div>
  <span id="serverStatus" class="status">Đang kiểm tra server...</span>
</header>
```

New:

```html
<header class="header app-header" aria-label="Tiêu đề hệ thống">
  <div class="app-header__brand">
    <h1 class="app-header__title">Unilever - Minh Khai Thái Bình</h1>
    <p class="app-header__subtitle">Phần mềm quản lý tổng thể NPP <span aria-hidden="true">|</span> Lập trình: Lê Văn Khởi</p>
  </div>
  <div class="app-header__status" aria-label="Trạng thái hệ thống">
    <span id="serverStatus" class="status status-pill status-pill--online">Đang kiểm tra server...</span>
  </div>
  <div class="app-header__debug" aria-label="Thông tin kỹ thuật" hidden></div>
  <div class="app-header__actions" aria-label="Tài khoản và phiên đăng nhập"></div>
</header>
```

Lý do: phân vùng rõ brand/status/debug/user, thay tên và mô tả theo định vị NPP.

---

### 5.2 User/logout render

Old:

```javascript
var header=document.querySelector('.header');
if(!header||header.querySelector('[data-auth-account]'))return;
var box=document.createElement('div');
box.dataset.authAccount='1';
box.style.display='flex';
box.style.alignItems='center';
box.style.gap='8px';

var info=document.createElement('span');
info.className='status';
info.textContent=(user.name||user.username||'Tài khoản')+' · '+(user.roleLabel||role||'');

var button=document.createElement('button');
button.type='button';
button.textContent='Đăng xuất';
button.className='secondary-btn';
button.style.padding='8px 12px';
button.addEventListener('click',logout);

box.appendChild(info);
box.appendChild(button);
header.appendChild(box);
```

New:

```javascript
var header=document.querySelector('.header');
if(!header||header.querySelector('[data-auth-account]'))return;
var actions=header.querySelector('.app-header__actions')||header;
var box=document.createElement('div');
box.dataset.authAccount='1';
box.className='app-header__account';

var info=document.createElement('span');
info.className='user-pill';
var accountName=user.name||user.username||'Tài khoản';
var accountRole=user.roleLabel||role||'';
info.textContent=accountRole?accountName+' · '+accountRole:accountName;

var button=document.createElement('button');
button.type='button';
button.textContent='Đăng xuất';
button.className='logout-button secondary-btn';
button.addEventListener('click',logout);

box.appendChild(info);
box.appendChild(button);
actions.appendChild(box);
```

Lý do: giữ nguyên logout/session nhưng đưa vào vùng action chuẩn.

---

### 5.3 API/debug badge

Old:

```javascript
var header = document.querySelector('.header') || document.querySelector('.mobile-header') || document.body;
header.appendChild(panel);
```

New:

```javascript
if (!isDebugMode()) {
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  var debugArea = document.querySelector('.app-header__debug');
  if (debugArea) debugArea.hidden = true;
  return null;
}

var debugArea = document.querySelector('.app-header__debug');
var header = debugArea || document.querySelector('.header') || document.querySelector('.mobile-header') || document.body;
if (debugArea) debugArea.hidden = false;
header.appendChild(panel);
```

Lý do: không để debug/performance lấn át tên hệ thống, nhưng vẫn giữ khả năng bật khi cần phân tích kỹ thuật.

---

## 6. Test thực tế

### Syntax check

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 969 JavaScript files
```

### Static test Phase35

```bash
node --test test/header-branding-ui-static.test.js
```

Kết quả:

```text
# tests 3
# pass 3
# fail 0
```

---

## 7. Regression checklist

| Hạng mục | Kết quả |
|---|---|
| Menu trái | Không sửa logic/menu |
| Điều hướng module | Không sửa tab handler |
| Tài khoản đang đăng nhập | Giữ `auth-guard.js`, chỉ đổi vị trí render |
| Nút đăng xuất | Giữ handler `logout` |
| Server status | Giữ `#serverStatus` và `checkServer()` |
| Badge performance/debug | Không xóa logic, chuyển sang debug mode |
| Module sản phẩm/khách hàng/nhập kho/bán hàng/tồn kho | Không sửa nghiệp vụ |
| Đơn tổng/đơn trả hàng/công nợ/quỹ/báo cáo | Không sửa nghiệp vụ |
| App giao hàng/app bán hàng | Không sửa mobile app |

---

## 8. Rủi ro còn lại

1. Các màn khác như `login.html`, Swagger/API docs vẫn còn brand cũ theo phạm vi cũ của hệ thống. Phase35 chỉ sửa header/topbar chính.
2. Nếu người dùng muốn đồng bộ toàn bộ thương hiệu ở login/API docs/config, nên làm phase riêng để tránh ảnh hưởng test API docs hiện tại.
3. Speed monitor bị ẩn mặc định. Khi cần debug frontend/API, bật bằng `localStorage.setItem('V45_DEBUG_UI','1')` hoặc thêm `?debug=1` vào URL.

---

## 9. Tiêu chí hoàn thành

- Header hiển thị `Unilever - Minh Khai Thái Bình`: đạt.
- Header hiển thị `Phần mềm quản lý tổng thể NPP`: đạt.
- Header hiển thị `Lập trình: Lê Văn Khởi`: đạt.
- Không còn dòng `Step 6...` ở header chính: đạt.
- Không còn `KHO Minh Khai Pro V44` ở header chính: đạt.
- User/role/logout vẫn hoạt động: đạt theo static check.
- Server status vẫn giữ: đạt.
- Badge API/debug không còn lấn át tiêu đề chính: đạt.
- `npm run check:syntax` pass: đạt.
