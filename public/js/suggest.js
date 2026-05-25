// public/js/suggest.js
// Engine gợi ý dùng chung toàn hệ thống.
// Mục tiêu: 1 lõi tìm kiếm chung, nhiều adapter riêng cho sản phẩm/khách hàng/nhân viên.
(function(){
  const norm = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();

  const num = value => {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  };

  function normalizeEntries(values){
    const out = [];
    const seen = new Set();
    (values || []).forEach(item => {
      const value = String(item?.value ?? item ?? '').trim();
      if (!value) return;
      const label = String(item?.label ?? value).trim();
      const meta = String(item?.meta ?? '').trim();
      const search = String(item?.search ?? [value, label, meta].filter(Boolean).join(' ')).trim();
      const key = norm([value, label, meta].join('|'));
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value, label, meta, search });
    });
    return out;
  }

  function search(entries, keyword, options = {}){
    const k = norm(keyword);
    const max = options.max || 12;
    if (!k) return normalizeEntries(entries).slice(0, max);
    return normalizeEntries(entries)
      .filter(item => norm([item.value, item.label, item.meta, item.search].join(' ')).includes(k))
      .slice(0, max);
  }

  function productEntries(products, stockQty){
    return normalizeEntries((products || []).map(p => {
      const sku = String(p.sku || p.code || '').trim();
      const name = String(p.name || '').trim();
      const stock = typeof stockQty === 'function' ? stockQty(sku) : num(p.stock || p.qty);
      return {
        value: sku,
        label: [sku, name].filter(Boolean).join(' · '),
        meta: [`Tồn kho: ${stock} ${p.unit || 'lẻ'}`, p.warehouse ? `Kho: ${p.warehouse}` : ''].filter(Boolean).join('  |  '),
        search: [sku, name, p.brand, p.category, p.warehouse, stock].filter(Boolean).join(' '),
        raw: p
      };
    }));
  }

  function customerEntries(customers, valueField = 'code'){
    return normalizeEntries((customers || []).map(c => ({
      value: valueField === 'name' ? c.name : valueField === 'phone' ? c.phone : valueField === 'address' ? c.address : c.code,
      label: [c.code, c.name].filter(Boolean).join(' · '),
      meta: [c.address, c.phone ? `SĐT: ${c.phone}` : ''].filter(Boolean).join('  |  '),
      search: [c.code, c.name, c.address, c.phone].filter(Boolean).join(' '),
      raw: c
    })));
  }

  function staffEntries(staff, valueField = 'code'){
    return normalizeEntries((staff || []).map(st => {
      const code = st.code || st.staffCode || st.username || '';
      const name = st.name || st.fullName || st.displayName || '';
      const phone = st.phone || st.tel || st.mobile || '';
      return {
        value: valueField === 'name' ? name : code,
        label: [code, name].filter(Boolean).join(' · '),
        meta: phone ? `SĐT: ${phone}` : (st.role ? `Vai trò: ${st.role}` : ''),
        search: [code, name, phone, st.username, st.role].filter(Boolean).join(' '),
        raw: st
      };
    }));
  }

  function findProduct(products, value){
    const k = norm(value);
    return (products || []).find(p => norm(p.sku || p.code) === k || norm(p.name) === k) || null;
  }

  function findCustomer(customers, value){
    const k = norm(value);
    return (customers || []).find(c => norm(c.code) === k || norm(c.name) === k || norm(c.phone) === k) || null;
  }

  function findStaff(staff, value){
    const k = norm(value);
    return (staff || []).find(s => norm(s.code || s.staffCode || s.username) === k || norm(s.name || s.fullName || s.displayName) === k) || null;
  }

  window.KhoSuggestEngine = {
    norm,
    normalizeEntries,
    search,
    productEntries,
    customerEntries,
    staffEntries,
    findProduct,
    findCustomer,
    findStaff
  };
})();
