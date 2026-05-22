// Loader đồng bộ để các component có mặt trong DOM trước khi core.js chạy.
// Giữ nguyên id/class/function inline trong HTML gốc.
(function(){
  const pages = ["dashboard", "productCatalog", "products", "receive", "sale", "orders", "mergeOrders", "customers", "staff", "deliveryStaff", "accounts", "debts", "salesApp", "deliveryApp", "promotions", "reports"];
  const root = document.getElementById('sectionsRoot');
  if(!root) return;
  let html = '';
  for (const page of pages) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `components/${page}.html`, false);
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 300) html += xhr.responseText + '\n';
    else console.error('Không tải được component:', page, xhr.status);
  }
  root.innerHTML = html;
})();
