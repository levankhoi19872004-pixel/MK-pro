
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
let debtCache = [];
let debtLoaded = false;
let debtLoading = false;
let debtRequestSeq = 0;

const tabs = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');
const customerSearch = document.getElementById('customerSearch');
const customerList = document.getElementById('customerList');
const productSearch = document.getElementById('productSearch');
// MOBILE_PRODUCT_GROUP_FILTER_LOGIC_START: DOM filter Nhóm hàng để thu hẹp danh sách sản phẩm mobile.
const productGroupFilter = document.getElementById('productGroupFilter');
let productGroupOptionsLoaded = false;
// MOBILE_PRODUCT_GROUP_FILTER_LOGIC_END
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
const cartTabBadge = document.getElementById('cartTabBadge');
const debtList = document.getElementById('debtList');
const debtLedgerList = document.getElementById('debtLedgerList');
const debtTotalAmount = document.getElementById('debtTotalAmount');
const debtCustomerCount = document.getElementById('debtCustomerCount');

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

function formatDisplayDate(value) {
  const normalized = formatShortDate(value);
  const m = String(normalized || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : (normalized || '-');
}

function customerDebtValue(customer = {}) {
  return Number(customer.debtAmount ?? customer.currentDebt ?? customer.debt ?? customer.arDebt ?? 0);
}

function customerSalesValue(customer = {}) {
  return Number(customer.monthRevenue ?? customer.monthSales ?? customer.salesAmount ?? 0);
}


function cleanCustomerText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : fallback;
}

function customerCodeValue(customer = {}) {
  return cleanCustomerText(customer.code || customer.customerCode || customer.customerId || customer.id || '');
}

function customerNameValue(customer = {}) {
  return cleanCustomerText(customer.name || customer.customerName || customer.fullName || '');
}

function customerPhoneValue(customer = {}) {
  return cleanCustomerText(customer.phone || customer.customerPhone || customer.mobile || customer.tel || customer.telephone || customer.contactPhone || customer.sdt || '', 'Chưa có SĐT');
}

function customerAddressValue(customer = {}) {
  return cleanCustomerText(customer.address || customer.customerAddress || customer.fullAddress || customer.diaChi || customer.routeAddress || '', 'Chưa có địa chỉ');
}

// MOBILE_SALES_CUSTOMER_CANONICAL_PAYLOAD_START
function normalizeSelectedCustomerForSubmit(customer = {}) {
  const code = customerCodeValue(customer);
  const name = customerNameValue(customer);
  const id = cleanCustomerText(customer.id || customer._id || customer.customerId || '');
  const phone = cleanCustomerText(customer.phone || customer.customerPhone || customer.mobile || customer.tel || customer.telephone || customer.contactPhone || customer.sdt || '');
  const address = cleanCustomerText(customer.address || customer.customerAddress || customer.fullAddress || customer.diaChi || customer.routeAddress || '');

  return {
    ...customer,
    id,
    customerId: cleanCustomerText(customer.customerId || id || code),
    code,
    customerCode: code,
    name,
    customerName: name,
    phone,
    customerPhone: phone,
    address,
    customerAddress: address
  };
}
// MOBILE_SALES_CUSTOMER_CANONICAL_PAYLOAD_END

function debtClassName(customer = {}) {
  const debt = customerDebtValue(customer);
  if (debt > 10000000) return 'debt-high';
  if (debt >= 3000000) return 'debt-mid';
  if (debt > 0) return 'debt-low';
  return 'debt-zero';
}

function customerKeys(customer = {}) {
  return [
    customer.id,
    customer._id,
    customer.customerId,
    customer.code,
    customer.customerCode,
    customer.name,
    customer.customerName
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function buildDebtLookup(rows = debtCache) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    customerKeys(item).forEach((key) => map.set(key, item));
  });
  return map;
}

function mergeCustomerDebt(customer = {}, debtLookup = buildDebtLookup()) {
  const matched = customerKeys(customer).map((key) => debtLookup.get(key)).find(Boolean);
  if (!matched) return { ...customer, debtAmount: customerDebtValue(customer) };
  return {
    ...customer,
    debtAmount: Number(matched.debtAmount || 0),
    orderCount: Number(matched.orderCount || 0),
    oldestDebtDate: matched.oldestDebtDate || customer.oldestDebtDate || ''
  };
}

tabs.forEach((btn) => btn.addEventListener('click', () => {
  switchTab(btn.dataset.tab);
  if (btn.dataset.tab === 'debtTab') loadDebts({ force: true });
}));
customerSearch.addEventListener('input', debounce(() => loadCustomers(customerSearch.value.trim()), 250));
document.getElementById('reloadCustomersBtn')?.addEventListener('click', async () => { await preloadCustomers(true); await loadDebts({ silent: true }); loadCustomers(customerSearch.value.trim()); });
document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadTodayOrders);
document.getElementById('reloadDebtsBtn')?.addEventListener('click', loadDebts);
document.getElementById('clearOrderBtn')?.addEventListener('click', clearOrderForm);

initSalesApp();

async function initSalesApp() {
  await loadDebts({ silent: true });
  await loadCustomers('');
  loadTodayOrders();
  initProductAutocomplete();
  renderCart();
}

async function preloadCustomers(force = false) {
  // Phase 3.6: không preload toàn bộ khách hàng. Chỉ giữ hàm này để nút Tải lại xóa cache.
  customerCatalog = [];
  if (force && window.CatalogCache) window.CatalogCache.invalidate('customers');
  return customerCatalog;
}

async function filterCustomers(keyword = '') {
  // App bán hàng phải dùng API mobile/customers để dữ liệu đã được gắn công nợ từ ArLedger
  // và được sắp xếp theo công nợ giảm dần. Không dùng UnifiedSearchEngine/CatalogCache tại đây
  // vì cache có thể không có debtAmount chuẩn.
  const data = await mobileApi.getCustomers(keyword, { limit: 300 });
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
  const debtLookup = buildDebtLookup();
  const sortedItems = (Array.isArray(items) ? items : [])
    .map((customer) => mergeCustomerDebt(customer, debtLookup))
    .sort((a, b) => customerDebtValue(b) - customerDebtValue(a));
  lastCustomers = sortedItems;

  if (!sortedItems.length) {
    customerList.className = 'customer-list empty';
    customerList.textContent = 'Không có khách hàng phù hợp';
    return;
  }

  customerList.className = 'customer-list';
  customerList.innerHTML = sortedItems.map((customer, index) => {
    const code = customerCodeValue(customer);
    const name = customerNameValue(customer);
    const debt = customerDebtValue(customer);
    const phone = customerPhoneValue(customer);
    const address = customerAddressValue(customer);
    return `
      <button class="customer-card ${debtClassName(customer)}" data-customer-index="${index}">
        <strong>${code || ''}${code && name ? ' - ' : ''}${name || ''}</strong>
        <span class="customer-contact">SĐT: ${phone}</span>
        <span class="customer-contact">ĐC: ${address}</span>
        <div class="customer-metrics">
          <em class="metric-debt">Nợ: ${money(debt)}</em>
          <em>DS tháng: ${money(customerSalesValue(customer))}</em>
        </div>
      </button>
    `;
  }).join('');

  customerList.querySelectorAll('[data-customer-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectCustomer(lastCustomers[Number(btn.dataset.customerIndex)]));
  });
}

function selectCustomer(customer) {
  const mergedCustomer = normalizeSelectedCustomerForSubmit(mergeCustomerDebt(customer));
  selectedCustomer = mergedCustomer;
  const code = customerCodeValue(mergedCustomer);
  const name = customerNameValue(mergedCustomer);
  selectedCustomerBox.innerHTML = `
    <strong>${code || ''}${code && name ? ' - ' : ''}${name || ''}</strong><br />
    <span>SĐT: ${customerPhoneValue(mergedCustomer)}</span><br />
    <span>ĐC: ${customerAddressValue(mergedCustomer)}</span><br />
    <span>Nợ: ${money(customerDebtValue(mergedCustomer))} · DS tháng: ${money(customerSalesValue(mergedCustomer))}</span>
  `;
  selectedCustomerBox.classList.remove('muted');
  setMessage(message, 'Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.', 'success');
  switchTab('orderTab');
  setTimeout(() => productSearch.focus(), 200);
}


function normalizePackingRate(source = {}) {
  const rate = Number(
    source.conversionRate ??
    source.unitsPerCase ??
    source.packingQty ??
    source.packQty ??
    source.pack ??
    source.packageQty ??
    1
  );
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function attachPackingRate(target = {}, source = {}) {
  const conversionRate = normalizePackingRate(source);
  target.conversionRate = conversionRate;
  target.packingQty = conversionRate;
  target.unitsPerCase = conversionRate;
  return target;
}

function formatStockTL(qty, rate){ return calculateCartonUnit(qty, rate).display; }
function quantityDisplayTL(item = {}) {
  const rate = normalizePackingRate(item);
  return formatStockTL(Number(item.quantity || item.qty || 0), rate);
}

// MOBILE_SALES_CART_PROMOTION_RECALC_START
function buildPromotionCartPayloadItem(item = {}) {
  return {
    productId: item.productId || item.id || item.productCode,
    productCode: item.productCode || item.code,
    productName: item.productName || item.name,
    quantity: Number(item.quantity || 0),
    conversionRate: normalizePackingRate(item),
    grossPrice: Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
    salePrice: Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
    price: Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0)
  };
}

async function recalculateCartPromotions(options = {}) {
  if (!cart.length) return;
  const silent = !!options.silent;
  try {
    const data = await mobileApi.calculatePromotions({
      date: todayValue(),
      saleDate: todayValue(),
      items: cart.map(buildPromotionCartPayloadItem)
    });
    const lines = Array.isArray(data?.result?.lines) ? data.result.lines : [];
    const byCode = new Map(lines.map((line) => [String(line.productCode || line.code || '').trim(), line]));

    cart = cart.map((item) => {
      const code = String(item.productCode || item.code || '').trim();
      const line = byCode.get(code) || {};
      const quantity = Number(item.quantity || 0);
      const grossPrice = Number(line.catalogSalePrice || item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
      const grossAmount = Math.round(quantity * grossPrice);
      const directDiscountAmount = Number(line.directDiscountAmount || 0);
      const groupDiscountAmount = Number(line.groupDiscountAmount || 0);
      const discountAmount = Math.min(grossAmount, Math.max(0, directDiscountAmount + groupDiscountAmount));
      const amount = Math.max(0, grossAmount - discountAmount);
      const finalPrice = quantity > 0 ? Math.round(amount / quantity) : grossPrice;
      const promotionRows = Array.isArray(line.promotionRows) ? line.promotionRows : [];
      const firstPromotion = promotionRows[0] || line.directPromotionRule || {};

      return attachPackingRate({
        ...item,
        originalPrice: grossPrice,
        grossPrice,
        catalogSalePrice: grossPrice,
        grossAmount,
        directDiscountPercent: Number(line.directDiscountPercent || 0),
        groupDiscountPercent: Number(line.groupDiscountPercent || 0),
        discountPercent: grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0,
        directDiscountAmount,
        groupDiscountAmount,
        discountAmount,
        promotionAmount: discountAmount,
        totalDiscountAmount: discountAmount,
        finalPrice,
        unitPrice: finalPrice,
        salePrice: finalPrice,
        price: finalPrice,
        amount,
        netAmount: amount,
        saleMethod: 'promotion',
        saleMode: 'promotion',
        pricingMode: 'promotion',
        priceLocked: true,
        lockedPrice: true,
        lockedPromotion: true,
        promotionCalculated: true,
        promotionCode: line.promotionCode || firstPromotion.promotionCode || firstPromotion.code || firstPromotion.programCode || '',
        promotionName: line.promotionName || firstPromotion.description || firstPromotion.programName || firstPromotion.name || '',
        promotionRows
      }, item);
    });
  } catch (err) {
    if (!silent) setMessage(message, err.message || 'Không tính được khuyến mại cho giỏ hàng', 'error');
    // Fallback an toàn: vẫn tính theo giá gốc để app không bị treo, backend sẽ tính lại khi lưu đơn.
    cart = cart.map((item) => {
      const quantity = Number(item.quantity || 0);
      const grossPrice = Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
      return {
        ...item,
        originalPrice: grossPrice,
        grossPrice,
        catalogSalePrice: grossPrice,
        unitPrice: grossPrice,
        salePrice: grossPrice,
        price: grossPrice,
        discountAmount: 0,
        promotionAmount: 0,
        totalDiscountAmount: 0,
        amount: Math.round(quantity * grossPrice),
        saleMethod: 'promotion',
        saleMode: 'promotion',
        pricingMode: 'promotion',
        priceLocked: true
      };
    });
  }
}
// MOBILE_SALES_CART_PROMOTION_RECALC_END

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
  // MOBILE_PRODUCT_GROUP_FILTER_NORMALIZE_START: chuẩn hóa Nhóm hàng từ danh mục sản phẩm.
  const groupName = String(
    product.groupName ||
    product.productGroupName ||
    product.productGroup ||
    product.group ||
    product.categoryName ||
    product.category ||
    ''
  ).trim();
  // MOBILE_PRODUCT_GROUP_FILTER_NORMALIZE_END

  return {
    ...product,
    id: product.id || product._id || code,
    code,
    name,
    groupName,
    category: product.category || groupName,
    salePrice: Number(product.salePrice || product.price || 0),
    availableQty,
    stockQuantity: availableQty,
    conversionRate: normalizePackingRate(product),
    packingQty: normalizePackingRate(product),
    unitsPerCase: normalizePackingRate(product),
    stockDisplay: formatStockTL(availableQty, normalizePackingRate(product))
  };
}


// MOBILE_PRODUCT_GROUP_FILTER_OPTIONS_START: tải danh sách Nhóm hàng để lọc sản phẩm trước khi tìm kiếm.
function normalizeProductGroupName(value = '') {
  return String(value || '').trim();
}

function escapeProductGroupHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentProductGroupFilter() {
  return normalizeProductGroupName(productGroupFilter?.value || '');
}

function renderProductGroupOptions(groups = []) {
  if (!productGroupFilter) return;
  const current = currentProductGroupFilter();
  const uniqueGroups = [...new Set((groups || []).map(normalizeProductGroupName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  productGroupFilter.innerHTML = [
    '<option value="">Tất cả nhóm hàng</option>',
    ...uniqueGroups.map((name) => `<option value="${escapeProductGroupHtml(name)}">${escapeProductGroupHtml(name)}</option>`)
  ].join('');
  if (current && uniqueGroups.includes(current)) productGroupFilter.value = current;
}

async function loadProductGroupOptions(force = false) {
  if (!productGroupFilter) return;
  if (productGroupOptionsLoaded && !force) return;
  productGroupOptionsLoaded = true;
  try {
    const data = await mobileApi.getProducts('', { all: true, limit: 5000, inStockOnly: 0 });
    const rows = normalizeProductSearchResponse(data).map(toMobileProduct);
    renderProductGroupOptions(rows.map((row) => row.groupName || row.category));
  } catch (err) {
    console.warn('[mobile-sales] không tải được nhóm hàng sản phẩm:', err.message || err);
  }
}
// MOBILE_PRODUCT_GROUP_FILTER_OPTIONS_END

function resetSelectedProduct() {
  selectedProduct = null;
  if (productSearch) {
    productSearch.dataset.id = '';
    productSearch.dataset.code = '';
    productSearch.dataset.name = '';
    productSearch.dataset.type = '';
  }
  selectedProductBox.textContent = 'Chưa chọn sản phẩm';
  selectedProductBox.classList.add('muted');
}

function pickProduct(product) {
  const p = toMobileProduct(product);
  selectedProduct = p;

  // V45 Unified Search V2: input chỉ là phần hiển thị, dữ liệu chọn thật phải lưu ở dataset.
  // Nếu chỉ set productSearch.value thì khi thêm hàng app không biết chắc sản phẩm đã chọn từ gợi ý nào.
  productSearch.dataset.id = p.id || '';
  productSearch.dataset.code = p.code || '';
  productSearch.dataset.name = p.name || '';
  productSearch.dataset.type = 'product';
  productSearch.value = p.label || [p.code, p.name].filter(Boolean).join(' - ');

  // MOBILE_SELECTED_PRODUCT_CARD_RENDER_START: card SP rõ tồn/giá, phù hợp thao tác nhập hàng trên mobile.
  const selectedProductPrice = Number(p.finalPrice || p.unitPrice || p.salePrice || p.price || 0);
  const selectedProductOriginalPrice = Number(p.originalPrice || p.grossPrice || p.catalogSalePrice || p.salePrice || p.price || 0);
  const selectedProductPriceLabel = selectedProductOriginalPrice > selectedProductPrice
    ? `Giá KM<strong>${money(selectedProductPrice)}</strong>`
    : `Giá bán<strong>${money(selectedProductPrice)}</strong>`;
  const selectedProductOriginalLabel = selectedProductOriginalPrice > selectedProductPrice
    ? `<span>Giá gốc<strong>${money(selectedProductOriginalPrice)}</strong></span>`
    : '';
  selectedProductBox.innerHTML = `
    <div class="mobile-selected-product-name">${p.code || ''} - ${p.name || ''}</div>
    <div class="mobile-selected-product-meta">
      <span>Tồn<strong>${p.stockDisplay || formatStockTL(p.availableQty, p.conversionRate)}</strong></span>
      <span>${selectedProductPriceLabel}</span>
      ${selectedProductOriginalLabel}
    </div>
  `;
  // MOBILE_SELECTED_PRODUCT_CARD_RENDER_END
  selectedProductBox.classList.remove('muted');
  productSuggestions.innerHTML = '';
  productSuggestions.classList.remove('has-many');
  productSuggestions.hidden = true;
  productSuggestions.style.display = 'none';
  looseQtyInput.focus();
}

async function preloadUnifiedProducts(force = false) {
  if (!window.UnifiedProductSearch) throw new Error('Thiếu UnifiedProductSearch. Kiểm tra sales.html đã nhúng productSearchBox.js chưa.');
  if (force && window.CatalogCache) window.CatalogCache.invalidate('products');
  return [];
}

function normalizeProductSearchResponse(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const rows = data.items || data.products || data.rows || data.data || data.result || [];
  return Array.isArray(rows) ? rows : [];
}

async function searchMobileProducts(keyword = '') {
  const q = String(keyword || '').trim();
  if (q.length < 2) return [];

  // Ưu tiên API mobile vì có kèm Authorization token.
  // Sau lần chuẩn hóa Unified Search V2, một số màn đang đọc nhầm data.products/data.rows
  // trong khi API mới trả data.items, làm có request 200 nhưng không render gợi ý.
  try {
    // MOBILE_PRODUCT_GROUP_FILTER_SEARCH_START: tìm sản phẩm trong nhóm hàng đang chọn.
    const data = await mobileApi.getProducts(q, { limit: 50, group: currentProductGroupFilter() });
    // MOBILE_PRODUCT_GROUP_FILTER_SEARCH_END
    const rows = normalizeProductSearchResponse(data).map(toMobileProduct);
    if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') {
      window.UnifiedProductSearch.sync(rows);
    }
    return rows;
  } catch (err) {
    console.warn('[mobile-sales] mobile product search fallback:', err.message || err);
  }

  if (window.UnifiedSearchEngine && typeof window.UnifiedSearchEngine.searchProduct === 'function') {
    const rows = await window.UnifiedSearchEngine.searchProduct(q, { limit: 50, mode: 'sales', includeStock: 1, group: currentProductGroupFilter() });
    return normalizeProductSearchResponse(rows).map(toMobileProduct);
  }

  if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.search === 'function') {
    const rows = await window.UnifiedProductSearch.search(q, { limit: 50, mode: 'sales', group: currentProductGroupFilter() });
    return normalizeProductSearchResponse(rows).map(toMobileProduct);
  }

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
    getItems: () => searchMobileProducts(productSearch.value.trim()),
    label: (product) => (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.label === 'function')
      ? window.UnifiedProductSearch.label(product, 'sales')
      : (product.label || [product.code, product.name].filter(Boolean).join(' - ')),
    select: pickProduct,
    emptyText: 'Không tìm thấy sản phẩm phù hợp'
  });

  productSearch.addEventListener('input', resetSelectedProduct);
  // MOBILE_PRODUCT_GROUP_FILTER_CHANGE_START: đổi nhóm hàng thì xóa SP đang chọn để tránh thêm nhầm.
  productGroupFilter?.addEventListener('change', () => {
    resetSelectedProduct();
    if (productSearch) productSearch.value = '';
    if (productSuggestions) {
      productSuggestions.innerHTML = '';
      productSuggestions.classList.remove('has-many');
      productSuggestions.hidden = true;
      productSuggestions.style.display = 'none';
    }
  });
  loadProductGroupOptions();
  // MOBILE_PRODUCT_GROUP_FILTER_CHANGE_END
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


document.getElementById('addItemBtn').addEventListener('click', async () => {
  // MOBILE_SALES_CART_PROMOTION_RECALC_ADD_START
  setMessage(message, '');
  if (!selectedCustomer) return setMessage(message, 'Chưa chọn khách hàng ở tab 1', 'error');
  if (!selectedProduct) return setMessage(message, 'Chưa chọn sản phẩm', 'error');

  const caseQty = Number(caseQtyInput?.value || 0);
  const looseQty = Number(looseQtyInput?.value || 0);
  const packingRate = normalizePackingRate(selectedProduct);
  const qty = (caseQty > 0 && packingRate > 0 ? caseQty * packingRate : 0) + looseQty;
  if (qty <= 0) return setMessage(message, 'Số lượng phải lớn hơn 0', 'error');

  // V45 fix: tồn hiển thị trên autocomplete có thể bị cache/stale.
  // Không chặn cứng ở frontend khi availableQty = 0/không có; backend sẽ kiểm tra lại tồn Mongo thật khi ghi đơn.
  const availableQty = Number(selectedProduct.availableQty || 0);
  if (availableQty > 0 && qty > availableQty) return setMessage(message, 'Số lượng vượt tồn mở bán', 'error');

  const grossPrice = Number(selectedProduct.salePrice || selectedProduct.price || 0);
  const existed = cart.find((item) => item.productCode === selectedProduct.code);
  if (existed) {
    const nextQty = Number(existed.quantity || 0) + qty;
    if (availableQty > 0 && nextQty > availableQty) return setMessage(message, 'Tổng số lượng vượt tồn mở bán', 'error');
    existed.quantity = nextQty;
    existed.originalPrice = Number(existed.originalPrice || existed.grossPrice || existed.catalogSalePrice || grossPrice);
    existed.grossPrice = existed.originalPrice;
    existed.catalogSalePrice = existed.originalPrice;
    attachPackingRate(existed, {
      conversionRate: existed.conversionRate || selectedProduct.conversionRate,
      unitsPerCase: existed.unitsPerCase || selectedProduct.unitsPerCase,
      packingQty: existed.packingQty || selectedProduct.packingQty,
      packQty: selectedProduct.packQty,
      pack: selectedProduct.pack,
      packageQty: selectedProduct.packageQty
    });
  } else {
    cart.push(attachPackingRate({
      productId: selectedProduct.id,
      productCode: selectedProduct.code,
      productName: selectedProduct.name,
      unit: selectedProduct.unit,
      quantity: qty,
      originalPrice: grossPrice,
      grossPrice,
      catalogSalePrice: grossPrice,
      grossAmount: Math.round(qty * grossPrice),
      unitPrice: grossPrice,
      salePrice: grossPrice,
      price: grossPrice,
      finalPrice: grossPrice,
      discountAmount: 0,
      promotionAmount: 0,
      totalDiscountAmount: 0,
      amount: Math.round(qty * grossPrice),
      saleMethod: 'promotion',
      saleMode: 'promotion',
      pricingMode: 'promotion',
      priceLocked: true
    }, selectedProduct));
  }

  selectedProduct = null;
  productSearch.value = '';
  caseQtyInput.value = '';
  looseQtyInput.value = '';
  selectedProductBox.textContent = 'Chưa chọn sản phẩm';
  selectedProductBox.classList.add('muted');
  await recalculateCartPromotions();
  renderCart();
  setMessage(message, 'Đã thêm vào giỏ hàng và áp giá sau khuyến mại', 'success');
  // MOBILE_SALES_CART_PROMOTION_RECALC_ADD_END
});

function renderCart() {
  const total = cart.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  cartCount.textContent = `${cart.length} dòng`;
  if (cartTabBadge) cartTabBadge.textContent = String(cart.length);
  cartTotal.textContent = money(total);

  if (!cart.length) {
    cartList.className = 'cart-list empty';
    cartList.textContent = 'Chưa có sản phẩm';
    return;
  }

  cartList.className = 'cart-list';
  // MOBILE_SALES_CART_PROMOTION_PRICE_DISPLAY_START
  cartList.innerHTML = cart.map((item, index) => {
    const originalPrice = Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
    const unitPrice = Number(item.unitPrice || item.salePrice || item.price || 0);
    const discountAmount = Number(item.discountAmount || item.promotionAmount || Math.max(0, (originalPrice - unitPrice) * Number(item.quantity || 0)));
    const priceInfo = discountAmount > 0
      ? `Giá gốc: ${money(originalPrice)} · KM: -${money(discountAmount)} · Giá bán: ${money(unitPrice)}`
      : `Giá bán: ${money(unitPrice)}`;
    return `
    <div class="cart-item">
      <strong>${item.productCode} - ${item.productName}</strong>
      <span>SL: ${quantityDisplayTL(item)} · ${priceInfo} · Thành tiền: ${money(item.amount)}</span>
      <button class="danger-btn small-btn" data-remove="${index}">Xóa</button>
    </div>`;
  }).join('');
  // MOBILE_SALES_CART_PROMOTION_PRICE_DISPLAY_END

  cartList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      // MOBILE_SALES_CART_PROMOTION_RECALC_REMOVE_START
      cart.splice(Number(btn.dataset.remove), 1);
      await recalculateCartPromotions({ silent: true });
      renderCart();
      // MOBILE_SALES_CART_PROMOTION_RECALC_REMOVE_END
    });
  });
}


async function loadDebts(options = {}) {
  const silent = !!options.silent;
  const force = !!options.force;
  const isDebtTabActive = document.getElementById('debtTab')?.classList.contains('active');

  if (debtLoading && !force) return;
  if (debtLoaded && !force && debtCache.length && !silent) {
    renderDebts(debtCache, {
      totalDebt: debtCache.reduce((sum, item) => sum + Number(item.debtAmount || 0), 0),
      customerCount: debtCache.length
    });
    return;
  }

  const requestSeq = ++debtRequestSeq;
  debtLoading = true;

  try {
    if (debtList && (!silent || isDebtTabActive)) {
      debtList.className = 'order-list empty';
      debtList.textContent = 'Đang tải công nợ...';
    }

    const data = await mobileApi.getSalesDebts({ limit: 100, includePaid: '0' });

    if (requestSeq !== debtRequestSeq) return;

    debtCache = Array.isArray(data.items) ? data.items : [];
    debtLoaded = true;

    if (debtList) renderDebts(debtCache, data.summary || {});
    if (Array.isArray(lastCustomers) && lastCustomers.length) renderCustomerList(lastCustomers);
  } catch (err) {
    if (requestSeq !== debtRequestSeq) return;
    debtLoaded = false;

    // Không nuốt lỗi khi người dùng đang ở tab Công nợ. Trước đây initSalesApp gọi silent=true,
    // nếu API lỗi thì UI đứng mãi ở "Đang tải công nợ..." và người dùng không biết nguyên nhân.
    if (debtList && (!silent || isDebtTabActive)) {
      debtList.className = 'order-list empty error-text';
      debtList.textContent = err.message || 'Không tải được công nợ';
    }
    if (debtTotalAmount && (!silent || isDebtTabActive)) debtTotalAmount.textContent = '0';
    if (debtCustomerCount && (!silent || isDebtTabActive)) debtCustomerCount.textContent = '0';
  } finally {
    if (requestSeq === debtRequestSeq) debtLoading = false;
  }
}

function renderDebts(items = debtCache, summary = {}) {
  const total = Number(summary.totalDebt ?? items.reduce((sum, item) => sum + Number(item.debtAmount || 0), 0));
  if (debtTotalAmount) debtTotalAmount.textContent = money(total);
  if (debtCustomerCount) debtCustomerCount.textContent = String(summary.customerCount ?? items.length);

  if (!items.length) {
    debtList.className = 'order-list empty';
    debtList.textContent = 'Không có khách hàng còn nợ';
    if (debtLedgerList) {
      debtLedgerList.className = 'order-list empty';
      debtLedgerList.textContent = 'Chọn khách hàng để xem chi tiết.';
    }
    return;
  }

  debtList.className = 'order-list';
  debtList.innerHTML = items.map((item, index) => `
    <button class="debt-card" data-debt-index="${index}">
      <strong>${item.customerCode || ''} - ${item.customerName || ''}</strong>
      <span>Công nợ: ${money(item.debtAmount || 0)} · ${item.orderCount || 0} đơn · Nợ cũ nhất: ${formatDisplayDate(item.oldestDebtDate || '')}</span>
    </button>
  `).join('');

  debtList.querySelectorAll('[data-debt-index]').forEach((btn) => {
    btn.addEventListener('click', () => renderDebtLedger(items[Number(btn.dataset.debtIndex)]));
  });
}

function renderDebtLedger(item = {}) {
  const rows = Array.isArray(item.ledgers) ? item.ledgers : [];
  if (!debtLedgerList) return;
  if (!rows.length) {
    debtLedgerList.className = 'order-list empty';
    debtLedgerList.textContent = 'Khách hàng này chưa có dòng sổ công nợ.';
    return;
  }
  let balance = 0;
  debtLedgerList.className = 'order-list';
  debtLedgerList.innerHTML = rows.map((row) => {
    balance += Number(row.debit || 0) - Number(row.credit || 0);
    return `
      <div class="order-item">
        <strong>${formatDisplayDate(row.date)} · ${row.type || row.refType || ''}</strong>
        <span>Đơn: ${row.salesOrderCode || row.refCode || ''}</span>
        <span>Phát sinh: ${money(row.debit || 0)} · Thanh toán: ${money(row.credit || 0)} · Dư nợ: ${money(Math.max(0, balance))}</span>
      </div>
    `;
  }).join('');
}

submitOrderBtn.addEventListener('click', async () => {
  if (submitOrderBtn.disabled) return;
  setMessage(message, '');
  if (!selectedCustomer) return setMessage(message, 'Chưa chọn khách hàng', 'error');
  const customerPayload = normalizeSelectedCustomerForSubmit(selectedCustomer);
  if (!customerPayload.code && !customerPayload.customerCode && !customerPayload.id && !customerPayload.customerId) {
    return setMessage(message, 'Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng', 'error');
  }
  if (!cart.length) return setMessage(message, 'Chưa có sản phẩm', 'error');
  setButtonBusy(submitOrderBtn, true);

  try {
    const paidAmount = Number(paidAmountInput.value || 0);
    // MOBILE_SALES_CART_PROMOTION_RECALC_SUBMIT_START
    await recalculateCartPromotions({ silent: true });
    const payload = {
      customer: customerPayload,
      customerId: customerPayload.customerId || customerPayload.id || customerPayload.code || '',
      customerCode: customerPayload.customerCode || customerPayload.code || '',
      customerName: customerPayload.customerName || customerPayload.name || '',
      items: cart.map((item) => ({
        ...item,
        grossPrice: Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
        originalPrice: Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
        unitPrice: Number(item.unitPrice || item.finalPrice || item.salePrice || item.price || 0),
        salePrice: Number(item.salePrice || item.unitPrice || item.finalPrice || item.price || 0),
        finalPrice: Number(item.finalPrice || item.unitPrice || item.salePrice || item.price || 0),
        discountAmount: Number(item.discountAmount || item.promotionAmount || item.totalDiscountAmount || 0),
        amount: Number(item.amount || 0),
        saleMode: 'promotion',
        saleMethod: 'promotion',
        pricingMode: 'promotion',
        priceLocked: true
      })),
      paidAmount,
      note: editingOrderId ? 'Sửa từ app bán hàng mobile' : 'Tạo từ app bán hàng mobile'
    };
    // MOBILE_SALES_CART_PROMOTION_RECALC_SUBMIT_END
    const data = editingOrderId
      ? await mobileApi.updateSalesOrder(editingOrderId, payload)
      : await mobileApi.createSalesOrder(payload);

    const code = data.salesOrder?.code || '';
    clearOrderForm(false);
    upsertTodayOrder(data.salesOrder);
    setMessage(message, `${data.message || 'Đã lưu đơn'} ${code}`, 'success');
    await loadDebts();
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
      // MOBILE_SALES_CART_PROMOTION_PRICE_DISPLAY_START
      originalPrice: Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
      unitPrice: Number(item.unitPrice || item.salePrice || item.price || 0),
      salePrice: Number(item.salePrice || item.unitPrice || item.price || 0),
      price: Number(item.price || item.unitPrice || item.salePrice || 0),
      discountAmount: Number(item.discountAmount || item.promotionAmount || item.totalDiscountAmount || 0),
      promotionAmount: Number(item.promotionAmount || item.discountAmount || item.totalDiscountAmount || 0),
      amount: Number(item.amount || Number(item.quantity || 0) * Number(item.unitPrice || item.salePrice || item.price || 0)),
      promotionCode: item.promotionCode || '',
      promotionName: item.promotionName || ''
      // MOBILE_SALES_CART_PROMOTION_PRICE_DISPLAY_END
    }));
    paidAmountInput.value = Number(order.paidAmount || 0);
    orderFormTitle.textContent = `Sửa đơn ${order.code || ''}`;
    submitOrderBtn.textContent = `Lưu sửa đơn ${order.code || ''}`;
    // MOBILE_SALES_CART_PROMOTION_RECALC_EDIT_START
    await recalculateCartPromotions({ silent: true });
    // MOBILE_SALES_CART_PROMOTION_RECALC_EDIT_END
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
