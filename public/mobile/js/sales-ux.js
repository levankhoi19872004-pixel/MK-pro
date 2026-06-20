export function createMobileSalesNavigation(options = {}) {
  const tabs = Array.from(options.tabs || []);
  const panels = Array.from(options.panels || []);
  const panelIds = new Set(options.panelIds || panels.map((panel) => panel.id));
  const hashByPanel = options.hashByPanel || {};
  const scrollPositions = new Map();
  let activePanel = options.initialPanel || panels.find((panel) => panel.classList.contains('active'))?.id || 'customersTab';

  const navigationPanel = (panelId) => panelId === 'cartTab' ? 'orderTab' : panelId;
  const panelFromHash = () => {
    const hash = String(window.location.hash || '').toLowerCase();
    return Object.entries(hashByPanel).find(([, value]) => value === hash)?.[0] || '';
  };

  function setActive(panelId) {
    const navigationId = navigationPanel(panelId);
    tabs.forEach((button) => {
      const active = button.dataset.tab === navigationId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      const active = panel.id === panelId;
      panel.classList.toggle('active', active);
      panel.setAttribute('aria-hidden', String(!active));
    });
  }

  function switchPanel(panelId, switchOptions = {}) {
    const next = panelIds.has(panelId) ? panelId : (options.fallbackPanel || 'customersTab');
    const historyMode = switchOptions.historyMode || 'push';
    if (activePanel && activePanel !== next) {
      scrollPositions.set(activePanel, window.scrollY || document.documentElement.scrollTop || 0);
    }
    activePanel = next;
    setActive(next);
    options.onActivate?.(next);

    if (historyMode !== 'none') {
      const url = new URL(window.location.href);
      url.hash = hashByPanel[next] || hashByPanel[options.fallbackPanel || 'customersTab'] || '';
      const state = { ...(window.history.state || {}), mobileSalesTab: next };
      if (historyMode === 'replace') window.history.replaceState(state, '', url);
      else if (window.history.state?.mobileSalesTab !== next) window.history.pushState(state, '', url);
    }

    const target = switchOptions.restoreScroll === false ? 0 : Number(scrollPositions.get(next) || 0);
    window.requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'auto' }));
    return activePanel;
  }

  function initialize() {
    const requested = panelFromHash() || window.history.state?.mobileSalesTab || activePanel;
    activePanel = panelIds.has(requested) ? requested : (options.fallbackPanel || 'customersTab');
    setActive(activePanel);
    const url = new URL(window.location.href);
    url.hash = hashByPanel[activePanel] || '';
    window.history.replaceState({ ...(window.history.state || {}), mobileSalesTab: activePanel }, '', url);
    window.addEventListener('popstate', (event) => {
      const next = event.state?.mobileSalesTab || panelFromHash() || options.fallbackPanel || 'customersTab';
      switchPanel(next, { historyMode: 'none', restoreScroll: true });
    });
    return activePanel;
  }

  return {
    initialize,
    switchPanel,
    getActivePanel: () => activePanel,
    getScrollPositions: () => new Map(scrollPositions)
  };
}

export function createStatusAnnouncer(element) {
  let timer = null;
  return function announce(text = '', type = 'info', options = {}) {
    if (!element) return;
    if (timer) window.clearTimeout(timer);
    const value = String(text || '').trim();
    if (!value) {
      element.hidden = true;
      element.textContent = '';
      return;
    }
    element.textContent = value;
    element.className = `mobile-global-status ${type}`;
    element.hidden = false;
    if (options.persist !== true) {
      timer = window.setTimeout(() => {
        element.hidden = true;
        element.textContent = '';
      }, Number(options.durationMs || 5000));
    }
  };
}

export function renderMobileListState(container, options = {}, escapeHtml = String) {
  if (!container) return;
  const state = options.state || 'empty';
  const title = options.title || '';
  const detail = options.detail || '';
  const retryAction = options.retryAction || '';
  container.className = `${options.baseClass || 'order-list'} mobile-list-state ${state}`;
  if (state === 'loading') {
    container.innerHTML = '<div class="mobile-skeleton" aria-label="Đang tải dữ liệu"><span></span><span></span><span></span></div>';
    return;
  }
  container.innerHTML = `
    <div class="mobile-state-content">
      <strong>${escapeHtml(title)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      ${retryAction ? `<button type="button" class="ghost-btn" data-mobile-retry="${escapeHtml(retryAction)}">Thử lại</button>` : ''}
    </div>`;
}

export function calculateCartTotals(cart = []) {
  return cart.reduce((totals, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const grossPrice = Math.max(0, Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0));
    const grossAmount = Math.max(0, Number(item.grossAmount || Math.round(quantity * grossPrice)));
    const payable = Math.max(0, Number(item.amount ?? item.netAmount ?? Math.round(quantity * Number(item.unitPrice || item.salePrice || item.price || 0))));
    const discount = Math.max(0, Number(item.discountAmount || item.promotionAmount || Math.max(0, grossAmount - payable)));
    totals.gross += grossAmount;
    totals.discount += Math.min(grossAmount, discount);
    totals.payable += payable;
    return totals;
  }, { gross: 0, discount: 0, payable: 0 });
}

export function buildCartItemsHtml(cart = [], helpers = {}) {
  const escapeHtml = helpers.escapeHtml || String;
  const money = helpers.money || String;
  const normalizePackingRate = helpers.normalizePackingRate || (() => 1);
  const quantityDisplay = helpers.quantityDisplay || ((item) => String(item.quantity || 0));

  return cart.map((item, index) => {
    const quantity = Number(item.quantity || 0);
    const rate = normalizePackingRate(item);
    const caseQty = rate > 0 ? Math.floor(quantity / rate) : 0;
    const looseQty = Math.max(0, quantity - (caseQty * rate));
    const originalPrice = Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
    const unitPrice = Number(item.unitPrice || item.salePrice || item.price || 0);
    const grossAmount = Number(item.grossAmount || Math.round(quantity * originalPrice));
    const discount = Number(item.discountAmount || item.promotionAmount || Math.max(0, grossAmount - Number(item.amount || 0)));
    const promotion = discount > 0
      ? `<span class="cart-promotion">KM: -${money(discount)} · Giá sau KM: ${money(unitPrice)}</span>`
      : `<span>Giá bán: ${money(unitPrice)}</span>`;
    const label = escapeHtml(item.productName || item.productCode || 'sản phẩm');
    return `
      <article class="cart-item" data-cart-index="${index}">
        <div class="cart-item-heading">
          <div><strong>${escapeHtml(item.productCode)} - ${escapeHtml(item.productName)}</strong><span>Quy cách: ${escapeHtml(String(rate))} · Hiện tại: ${escapeHtml(quantityDisplay(item))}</span></div>
          <button type="button" class="danger-btn cart-remove-btn" data-remove="${index}" aria-label="Xóa ${label} khỏi giỏ">Xóa</button>
        </div>
        <div class="cart-price-detail"><span>Giá gốc: ${money(originalPrice)}</span>${promotion}<strong>Thành tiền: ${money(item.amount)}</strong></div>
        <div class="cart-qty-editor" aria-label="Sửa số lượng ${label}">
          <label><span>Thùng</span><input type="number" min="0" step="1" inputmode="numeric" value="${caseQty}" data-cart-case="${index}" aria-label="Số thùng ${label}" /></label>
          <label><span>Lẻ</span><input type="number" min="0" step="1" inputmode="numeric" value="${looseQty}" data-cart-loose="${index}" aria-label="Số lẻ ${label}" /></label>
          <button type="button" class="ghost-btn cart-update-btn" data-cart-update="${index}">Cập nhật</button>
        </div>
      </article>`;
  }).join('');
}

export function buildOrderCardsHtml(orders = [], helpers = {}) {
  const escapeHtml = helpers.escapeHtml || String;
  const money = helpers.money || String;
  const formatDate = helpers.formatDate || String;
  return orders.map((order) => {
    const pending = order.pendingSync === true;
    const status = pending
      ? (order.status === 'conflict' ? 'Cần xử lý đồng bộ' : (order.status === 'failed' ? 'Đồng bộ thất bại' : 'Chờ đồng bộ'))
      : (order.canEdit ? 'Có thể sửa' : (order.editLockReason || 'Đã khóa sửa'));
    const error = pending && order.syncError ? `<div class="mobile-inline-error">${escapeHtml(order.syncError)}</div>` : '';
    return `
      <article class="order-item mobile-order-card ${pending ? 'pending-sync-order' : ''}">
        <div class="mobile-order-heading">
          <div><strong>${escapeHtml(order.code || '')}</strong><span>${escapeHtml(order.customerCode || '')}${order.customerCode && order.customerName ? ' · ' : ''}${escapeHtml(order.customerName || '')}</span></div>
          <span class="order-status-badge ${pending ? 'sync' : (order.canEdit ? 'editable' : 'locked')}">${escapeHtml(status)}</span>
        </div>
        <div class="mobile-order-metrics">
          <span><small>Ngày</small><strong>${escapeHtml(formatDate(order.date))}</strong></span>
          <span><small>Tổng</small><strong>${money(order.totalAmount)}</strong></span>
          <span><small>Đã thu</small><strong>${money(order.paidAmount)}</strong></span>
          <span><small>Còn nợ</small><strong>${money(order.debtAmount)}</strong></span>
        </div>
        ${error}
        <div class="row-actions mobile-order-actions">
          ${!pending && order.canEdit
            ? `<button type="button" class="ghost-btn small-btn" data-edit-order="${escapeHtml(order.id || order.code)}">Chỉnh sửa</button><button type="button" class="danger-btn small-btn" data-delete-order="${escapeHtml(order.id || order.code)}" data-order-code="${escapeHtml(order.code)}">Xóa</button>`
            : `<span class="muted">${escapeHtml(pending ? 'Đơn được giữ an toàn trên thiết bị.' : (order.editLockReason || 'Không thể sửa/xóa trên app'))}</span>`}
        </div>
      </article>`;
  }).join('');
}
