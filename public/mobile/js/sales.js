
const v45Common = window.V45Common || {};
const todayValue = v45Common.todayValue;
const calculateCartonUnit = v45Common.calculateCartonUnit;
import { mobileApi, getUser } from './api.js';
import { bindLogout, debounce, money, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['sales']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'sales'}`;


function setButtonBusy(button, busy, busyText = 'Đang lưu...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.dataset.originalText || button.textContent || '';
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

let selectedCustomer = null;
let selectedProduct = null;
let cart = [];
let editingOrderId = '';
let lastCustomers = [];
let customerCatalog = [];
let todayOrderCache = [];

const tabs = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');
const customerSearch = document.getElementById('customerSearch');
const customerList = document.getElementById('customerList');
const productSearch = document.getElementById('productSearch');
const productSuggestions = document.getElementById('productSuggestions');
const selectedCustomerBox = document.getElementById('selectedCustomer');
const selectedProductBox = document.getElementById('selectedProduct');
const caseQtyInput = document.getElementById('caseQtyInput');
const looseQtyInput = document.getElementById('looseQtyInput');
const paidAmountInput = document.getElementById('paidAmountInput');
const cartList = document.getElementById('cartList');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');
const todayOrders = document.getElementById('todayOrders');
const message = document.getElementById('salesMessage');
const orderFormTitle = document.getElementById('orderFormTitle');
const submitOrderBtn = document.getElementById('submitOrderBtn');

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatShortDate(value) {
  const raw = String(value || todayValue()).trim();
  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/);
  if (m) { let d=Number(m[1]), mo=Number(m[2]), y=Number(m[3]); if(y<100)y+=y>=70?1900:2000; if(mo>=1&&mo<=12&&d>=1&&d<=31)return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  return raw.slice(0,10);
}

tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
customerSearch.addEventListener('input', debounce(() => loadCustomers(customerSearch.value.trim()), 250));
document.getElementById('reloadCustomersBtn')?.addEventListener('click', async () => { await preloadCustomers(true); loadCustomers(customerSearch.value.trim()); });
document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadTodayOrders);
document.getElementById('clearOrderBtn')?.addEventListener('click', clearOrderForm);

loadCustomers('');
loadTodayOrders();
initProductAutocomplete();
renderCart();

async function preloadCustomers(force = false) {
  // Phase 3.6: không preload toàn bộ khách hàng. Chỉ giữ hàm này để nút Tải lại xóa cache.
  customerCatalog = [];
  if (force && window.CatalogCache) window.CatalogCache.invalidate('customers');
  return customerCatalog;
}

async function filterCustomers(keyword = '') {
  if (window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchCustomer(keyword, { limit: 50, mobile: true });
  if (window.CatalogCache) return window.CatalogCache.searchCustomers(keyword, { limit: 50, mobile: true });
  const data = await mobileApi.getCustomers(keyword, { limit: 50 });
  return data.items || data.customers || [];
}

async function loadCustomers(q = '') {
  try {
    customerList.className = 'customer-list empty';
    customerList.textContent = q ? 'Đang tìm khách hàng...' : 'Nhập từ khóa để tìm khách hàng...';
    lastCustomers = await filterCustomers(q);
    renderCustomerList(lastCustomers);
  } catch (err) {
    customerList.className = 'customer-list empty';
    customerList.textContent = err.message;
  }
}

function renderCustomerList(items) {
  if (!items.length) {
    customerList.className = 'customer-list empty';
    customerList.textContent = 'Không có khách hàng phù hợp';
    return;
  }

  customerList.className = 'customer-list';
  customerList.innerHTML = items.map((customer, index) => `
    <button class="customer-card" data-customer-index="${index}">
      <strong>${customer.code || ''} - ${customer.name || ''}</strong>
      <span>${customer.phone || ''} · ${customer.address || ''}</span>
      <div class="customer-metrics">
        <em>Công nợ: ${money(customer.debtAmount || customer.currentDebt || customer.debt || 0)}</em>
        <em>DS tháng: ${money(customer.monthRevenue || customer.monthSales || 0)}</em>
      </div>
    </button>
  `).join('');

  customerList.querySelectorAll('[data-customer-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectCustomer(lastCustomers[Number(btn.dataset.customerIndex)]));
  });
}

function selectCustomer(customer) {
  selectedCustomer = customer;
  selectedCustomerBox.innerHTML = `
    <strong>${customer.code || ''} - ${customer.name || ''}</strong><br />
    <span>${customer.phone || ''} · ${customer.address || ''}</span><br />
    <span>Công nợ: ${money(customer.debtAmount || customer.currentDebt || customer.debt || 0)} · DS tháng: ${money(customer.monthRevenue || customer.monthSales || 0)}</span>
  `;
  selectedCustomerBox.classList.remove('muted');
  setMessage(message, 'Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.', 'success');
  switchTab('orderTab');
  setTimeout(() => productSearch.focus(), 200);
}


function formatStockTL(qty, rate){ return calculateCartonUnit(qty, rate).display; }

function toMobileProduct(product = {}) {
  const availableQty = Number(
    product._availableQty ??
    product.availableQty ??
    product.availableStock ??
    product.stockQuantity ??
    product.stock ??
    0
  );

  const code = product.code || product.productCode || product.sku || '';
  const name = product.name || product.productName || '';

  return {
    ...product,
    id: product.id || product._id || code,
    code,
    name,
    salePrice: Number(product.salePrice || product.price || 0),
    availableQty,
    stockQuantity: availableQty,
    conversionRate: Number(product.conversionRate || product.unitsPerCase || 1),
    stockDisplay: formatStockTL(availableQty, Number(product.conversionRate || product.unitsPerCase || 1))
  };
}

function resetSelectedProduct() {
  selectedProduct = null;
  selectedProductBox.textContent = 'Chưa chọn sản phẩm';
  selectedProductBox.classList.add('muted');
}

function pickProduct(product) {
  const p = toMobileProduct(product);
  selectedProduct = p;
  selectedProductBox.innerHTML = `\n    <div class="product-suggest-title">${p.code || ''} | ${p.name || ''}</div>\n    <div class="product-suggest-meta"><span class="stock-badge">Tồn: ${p.stockDisplay || formatStockTL(p.availableQty, p.conversionRate)}</span><span class="price-badge">Giá bán: ${money(p.salePrice || p.price || 0)}</span></div>\n  `;
  selectedProductBox.classList.remove('muted');
  productSearch.value = p.name || p.code || '';
  productSuggestions.innerHTML = '';
  productSuggestions.classList.remove('has-many');
  looseQtyInput.focus();
}

async function preloadUnifiedProducts(force = false) {
  if (!window.UnifiedProductSearch) throw new Error('Thiếu UnifiedProductSearch. Kiểm tra sales.html đã nhúng productSearchBox.js chưa.');
  if (force && window.CatalogCache) window.CatalogCache.invalidate('products');
  return [];
}

function initProductAutocomplete() {
  if (!productSearch || !productSuggestions) return;

  if (!window.SearchAutocomplete || !window.UnifiedProductSearch) {
    productSuggestions.innerHTML = '<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>';
    return;
  }

  window.SearchAutocomplete.wire({
    input: productSearch,
    box: productSuggestions,
    getItems: () => window.UnifiedSearchEngine
      ? window.UnifiedSearchEngine.searchProduct(productSearch.value.trim(), { limit: 50, mode: 'sales', inStockOnly: true })
      : window.UnifiedProductSearch.search(productSearch.value.trim(), { limit: 50, mode: 'sales' }),
    label: (product) => window.UnifiedProductSearch.label(product, 'sales'),
    select: pickProduct,
    emptyText: 'Không tìm thấy sản phẩm phù hợp'
  });

  productSearch.addEventListener('input', resetSelectedProduct);
  productSearch.addEventListener('focus', () => {
    productSearch.dispatchEvent(new Event('input', { bubbles: true }));
  });
  productSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      productSuggestions.innerHTML = '';
      productSuggestions.classList.remove('has-many');
    }
  });

}


document.getElementById('addItemBtn').addEventListener('click', () => {
  setMessage(message, '');
  if (!selectedCustomer) return setMessage(message, 'Chưa chọn khách hàng ở tab 1', 'error');
  if (!selectedProduct) return setMessage(message, 'Chưa chọn sản phẩm', 'error');

  const caseQty = Number(caseQtyInput?.value || 0);
  const looseQty = Number(looseQtyInput?.value || 0);
  const packingRate = Number(selectedProduct.conversionRate || selectedProduct.unitsPerCase || 0);
  const qty = (caseQty > 0 && packingRate > 0 ? caseQty * packingRate : 0) + looseQty;
  if (qty <= 0) return setMessage(message, 'Số lượng phải lớn hơn 0', 'error');

  // V45 fix: tồn hiển thị trên autocomplete có thể bị cache/stale.
  // Không chặn cứng ở frontend khi availableQty = 0/không có; backend sẽ kiểm tra lại tồn Mongo thật khi ghi đơn.
  const availableQty = Number(selectedProduct.availableQty || 0);
  if (availableQty > 0 && qty > availableQty) return setMessage(message, 'Số lượng vượt tồn mở bán', 'error');

  const existed = cart.find((item) => item.productCode === selectedProduct.code);
  if (existed) {
    const nextQty = existed.quantity + qty;
    if (availableQty > 0 && nextQty > availableQty) return setMessage(message, 'Tổng số lượng vượt tồn mở bán', 'error');
    existed.quantity = nextQty;
    existed.amount = existed.quantity * existed.salePrice;
  } else {
    cart.push({
      productId: selectedProduct.id,
      productCode: selectedProduct.code,
      productName: selectedProduct.name,
      unit: selectedProduct.unit,
      quantity: qty,
      salePrice: selectedProduct.salePrice || selectedProduct.price || 0,
      amount: qty * Number(selectedProduct.salePrice || selectedProduct.price || 0)
    });
  }

  selectedProduct = null;
  productSearch.value = '';
  caseQtyInput.value = '';
  looseQtyInput.value = '';
  selectedProductBox.textContent = 'Chưa chọn sản phẩm';
  selectedProductBox.classList.add('muted');
  renderCart();
});

function renderCart() {
  const total = cart.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  cartCount.textContent = `${cart.length} dòng`;
  cartTotal.textContent = money(total);

  if (!cart.length) {
    cartList.className = 'cart-list empty';
    cartList.textContent = 'Chưa có sản phẩm';
    return;
  }

  cartList.className = 'cart-list';
  cartList.innerHTML = cart.map((item, index) => `
    <div class="cart-item">
      <strong>${item.productCode} - ${item.productName}</strong>
      <span>SL: ${item.quantity} ${item.unit || ''} · Giá: ${money(item.salePrice)} · Thành tiền: ${money(item.amount)}</span>
      <button class="danger-btn small-btn" data-remove="${index}">Xóa</button>
    </div>
  `).join('');

  cartList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });
}

submitOrderBtn.addEventListener('click', async () => {
  if (submitOrderBtn.disabled) return;
  setButtonBusy(submitOrderBtn, true);
  setMessage(message, '');
  if (!selectedCustomer) return setMessage(message, 'Chưa chọn khách hàng', 'error');
  if (!cart.length) return setMessage(message, 'Chưa có sản phẩm', 'error');

  try {
    const paidAmount = Number(paidAmountInput.value || 0);
    const payload = {
      customer: selectedCustomer,
      items: cart,
      paidAmount,
      note: editingOrderId ? 'Sửa từ app bán hàng mobile' : 'Tạo từ app bán hàng mobile'
    };
    const data = editingOrderId
      ? await mobileApi.updateSalesOrder(editingOrderId, payload)
      : await mobileApi.createSalesOrder(payload);

    const code = data.salesOrder?.code || '';
    clearOrderForm(false);
    upsertTodayOrder(data.salesOrder);
    setMessage(message, `${data.message || 'Đã lưu đơn'} ${code}`, 'success');
    switchTab('reportTab');
  } catch (err) {
    setMessage(message, err.message, 'error');
  } finally {
    setButtonBusy(submitOrderBtn, false);
  }
});

function clearOrderForm(clearCustomer = true) {
  cart = [];
  editingOrderId = '';
  selectedProduct = null;
  productSearch.value = '';
  caseQtyInput.value = '';
  looseQtyInput.value = '';
  paidAmountInput.value = '';
  selectedProductBox.textContent = 'Chưa chọn sản phẩm';
  selectedProductBox.classList.add('muted');
  orderFormTitle.textContent = 'Đặt hàng';
  submitOrderBtn.textContent = 'Xác nhận đơn';
  if (clearCustomer) {
    selectedCustomer = null;
    selectedCustomerBox.textContent = 'Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.';
    selectedCustomerBox.classList.add('muted');
    setMessage(message, 'Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.', 'success');
  }
  renderCart();
}

async function editTodayOrder(orderId) {
  try {
    const data = await mobileApi.getSalesOrder(orderId);
    const order = data.order;
    if (!order.canEdit) return setMessage(message, 'Đơn đã gộp đơn tổng, app bán hàng không được sửa.', 'error');

    editingOrderId = order.id || order.code;
    selectedCustomer = {
      id: order.customerId,
      code: order.customerCode,
      name: order.customerName,
      phone: order.customerPhone,
      address: order.customerAddress,
      debtAmount: order.customerDebt || 0,
      monthRevenue: order.customerMonthRevenue || 0
    };
    selectedCustomerBox.innerHTML = `<strong>${order.customerCode || ''} - ${order.customerName || ''}</strong><br /><span>${order.customerPhone || ''} · ${order.customerAddress || ''}</span>`;
    selectedCustomerBox.classList.remove('muted');

    cart = (order.items || []).map((item) => ({
      productId: item.productId || item.productCode,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit,
      conversionRate: item.conversionRate,
      quantity: Number(item.quantity || 0),
      salePrice: Number(item.salePrice || 0),
      amount: Number(item.amount || Number(item.quantity || 0) * Number(item.salePrice || 0))
    }));
    paidAmountInput.value = Number(order.paidAmount || 0);
    orderFormTitle.textContent = `Sửa đơn ${order.code || ''}`;
    submitOrderBtn.textContent = `Lưu sửa đơn ${order.code || ''}`;
    renderCart();
    setMessage(message, `Đang sửa đơn ${order.code || ''}. Chỉ sửa được khi chưa gộp đơn tổng.`, 'success');
    switchTab('orderTab');
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

async function deleteTodayOrder(orderId, orderCode) {
  const ok = window.confirm(`Xóa đơn ${orderCode || orderId}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`);
  if (!ok) return;
  try {
    const data = await mobileApi.deleteSalesOrder(orderId);
    await loadTodayOrders();
    setMessage(message, data.message || 'Đã xóa đơn', 'success');
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}


function renderTodayOrders(items = todayOrderCache) {
  todayOrderCache = Array.isArray(items) ? items : [];
  const totalAmount = todayOrderCache.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const paidAmount = todayOrderCache.reduce((sum, order) => sum + Number(order.paidAmount || 0), 0);
  const debtAmount = todayOrderCache.reduce((sum, order) => sum + Number(order.debtAmount || 0), 0);

  document.getElementById('todayRevenue').textContent = money(totalAmount);
  document.getElementById('todayOrderCount').textContent = String(todayOrderCache.length);
  document.getElementById('todayPaid').textContent = money(paidAmount);
  document.getElementById('todayDebt').textContent = money(debtAmount);

  if (!todayOrderCache.length) {
    todayOrders.className = 'order-list empty';
    todayOrders.textContent = 'Chưa có đơn';
    return;
  }

  todayOrders.className = 'order-list';
  todayOrders.innerHTML = todayOrderCache.map((order) => `
    <div class="order-item">
      <strong>${order.code} - ${order.customerName || ''}</strong>
      <span>Ngày: ${formatShortDate(order.date)} · Tổng: ${money(order.totalAmount)} · Đã thu: ${money(order.paidAmount)} · Còn nợ: ${money(order.debtAmount)}</span>
      <span>Trạng thái: ${order.status || ''} / ${order.deliveryStatus || ''} · ${order.canEdit ? 'Chưa gộp đơn tổng' : 'Đã gộp đơn tổng'}</span>
      <div class="row-actions">
        ${order.canEdit ? `<button class="ghost-btn small-btn" data-edit-order="${order.id || order.code}">Chỉnh sửa</button><button class="danger-btn small-btn" data-delete-order="${order.id || order.code}" data-order-code="${order.code}">Xóa</button>` : '<span class="muted">Đã gộp đơn tổng - không sửa/xóa trên app</span>'}
      </div>
    </div>
  `).join('');

  todayOrders.querySelectorAll('[data-edit-order]').forEach((btn) => {
    btn.addEventListener('click', () => editTodayOrder(btn.dataset.editOrder));
  });
  todayOrders.querySelectorAll('[data-delete-order]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTodayOrder(btn.dataset.deleteOrder, btn.dataset.orderCode));
  });
}

function upsertTodayOrder(order = {}) {
  if (!order || !(order.id || order.code)) return;
  const key = String(order.id || order.code);
  const normalized = { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' };
  const index = todayOrderCache.findIndex((item) => String(item.id || item.code) === key || String(item.code || '') === String(order.code || ''));
  if (index >= 0) todayOrderCache[index] = { ...todayOrderCache[index], ...normalized };
  else todayOrderCache.unshift(normalized);
  renderTodayOrders(todayOrderCache);
}

async function loadTodayOrders() {
  try {
    const data = await mobileApi.getMySalesOrders();
    renderTodayOrders(data.items || []);
  } catch (err) {
    todayOrders.className = 'order-list empty';
    todayOrders.textContent = err.message;
  }
}
