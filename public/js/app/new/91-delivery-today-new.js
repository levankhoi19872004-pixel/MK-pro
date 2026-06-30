(function () {
  'use strict';

  var rootId = 'deliveryTodayNewRoot';
  var state = { rows: [], selectedIndex: -1, loaded: false };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function num(value) { var n = Number(String(value || 0).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
  function money(value) { return num(value).toLocaleString('vi-VN'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function isConfirmed(row) { return row && (row.accountingConfirmed || row.closeoutStatus === 'accounting_confirmed'); }

  function ensureRoot() {
    var root = byId(rootId);
    if (!root) return null;
    if (root.dataset.phase91Ready === '1') return root;
    root.dataset.phase91Ready = '1';
    root.innerHTML = '' +
      '<section class="card">' +
        '<div class="ui-page-header">' +
          '<div><h2>Đơn giao hôm nay (New)</h2><p class="muted">Màn mới đọc <b>salesOrders.deliveryCloseout</b> + <b>returnOrders</b>. Đơn đã xác nhận chỉ chuyển sang correction, không unlock/sửa in-place.</p></div>' +
          '<div class="ui-page-actions"><span class="new-badge">V2 read contract</span></div>' +
        '</div>' +
        '<div class="new-module-toolbar" role="search" aria-label="Bộ lọc Đơn giao hôm nay New">' +
          '<label>Ngày giao<input id="deliveryTodayNewDate" type="date"></label>' +
          '<label class="wide">Tìm đơn / khách<input id="deliveryTodayNewSearch" placeholder="Mã đơn, mã KH, tên KH"></label>' +
          '<label>NVGH<input id="deliveryTodayNewDelivery" placeholder="Mã/tên NVGH"></label>' +
          '<label>NVBH<input id="deliveryTodayNewSalesman" placeholder="Mã/tên NVBH"></label>' +
          '<div class="actions"><button id="deliveryTodayNewLoad" type="button" class="primary-action">Tải New</button><button id="deliveryTodayNewReset" type="button" class="secondary">Xóa lọc</button></div>' +
        '</div>' +
        '<p id="deliveryTodayNewMessage" class="message"></p>' +
      '</section>' +
      '<section class="new-kpi-grid" aria-label="KPI Đơn giao hôm nay New">' +
        '<article class="new-kpi-card"><span>Số đơn</span><b id="deliveryTodayNewOrderCount">0</b></article>' +
        '<article class="new-kpi-card"><span>Phải thu gốc</span><b id="deliveryTodayNewOriginal">0</b></article>' +
        '<article class="new-kpi-card"><span>Hàng trả</span><b id="deliveryTodayNewReturned">0</b></article>' +
        '<article class="new-kpi-card"><span>Đã thu</span><b id="deliveryTodayNewCollected">0</b></article>' +
        '<article class="new-kpi-card"><span>Còn nợ cuối</span><b id="deliveryTodayNewDebt">0</b></article>' +
      '</section>' +
      '<section class="new-two-pane">' +
        '<section class="card"><h3>Danh sách đơn New</h3><div class="new-table-wrap"><table class="new-table"><thead><tr><th>Đơn / khách</th><th>PT</th><th>HT</th><th>Đã thu</th><th>CN cuối</th><th>Trạng thái</th></tr></thead><tbody id="deliveryTodayNewTable"><tr><td colspan="6">Chưa tải dữ liệu.</td></tr></tbody></table></div></section>' +
        '<section class="card"><h3>Chi tiết closeout</h3><div id="deliveryTodayNewDetail" class="new-detail-list"><div class="empty-state">Chọn một đơn để xem chi tiết.</div></div></section>' +
      '</section>' +
      '<section id="deliveryTodayNewCorrectionModal" class="card" hidden></section>';

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
    return root;
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
      deliveryTodayNewOrderCount: summary.orderCount || state.rows.length,
      deliveryTodayNewOriginal: money(summary.originalAmount),
      deliveryTodayNewReturned: money(summary.returnedAmount),
      deliveryTodayNewCollected: money(summary.collectedAmount),
      deliveryTodayNewDebt: money(summary.finalDebtAmount)
    };
    Object.keys(pairs).forEach(function (id) { var el = byId(id); if (el) el.textContent = pairs[id]; });
  }

  function renderRows() {
    var tbody = byId('deliveryTodayNewTable');
    if (!tbody) return;
    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6">Không có đơn theo bộ lọc.</td></tr>';
      renderDetail(null);
      return;
    }
    tbody.innerHTML = state.rows.map(function (row, index) {
      var confirmed = isConfirmed(row);
      return '<tr data-index="' + index + '" class="' + (index === state.selectedIndex ? 'active' : '') + '">' +
        '<td><b>' + esc(row.orderCode || row.orderId) + '</b><br><small>' + esc(row.customerName || '') + ' · ' + esc(row.customerCode || '') + '</small></td>' +
        '<td class="new-money">' + money(row.originalAmount) + '</td>' +
        '<td class="new-money new-credit">' + money(row.returnedAmount) + '</td>' +
        '<td class="new-money">' + money(row.collectedAmount) + '</td>' +
        '<td class="new-money ' + (num(row.finalDebtAmount) > 0 ? 'new-debt-positive' : '') + '">' + money(row.finalDebtAmount) + '</td>' +
        '<td><span class="new-badge ' + (confirmed ? 'confirmed' : '') + '">' + (confirmed ? 'Đã xác nhận' : esc(row.closeoutStatus || row.status || 'draft')) + '</span>' + (confirmed ? '<br><small class="new-credit">Dùng correction nếu sửa</small>' : '') + '</td>' +
      '</tr>';
    }).join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-index]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selectedIndex = Number(tr.dataset.index);
        renderRows();
        renderDetail(state.rows[state.selectedIndex]);
      });
    });
    if (state.selectedIndex < 0) {
      state.selectedIndex = 0;
      renderRows();
      return;
    }
    renderDetail(state.rows[state.selectedIndex]);
  }

  function detailRow(label, value, className) {
    return '<div class="new-detail-row"><span>' + esc(label) + '</span><b class="' + (className || '') + '">' + esc(value) + '</b></div>';
  }

  function renderDetail(row) {
    var box = byId('deliveryTodayNewDetail');
    if (!box) return;
    if (!row) { box.innerHTML = '<div class="empty-state">Chọn một đơn để xem chi tiết.</div>'; return; }
    var confirmed = isConfirmed(row);
    box.innerHTML = '' +
      '<div class="new-safe-note">' + (confirmed ? 'Đơn đã accounting_confirmed: không mở khóa/sửa trực tiếp. Các thay đổi đi qua DeliveryCloseoutCorrectionService.' : 'Đơn chưa xác nhận kế toán: có thể xử lý vận hành trước khi chốt.') + '</div>' +
      detailRow('Mã đơn', row.orderCode || row.orderId) +
      detailRow('Khách hàng', (row.customerCode || '') + ' - ' + (row.customerName || '')) +
      detailRow('NVBH', (row.salesStaffCode || '') + ' - ' + (row.salesStaffName || '')) +
      detailRow('NVGH', (row.deliveryStaffCode || '') + ' - ' + (row.deliveryStaffName || '')) +
      detailRow('Phải thu gốc', money(row.originalAmount)) +
      detailRow('Hàng trả từ returnOrders', money(row.returnedAmount), 'new-credit') +
      detailRow('Đã thu khi giao', money(row.collectedAmount)) +
      detailRow('Công nợ cuối', money(row.finalDebtAmount), num(row.finalDebtAmount) > 0 ? 'new-debt-positive' : '') +
      detailRow('ReturnOrders', (row.returnOrderIds || []).join(', ') || 'Không có') +
      detailRow('Closeout version', row.version || 0) +
      detailRow('Version từ correction', row.correctionVersionApplied ? 'Có - ' + (row.correctionCode || row.correctionId || '') : 'Không') +
      detailRow('Điều chỉnh hàng trả', money(row.returnAdjustmentAmount), num(row.returnAdjustmentAmount) ? 'new-credit' : '') +
      detailRow('Điều chỉnh tiền thu', money(row.cashAdjustmentAmount), num(row.cashAdjustmentAmount) ? 'new-credit' : '') +
      detailRow('Điều chỉnh công nợ', money(row.debtAdjustmentAmount), num(row.debtAdjustmentAmount) > 0 ? 'new-debt-positive' : 'new-credit') +
      detailRow('Sai lệch closeout', money(row.closeoutDelta), num(row.closeoutDelta) ? 'new-debt-positive' : '') +
      (confirmed ? '<div class="new-detail-actions"><button id="deliveryTodayNewCorrectionOpen" type="button" class="primary-action">Tạo điều chỉnh</button><button id="deliveryTodayNewVersionsLoad" type="button" class="secondary">Lịch sử version</button></div>' : '');
    var openBtn = byId('deliveryTodayNewCorrectionOpen');
    if (openBtn) openBtn.addEventListener('click', function () { openCorrectionModal(row); });
    var versionsBtn = byId('deliveryTodayNewVersionsLoad');
    if (versionsBtn) versionsBtn.addEventListener('click', function () { loadVersions(row); });
  }


  function correctionEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(row.orderId || row.orderCode || row.closeoutVersionId || row.correctionId) + '/corrections';
  }

  function versionsEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(row.orderId || row.orderCode || row.closeoutVersionId || row.correctionId) + '/versions';
  }

  function openCorrectionModal(row) {
    var modal = byId('deliveryTodayNewCorrectionModal');
    if (!modal || !row) return;
    modal.hidden = false;
    modal.innerHTML = '' +
      '<h3>Tạo điều chỉnh closeout</h3>' +
      '<div class="new-safe-note">Hệ thống sẽ tạo version mới, không sửa bản chốt cũ. Không sinh AR-RETURN, không sinh AR-SALE-REVERSAL.</div>' +
      '<div class="new-module-toolbar">' +
        '<label>Hàng trả cũ<input id="deliveryCorrectionOldReturn" disabled value="' + esc(money(row.returnedAmount)) + '"></label>' +
        '<label>Hàng trả sau điều chỉnh<input id="deliveryCorrectionNewReturn" inputmode="numeric" value="' + esc(row.returnedAmount || 0) + '"></label>' +
        '<label>Tiền thu cũ<input id="deliveryCorrectionOldCash" disabled value="' + esc(money(row.collectedAmount)) + '"></label>' +
        '<label>Tiền thu sau điều chỉnh<input id="deliveryCorrectionNewCash" inputmode="numeric" value="' + esc(row.collectedAmount || 0) + '"></label>' +
        '<label class="wide">Lý do bắt buộc<input id="deliveryCorrectionReason" placeholder="Ví dụ: kế toán nhập thiếu tiền thu"></label>' +
        '<label class="wide">Ghi chú<input id="deliveryCorrectionNote" placeholder="Ghi chú thêm nếu có"></label>' +
      '</div>' +
      '<div id="deliveryCorrectionPreview" class="new-safe-note"></div>' +
      '<div class="new-detail-actions"><button id="deliveryCorrectionSubmit" type="button" class="primary-action">Lưu điều chỉnh</button><button id="deliveryCorrectionCancel" type="button" class="secondary">Đóng</button></div>';

    function preview() {
      var returnDelta = num(byId('deliveryCorrectionNewReturn').value) - num(row.returnedAmount);
      var cashDelta = num(byId('deliveryCorrectionNewCash').value) - num(row.collectedAmount);
      var debtDelta = -returnDelta - cashDelta;
      var box = byId('deliveryCorrectionPreview');
      if (box) box.textContent = 'Preview: hàng trả ' + money(returnDelta) + ' · tiền thu ' + money(cashDelta) + ' · công nợ ' + money(debtDelta);
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

  async function loadVersions(row) {
    try {
      var res = await fetch(versionsEndpoint(row));
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được version');
      var versions = json.versions || json.rows || [];
      setMessage('Closeout versions: ' + versions.map(function (v) { return 'v' + (v.closeoutVersion || '?') + '=' + money(v.finalDebtAmount || v.debtAmount); }).join(' | '));
    } catch (err) {
      setMessage(err.message || 'Không tải được lịch sử version', true);
    }
  }

  async function load() {
    ensureRoot();
    setMessage('Đang tải Đơn giao hôm nay (New)...');
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
      setMessage('Đã tải ' + state.rows.length + ' đơn từ contract New.');
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
