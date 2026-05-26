import { mobileApi, getUser } from './api.js';
import { bindLogout, debounce, money, renderSuggestions, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['sales']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'sales'}`;

let selectedCustomer = null;
let selectedProduct = null;
let cart = [];

const customerSearch = document.getElementById('customerSearch');
const productSearch = document.getElementById('productSearch');
const customerSuggestions = document.getElementById('customerSuggestions');
const productSuggestions = document.getElementById('productSuggestions');
const selectedCustomerBox = document.getElementById('selectedCustomer');
const selectedProductBox = document.getElementById('selectedProduct');
const qtyInput = document.getElementById('qtyInput');
const paidAmountInput = document.getElementById('paidAmountInput');
const cartList = document.getElementById('cartList');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');
const todayOrders = document.getElementById('todayOrders');
const message = document.getElementById('salesMessage');

customerSearch.addEventListener('input', debounce(searchCustomers));
productSearch.addEventListener('input', debounce(searchProducts));
document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadTodayOrders);

loadTodayOrders();

async function searchCustomers() {
  const q = customerSearch.value.trim();
  if (!q) {
    customerSuggestions.innerHTML = '';
    return;
  }

  try {
    const data = await mobileApi.getCustomers(q);
    renderSuggestions(
      customerSuggestions,
      data.items,
      c => `<strong>${c.code || ''} - ${c.name || ''}</strong><span>${c.phone || ''} · ${c.address || ''}</span>`,
      c => {
        selectedCustomer = c;
        selectedCustomerBox.textContent = `${c.code || ''} - ${c.name || ''} - ${c.phone || ''} - ${c.address || ''}`;
        selectedCustomerBox.classList.remove('muted');
        customerSuggestions.innerHTML = '';
        customerSearch.value = c.name || c.code || '';
      }
    );
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

async function searchProducts() {
  const q = productSearch.value.trim();
  if (!q) {
    productSuggestions.innerHTML = '';
    return;
  }

  try {
    const data = await mobileApi.getProducts(q);
    renderSuggestions(
      productSuggestions,
      data.items,
      p => `<strong>${p.code || ''} - ${p.name || ''}</strong><span>Tồn mở bán: ${p.availableQty ?? 0} · Giá: ${money(p.salePrice)}</span>`,
      p => {
        selectedProduct = p;
        selectedProductBox.textContent = `${p.code || ''} - ${p.name || ''} | Tồn mở bán: ${p.availableQty ?? 0} | Giá: ${money(p.salePrice)}`;
        selectedProductBox.classList.remove('muted');
        productSuggestions.innerHTML = '';
        productSearch.value = p.name || p.code || '';
        qtyInput.focus();
      }
    );
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

document.getElementById('addItemBtn').addEventListener('click', () => {
  setMessage(message, '');
  const qty = Number(qtyInput.value || 0);
  if (!selectedProduct) return setMessage(message, 'Chưa chọn sản phẩm', 'error');
  if (qty <= 0) return setMessage(message, 'Số lượng phải lớn hơn 0', 'error');
  if (qty > Number(selectedProduct.availableQty || 0)) {
    return setMessage(message, 'Số lượng vượt tồn mở bán', 'error');
  }

  const existed = cart.find(item => item.productCode === selectedProduct.code);
  if (existed) {
    const nextQty = existed.quantity + qty;
    if (nextQty > Number(selectedProduct.availableQty || 0)) {
      return setMessage(message, 'Tổng số lượng vượt tồn mở bán', 'error');
    }
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
  qtyInput.value = '';
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

  cartList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });
}

document.getElementById('submitOrderBtn').addEventListener('click', async () => {
  setMessage(message, '');
  if (!selectedCustomer) return setMessage(message, 'Chưa chọn khách hàng', 'error');
  if (!cart.length) return setMessage(message, 'Chưa có sản phẩm', 'error');

  try {
    const paidAmount = Number(paidAmountInput.value || 0);
    const data = await mobileApi.createSalesOrder({
      customer: selectedCustomer,
      items: cart,
      paidAmount,
      note: 'Tạo từ app bán hàng mobile'
    });
    cart = [];
    paidAmountInput.value = '';
    renderCart();
    setMessage(message, `Đã gửi đơn ${data.salesOrder?.code || ''} về hệ thống tổng`, 'success');
    loadTodayOrders();
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
});

async function loadTodayOrders() {
  try {
    const data = await mobileApi.getMySalesOrders();
    const items = data.items || [];
    if (!items.length) {
      todayOrders.className = 'order-list empty';
      todayOrders.textContent = 'Chưa có đơn';
      return;
    }

    todayOrders.className = 'order-list';
    todayOrders.innerHTML = items.map(order => `
      <div class="order-item">
        <strong>${order.code} - ${order.customerName || ''}</strong>
        <span>Tổng: ${money(order.totalAmount)} · Đã thu: ${money(order.paidAmount)} · Còn nợ: ${money(order.debtAmount)}</span>
        <span>Trạng thái: ${order.status || ''} / ${order.deliveryStatus || ''}</span>
      </div>
    `).join('');
  } catch (err) {
    todayOrders.className = 'order-list empty';
    todayOrders.textContent = err.message;
  }
}
