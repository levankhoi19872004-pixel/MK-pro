(function () {
  'use strict';

  var rootId = 'deliveryTodayNewRoot';
  var state = { rows: [], selectedIndex: -1, loaded: false, versionCache: {} };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function num(value) { var n = Number(String(value || 0).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
  function money(value) { return num(value).toLocaleString('vi-VN'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function isConfirmed(row) { return row && (row.accountingConfirmed || row.closeoutStatus === 'accounting_confirmed' || row.closeoutStatus === 'corrected_confirmed'); }
  function statusLabel(row) {
    if (isConfirmed(row)) return 'Đã xác nhận';
    var status = String((row && (row.closeoutStatus || row.status)) || 'pending').toLowerCase();
    if (status === 'pending' || status === 'draft') return 'Chưa chốt';
    if (status === 'delivered') return 'Đã giao';
    return status;
  }

  function ensureRoot() {
    var root = byId(rootId);
    if (!root) return null;
    if (root.dataset.phase99UiReady === '1') return root;
    root.dataset.phase99UiReady = '1';
    root.innerHTML = '' +
      '<section class="card delivery-v46-header delivery-new-header">' +
        '<div>' +
          '<h2>Đơn giao hôm nay (New)</h2>' +
          '<p class="muted">Luồng chuẩn: <b>Giao hàng → Thu tiền → Chốt kế toán</b>. Đơn đã xác nhận chỉ điều chỉnh bằng phiên bản mới, không sửa ngược bản cũ.</p>' +
        '</div>' +
        '<div class="delivery-v46-filters">' +
          '<label>Ngày giao<input id="deliveryTodayNewDate" type="date"></label>' +
          '<label>NVGH<input id="deliveryTodayNewDelivery" autocomplete="off" placeholder="Mã/tên NVGH"></label>' +
          '<label>NVBH<input id="deliveryTodayNewSalesman" autocomplete="off" placeholder="Mã/tên NVBH"></label>' +
          '<label>Tìm kiếm<input id="deliveryTodayNewSearch" placeholder="Mã đơn / khách hàng"></label>' +
          '<button id="deliveryTodayNewLoad" type="button">Tải đơn</button>' +
          '<button id="deliveryTodayNewReset" type="button" class="secondary">Xóa lọc</button>' +
        '</div>' +
      '</section>' +
      '<section class="delivery-v46-kpis delivery-new-kpis" aria-label="KPI Đơn giao hôm nay New">' +
        '<div class="delivery-v46-kpi kpi-pt"><span>Phải thu</span><b id="deliveryTodayNewOriginal">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-tm"><span>Tiền mặt</span><b id="deliveryTodayNewCash">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ck"><span>Chuyển khoản</span><b id="deliveryTodayNewBank">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-th"><span>Trả thưởng</span><b id="deliveryTodayNewReward">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ht"><span>Hàng trả</span><b id="deliveryTodayNewReturned">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-cn"><span>Còn nợ</span><b id="deliveryTodayNewDebt">0</b></div>' +
      '</section>' +
      '<main class="delivery-v46-layout delivery-new-layout">' +
        '<section class="card delivery-v46-list-panel">' +
          '<div class="delivery-v46-panel-title delivery-v46-panel-title-with-actions"><h3>Danh sách đơn</h3><div class="delivery-v46-list-actions"><span id="deliveryTodayNewOrderCount">0 đơn</span></div></div>' +
          '<div class="mk-delivery-list-head mk-delivery-list-grid delivery-new-list-grid"><span>Đơn / Khách hàng</span><span>PT</span><span>TM</span><span>CK</span><span>TH</span><span>HT</span><span>CN</span><span>Trạng thái</span></div>' +
          '<div id="deliveryTodayNewTable" class="delivery-v46-list"><div class="empty-state">Chưa tải đơn.</div></div>' +
        '</section>' +
        '<aside class="card delivery-v46-detail-panel"><div id="deliveryTodayNewDetail" class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div></aside>' +
      '</main>' +
      '<p id="deliveryTodayNewMessage" class="message"></p>' +
      '<section id="deliveryTodayNewCorrectionModal" class="card delivery-new-correction-modal" hidden></section>';

    var dateInput = byId('deliveryTodayNewDate');
    if (dateInput && !dateInput.value) dateInput.value = today();
    var loadButton = byId('deliveryTodayNewLoad');
    var resetButton = byId('deliveryTodayNewReset');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', function () {
      ['deliveryTodayNewSearch', 'deliveryTodayNewDelivery', 'deliveryTodayNewSalesman'].forEach(function (id) { var el = byId(id); if (el) el.value = ''; });
      load();
    });
    ['deliveryTodayNewSearch', 'deliveryTodayNewDelivery', 'deliveryTodayNewSalesman'].forEach(function (id) {
      var el = byId(id);
      if (el) el.addEventListener('keydown', function (event) { if (event.key === 'Enter') load(); });
    });
    ensureScopedStyle();
    return root;
  }

  function ensureScopedStyle() {
    if (document.getElementById('deliveryTodayNewScopedStyle')) return;
    var style = document.createElement('style');
    style.id = 'deliveryTodayNewScopedStyle';
    style.textContent = '' +
      '.delivery-new-list-grid{grid-template-columns:minmax(210px,1.8fr) 90px 90px 90px 90px 90px 95px 105px;}' +
      '.delivery-new-row{display:grid;grid-template-columns:minmax(210px,1.8fr) 90px 90px 90px 90px 90px 95px 105px;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe7f5;cursor:pointer;}' +
      '.delivery-new-row:hover,.delivery-new-row.active{background:#eff6ff;}' +
      '.delivery-new-row b{font-weight:800;}.delivery-new-row small{display:block;color:#334155;margin-top:3px;}' +
      '.delivery-new-money{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}' +
      '.delivery-new-return{color:#078b20;}.delivery-new-debt{color:#e11d24;}.delivery-new-zero{color:#0f8a35;}' +
      '.delivery-new-status{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;background:#eef2ff;color:#1d0fb4;font-weight:800;font-size:12px;}' +
      '.delivery-new-status.confirmed{background:#dcfce7;color:#166534;}.delivery-new-detail-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;}' +
      '.delivery-new-detail-title h3{margin:0;}.delivery-new-detail-title small{display:block;color:#475569;margin-top:3px;}' +
      '.delivery-new-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:10px 0;}' +
      '.delivery-new-detail-cell{border:1px solid #dbe7f5;border-radius:10px;padding:9px 10px;background:#fff;}.delivery-new-detail-cell span{display:block;color:#64748b;font-size:12px;}.delivery-new-detail-cell b{display:block;text-align:right;font-size:16px;margin-top:4px;}' +
      '.delivery-new-safe-note{border:1px solid #bae6fd;background:#eff6ff;border-radius:10px;padding:10px 12px;color:#075985;font-weight:700;margin:8px 0;}' +
      '.delivery-new-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}.delivery-new-version-list{margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:8px;color:#334155;}' +
      '.delivery-new-correction-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;width:min(900px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;box-shadow:0 18px 50px rgba(15,23,42,.35);}' +
      '.delivery-new-form-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;}.delivery-new-form-grid label{font-weight:700;color:#0f172a;}.delivery-new-form-grid input{width:100%;}.delivery-new-form-grid .wide{grid-column:span 2;}' +
      '@media(max-width:1100px){.delivery-new-list-grid,.delivery-new-row{grid-template-columns:minmax(180px,1.5fr) 80px 80px 80px 80px 80px 85px;}.delivery-new-list-grid span:nth-child(8),.delivery-new-row span:nth-child(8){display:none;}}' +
      '@media(max-width:760px){.delivery-new-list-grid{display:none;}.delivery-new-row{grid-template-columns:1fr 1fr;}.delivery-new-detail-grid{grid-template-columns:1fr;}.delivery-new-form-grid{grid-template-columns:1fr;}.delivery-new-form-grid .wide{grid-column:span 1;}}';
    document.head.appendChild(style);
  }

  function filters() {
    return {
      date: byId('deliveryTodayNewDate') ? byId('deliveryTodayNewDate').value : '',
      q: byId('deliveryTodayNewSearch') ? byId('deliveryTodayNewSearch').value.trim() : '',
      delivery: byId('deliveryTodayNewDelivery') ? byId('deliveryTodayNewDelivery').value.trim() : '',
      salesman: byId('deliveryTodayNewSalesman') ? byId('deliveryTodayNewSalesman').value.trim() : ''
    };
  }

  function setMessage(text, isError) {
    var message = byId('deliveryTodayNewMessage');
    if (!message) return;
    message.textContent = text || '';
    message.className = 'message' + (isError ? ' error-text' : '');
  }

  function applySummary(summary) {
    summary = summary || {};
    var pairs = {
      deliveryTodayNewOrderCount: (summary.orderCount || state.rows.length) + ' đơn',
      deliveryTodayNewOriginal: money(summary.originalAmount),
      deliveryTodayNewCash: money(summary.cashAmount || 0),
      deliveryTodayNewBank: money(summary.bankAmount || 0),
      deliveryTodayNewReward: money((summary.rewardAmount || 0) + (summary.offsetAmount || 0)),
      deliveryTodayNewReturned: money(summary.returnedAmount),
      deliveryTodayNewDebt: money(summary.finalDebtAmount)
    };
    Object.keys(pairs).forEach(function (id) { var el = byId(id); if (el) el.textContent = pairs[id]; });
  }

  function renderRows() {
    var list = byId('deliveryTodayNewTable');
    if (!list) return;
    if (!state.rows.length) {
      list.innerHTML = '<div class="empty-state">Không có đơn theo bộ lọc.</div>';
      renderDetail(null);
      return;
    }
    list.innerHTML = state.rows.map(function (row, index) {
      var confirmed = isConfirmed(row);
      var debtClass = num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero';
      return '<div role="button" tabindex="0" data-index="' + index + '" class="delivery-new-row ' + (index === state.selectedIndex ? 'active' : '') + '">' +
        '<span><b>' + esc(row.orderCode || row.orderId) + '</b><small>' + esc(row.customerName || '') + ' · ' + esc(row.customerCode || '') + '</small></span>' +
        '<span class="delivery-new-money">' + money(row.originalAmount) + '</span>' +
        '<span class="delivery-new-money">' + money(row.cashAmount) + '</span>' +
        '<span class="delivery-new-money">' + money(row.bankAmount) + '</span>' +
        '<span class="delivery-new-money">' + money(num(row.rewardAmount) + num(row.offsetAmount)) + '</span>' +
        '<span class="delivery-new-money delivery-new-return">' + money(row.returnedAmount) + '</span>' +
        '<span class="delivery-new-money ' + debtClass + '">' + money(row.finalDebtAmount) + '</span>' +
        '<span><span class="delivery-new-status ' + (confirmed ? 'confirmed' : '') + '">' + esc(statusLabel(row)) + '</span></span>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-index]'), function (rowEl) {
      function select() {
        state.selectedIndex = Number(rowEl.dataset.index);
        renderRows();
        renderDetail(state.rows[state.selectedIndex]);
      }
      rowEl.addEventListener('click', select);
      rowEl.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    });
    if (state.selectedIndex < 0) {
      state.selectedIndex = 0;
      renderRows();
      return;
    }
    renderDetail(state.rows[state.selectedIndex]);
  }

  function detailCell(label, value, className) {
    return '<div class="delivery-new-detail-cell"><span>' + esc(label) + '</span><b class="' + (className || '') + '">' + esc(value) + '</b></div>';
  }

  function renderDetail(row) {
    var box = byId('deliveryTodayNewDetail');
    if (!box) return;
    if (!row) { box.innerHTML = '<div class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div>'; return; }
    var confirmed = isConfirmed(row);
    box.innerHTML = '' +
      '<div class="delivery-new-detail-title"><div><h3>' + esc(row.orderCode || row.orderId) + '</h3><small>' + esc(row.customerCode || '') + ' · ' + esc(row.customerName || '') + '</small></div><span class="delivery-new-status ' + (confirmed ? 'confirmed' : '') + '">' + esc(statusLabel(row)) + '</span></div>' +
      '<div class="delivery-new-safe-note">' + (confirmed ? 'Đơn đã xác nhận kế toán. Nếu cần sửa hàng trả hoặc tiền thu, hãy tạo điều chỉnh để sinh version mới.' : 'Đơn chưa chốt kế toán. Tiếp tục xử lý theo luồng giao hàng trước khi xác nhận.') + '</div>' +
      '<div class="delivery-new-detail-grid">' +
        detailCell('Phải thu', money(row.originalAmount)) +
        detailCell('Tiền mặt', money(row.cashAmount)) +
        detailCell('Chuyển khoản', money(row.bankAmount)) +
        detailCell('Trả thưởng / đối trừ', money(num(row.rewardAmount) + num(row.offsetAmount))) +
        detailCell('Hàng trả', money(row.returnedAmount), 'delivery-new-return') +
        detailCell('Công nợ cuối', money(row.finalDebtAmount), num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
      '</div>' +
      '<div class="new-detail-row"><span>NVBH</span><b>' + esc((row.salesStaffCode || '') + ' - ' + (row.salesStaffName || '')) + '</b></div>' +
      '<div class="new-detail-row"><span>NVGH</span><b>' + esc((row.deliveryStaffCode || '') + ' - ' + (row.deliveryStaffName || '')) + '</b></div>' +
      '<div class="new-detail-row"><span>Phiên bản closeout</span><b>v' + esc(row.version || 0) + (row.correctionVersionApplied ? ' · có điều chỉnh' : '') + '</b></div>' +
      (row.correctionVersionApplied ? '<div class="new-detail-row"><span>Mã điều chỉnh</span><b>' + esc(row.correctionCode || row.correctionId || '') + '</b></div>' : '') +
      (confirmed ? '<div class="delivery-new-detail-actions"><button id="deliveryTodayNewCorrectionOpen" type="button" class="primary-action">Tạo điều chỉnh</button><button id="deliveryTodayNewVersionsLoad" type="button" class="secondary">Xem lịch sử version</button></div>' : '') +
      '<div id="deliveryTodayNewVersionList" class="delivery-new-version-list"></div>';
    var openBtn = byId('deliveryTodayNewCorrectionOpen');
    if (openBtn) openBtn.addEventListener('click', function () { openCorrectionModal(row); });
    var versionsBtn = byId('deliveryTodayNewVersionsLoad');
    if (versionsBtn) versionsBtn.addEventListener('click', function () { loadVersions(row); });
    renderCachedVersions(row);
  }

  function rowKey(row) { return String(row.orderId || row.orderCode || row.closeoutVersionId || row.correctionId || ''); }

  function correctionEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/corrections';
  }

  function versionsEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/versions';
  }

  function openCorrectionModal(row) {
    var modal = byId('deliveryTodayNewCorrectionModal');
    if (!modal || !row) return;
    modal.hidden = false;
    modal.innerHTML = '' +
      '<h3>Tạo điều chỉnh sau chốt</h3>' +
      '<div class="delivery-new-safe-note">Hệ thống sẽ tạo closeout version mới, không sửa bản cũ, không sinh AR-RETURN và không sinh AR-SALE-REVERSAL.</div>' +
      '<div class="delivery-new-form-grid">' +
        '<label>Hàng trả hiện tại<input id="deliveryCorrectionOldReturn" disabled value="' + esc(money(row.returnedAmount)) + '"></label>' +
        '<label>Hàng trả đúng<input id="deliveryCorrectionNewReturn" inputmode="numeric" value="' + esc(row.returnedAmount || 0) + '"></label>' +
        '<label>Tiền thu hiện tại<input id="deliveryCorrectionOldCash" disabled value="' + esc(money(row.collectedAmount)) + '"></label>' +
        '<label>Tiền thu đúng<input id="deliveryCorrectionNewCash" inputmode="numeric" value="' + esc(row.collectedAmount || 0) + '"></label>' +
        '<label class="wide">Lý do bắt buộc<input id="deliveryCorrectionReason" placeholder="Ví dụ: kế toán nhập thiếu tiền thu"></label>' +
        '<label class="wide">Ghi chú<input id="deliveryCorrectionNote" placeholder="Ghi chú thêm nếu có"></label>' +
      '</div>' +
      '<div id="deliveryCorrectionPreview" class="delivery-new-safe-note"></div>' +
      '<div class="delivery-new-detail-actions"><button id="deliveryCorrectionSubmit" type="button" class="primary-action">Lưu điều chỉnh</button><button id="deliveryCorrectionCancel" type="button" class="secondary">Đóng</button></div>';

    function preview() {
      var returnDelta = num(byId('deliveryCorrectionNewReturn').value) - num(row.returnedAmount);
      var cashDelta = num(byId('deliveryCorrectionNewCash').value) - num(row.collectedAmount);
      var debtDelta = -returnDelta - cashDelta;
      var box = byId('deliveryCorrectionPreview');
      if (box) box.textContent = 'Xem trước: hàng trả ' + money(returnDelta) + ' · tiền thu ' + money(cashDelta) + ' · công nợ ' + money(debtDelta);
    }
    ['deliveryCorrectionNewReturn', 'deliveryCorrectionNewCash'].forEach(function (id) {
      var el = byId(id);
      if (el) el.addEventListener('input', preview);
    });
    preview();

    var cancel = byId('deliveryCorrectionCancel');
    if (cancel) cancel.addEventListener('click', function () { modal.hidden = true; modal.innerHTML = ''; });
    var submit = byId('deliveryCorrectionSubmit');
    if (submit) submit.addEventListener('click', function () { submitCorrection(row); });
  }

  async function submitCorrection(row) {
    var returnDelta = num(byId('deliveryCorrectionNewReturn').value) - num(row.returnedAmount);
    var cashDelta = num(byId('deliveryCorrectionNewCash').value) - num(row.collectedAmount);
    var reason = byId('deliveryCorrectionReason') ? byId('deliveryCorrectionReason').value.trim() : '';
    var note = byId('deliveryCorrectionNote') ? byId('deliveryCorrectionNote').value.trim() : '';
    if (!reason) { setMessage('Bắt buộc nhập lý do điều chỉnh.', true); return; }
    if (!returnDelta && !cashDelta) { setMessage('Không có chênh lệch để điều chỉnh.', true); return; }
    try {
      var res = await fetch(correctionEndpoint(row), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnAdjustmentAmount: returnDelta, cashAdjustmentAmount: cashDelta, reason: reason, note: note })
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tạo được điều chỉnh');
      var modal = byId('deliveryTodayNewCorrectionModal');
      if (modal) { modal.hidden = true; modal.innerHTML = ''; }
      setMessage('Đã tạo điều chỉnh và closeout version mới.');
      await load();
    } catch (err) {
      setMessage(err.message || 'Không tạo được điều chỉnh', true);
    }
  }

  function renderCachedVersions(row) {
    var box = byId('deliveryTodayNewVersionList');
    if (!box || !row) return;
    var versions = state.versionCache[rowKey(row)] || [];
    if (!versions.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<b>Lịch sử version</b><br>' + versions.map(function (v) {
      return 'v' + esc(v.closeoutVersion || '?') + ' · CN ' + money(v.finalDebtAmount || v.debtAmount) + ' · ' + esc(v.status || 'confirmed');
    }).join('<br>');
  }

  async function loadVersions(row) {
    try {
      var res = await fetch(versionsEndpoint(row));
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được version');
      state.versionCache[rowKey(row)] = json.versions || json.rows || [];
      renderCachedVersions(row);
      setMessage('Đã tải lịch sử version.');
    } catch (err) {
      setMessage(err.message || 'Không tải được lịch sử version', true);
    }
  }

  async function load() {
    ensureRoot();
    setMessage('Đang tải đơn giao hôm nay...');
    try {
      var params = new URLSearchParams(filters());
      var res = await fetch('/api/new/delivery-today/orders?' + params.toString());
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu');
      var data = json.data || json;
      state.rows = data.rows || data.orders || json.rows || [];
      state.selectedIndex = state.rows.length ? 0 : -1;
      state.loaded = true;
      applySummary(data.summary || json.summary || {});
      renderRows();
      setMessage('Đã tải ' + state.rows.length + ' đơn.');
    } catch (err) {
      state.rows = [];
      applySummary({});
      renderRows();
      setMessage(err.message || 'Không tải được Đơn giao hôm nay (New)', true);
    }
  }

  function initWhenTabActive(tabId) {
    if (tabId !== 'deliveryTodayNewTab') return;
    ensureRoot();
    if (!state.loaded) load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureRoot();
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button[data-tab="deliveryTodayNewTab"]'), function (button) {
      button.addEventListener('click', function () { initWhenTabActive('deliveryTodayNewTab'); });
    });
  });

  window.loadDeliveryTodayNew = load;
}());
