'use strict';

(function initFundSummaryBook() {
  const state = {
    page: 1,
    limit: 50,
    sortBy: 'netAmount',
    sortOrder: 'desc',
    loading: false,
    loadedOnce: false,
    pagination: { page: 1, totalPages: 1, totalRows: 0 },
    detail: { personKey: '', personName: '', page: 1, limit: 50, totalPages: 1 }
  };

  const byId = (id) => document.getElementById(id);
  const els = {
    fromDate: byId('fundSummaryDateFrom'),
    toDate: byId('fundSummaryDateTo'),
    person: byId('fundSummaryPersonSearch'),
    role: byId('fundSummaryRoleFilter'),
    transactionType: byId('fundSummaryTransactionFilter'),
    fund: byId('fundSummaryFundFilter'),
    apply: byId('applyFundSummaryFiltersButton'),
    reset: byId('resetFundSummaryFiltersButton'),
    export: byId('exportFundSummaryButton'),
    message: byId('fundSummaryBookMessage'),
    body: byId('fundSummaryTableBody'),
    prev: byId('fundSummaryPrevPage'),
    next: byId('fundSummaryNextPage'),
    pageInfo: byId('fundSummaryPageInfo'),
    deposited: byId('fundSummaryDepositedKpi'),
    expense: byId('fundSummaryExpenseKpi'),
    net: byId('fundSummaryNetKpi'),
    people: byId('fundSummaryPeopleKpi'),
    depositCount: byId('fundSummaryDepositCountKpi'),
    expenseCount: byId('fundSummaryExpenseCountKpi'),
    transfer: byId('fundSummaryTransferKpi'),
    modal: byId('fundSummaryDetailModal'),
    detailTitle: byId('fundSummaryDetailTitle'),
    detailSubtitle: byId('fundSummaryDetailSubtitle'),
    detailMessage: byId('fundSummaryDetailMessage'),
    detailBody: byId('fundSummaryDetailTable'),
    detailClose: byId('closeFundSummaryDetailModal'),
    detailPrev: byId('fundSummaryDetailPrevPage'),
    detailNext: byId('fundSummaryDetailNextPage'),
    detailPageInfo: byId('fundSummaryDetailPageInfo'),
    detailDeposited: byId('fundSummaryDetailDeposited'),
    detailExpense: byId('fundSummaryDetailExpense'),
    detailNet: byId('fundSummaryDetailNet'),
    detailTransfer: byId('fundSummaryDetailTransfer')
  };

  if (!els.body || !els.fromDate || !els.toDate) return;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const result = String(value).trim();
    if (!result || result === 'undefined' || result === 'null' || result === '[object Object]') return fallback;
    return result;
  }

  function money(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? new Intl.NumberFormat('vi-VN').format(Math.round(number)) : '0';
  }

  function todayInVietnam() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function dateTimeVN(value) {
    const raw = safeText(value);
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
    }
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function transactionLabel(value) {
    const labels = { DEPOSIT: 'Nộp tiền', EXPENSE: 'Chi tiền', TRANSFER: 'Chuyển quỹ nội bộ' };
    return labels[safeText(value).toUpperCase()] || 'Khác';
  }

  function fundLabel(row) {
    const fundTypes = Array.isArray(row?.fundTypes) ? row.fundTypes : [];
    const accounts = Array.isArray(row?.accounts) ? row.accounts : [];
    const labels = fundTypes.map((item) => item === 'bank' ? 'Ngân hàng' : 'Tiền mặt');
    return [...new Set([...labels, ...accounts.map((item) => safeText(item)).filter(Boolean)])].join(' / ');
  }

  function setMessage(target, value, isError = false) {
    if (!target) return;
    target.textContent = safeText(value);
    target.classList.toggle('error', Boolean(isError));
  }

  async function readJson(response, fallbackMessage) {
    const contentType = safeText(response.headers.get('content-type')).toLowerCase();
    const text = await response.text();
    if (contentType.includes('application/json')) {
      let data;
      try { data = JSON.parse(text || '{}'); }
      catch (error) { throw new Error(`${fallbackMessage}: JSON không hợp lệ`); }
      if (!response.ok || data.success === false || data.ok === false) throw new Error(data.message || fallbackMessage);
      return data;
    }
    throw new Error(`${fallbackMessage} (HTTP ${response.status})`);
  }

  function buildParams({ page = state.page, limit = state.limit, includePaging = true } = {}) {
    const params = new URLSearchParams();
    params.set('fromDate', els.fromDate.value || todayInVietnam());
    params.set('toDate', els.toDate.value || els.fromDate.value || todayInVietnam());
    const q = safeText(els.person?.value);
    if (q) params.set('q', q);
    const role = safeText(els.role?.value);
    if (role) params.set('personRole', role);
    const transactionType = safeText(els.transactionType?.value, 'all');
    params.set('transactionType', transactionType || 'all');
    const fund = safeText(els.fund?.value);
    if (fund) params.set('fundCode', fund);
    params.set('sortBy', state.sortBy);
    params.set('sortOrder', state.sortOrder);
    if (includePaging) {
      params.set('page', String(page));
      params.set('limit', String(limit));
    }
    return params;
  }

  function setLoading(loading) {
    state.loading = loading;
    [els.fromDate, els.toDate, els.person, els.role, els.transactionType, els.fund, els.apply, els.reset, els.export]
      .filter(Boolean).forEach((element) => { element.disabled = loading; });
    if (els.apply) els.apply.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function renderTotals(totals = {}) {
    if (els.deposited) els.deposited.textContent = money(totals.totalDeposited);
    if (els.expense) els.expense.textContent = money(totals.totalExpense);
    if (els.net) els.net.textContent = money(totals.netAmount);
    if (els.people) els.people.textContent = money(totals.totalPeople);
    if (els.depositCount) els.depositCount.textContent = money(totals.depositVoucherCount);
    if (els.expenseCount) els.expenseCount.textContent = money(totals.expenseVoucherCount);
    if (els.transfer) els.transfer.textContent = `${money(totals.internalTransferAmount)} (${money(totals.internalTransferCount)} phiếu)`;
  }

  function renderRows(rows = [], pagination = {}) {
    if (!rows.length) {
      els.body.innerHTML = '<tr><td colspan="12">Không có giao dịch phù hợp bộ lọc.</td></tr>';
    } else {
      const start = (Number(pagination.page || 1) - 1) * Number(pagination.limit || state.limit);
      els.body.innerHTML = rows.map((row, index) => `
        <tr>
          <td class="center">${start + index + 1}</td>
          <td>${escapeHtml(safeText(row.personCode, '—'))}</td>
          <td>${escapeHtml(safeText(row.personName, 'Chưa xác định'))}</td>
          <td>${escapeHtml(safeText(row.personRole, 'Chưa xác định'))}</td>
          <td class="numeric">${money(row.depositedAmount)}</td>
          <td class="center">${money(row.depositVoucherCount)}</td>
          <td class="numeric">${money(row.expenseAmount)}</td>
          <td class="center">${money(row.expenseVoucherCount)}</td>
          <td class="numeric ${Number(row.netAmount || 0) < 0 ? 'fund-summary-negative' : ''}">${money(row.netAmount)}</td>
          <td class="numeric">${money(row.internalTransferAmount)}</td>
          <td>${escapeHtml(dateTimeVN(row.lastTransactionAt) || '—')}</td>
          <td><button type="button" class="secondary compact-action fund-summary-detail-button" data-person-key="${escapeHtml(safeText(row.personKey))}" data-person-name="${escapeHtml(safeText(row.personName, 'Chưa xác định'))}">Xem chi tiết</button></td>
        </tr>`).join('');
      els.body.querySelectorAll('.fund-summary-detail-button').forEach((button) => {
        button.addEventListener('click', () => openDetail(button.dataset.personKey, button.dataset.personName));
      });
    }

    state.pagination = {
      page: Number(pagination.page || 1),
      totalPages: Math.max(1, Number(pagination.totalPages || 0)),
      totalRows: Number(pagination.totalRows || 0)
    };
    if (els.pageInfo) els.pageInfo.textContent = `Trang ${state.pagination.page}/${state.pagination.totalPages} · ${money(state.pagination.totalRows)} dòng`;
    if (els.prev) els.prev.disabled = state.loading || state.pagination.page <= 1;
    if (els.next) els.next.disabled = state.loading || state.pagination.page >= state.pagination.totalPages;
  }

  function updateSortButtons() {
    document.querySelectorAll('.fund-summary-sort').forEach((button) => {
      const active = button.dataset.sort === state.sortBy;
      button.classList.toggle('active', active);
      button.setAttribute('aria-sort', active ? (state.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none');
      const base = safeText(button.dataset.label || button.textContent).replace(/[ ↑↓]+$/, '');
      button.dataset.label = base;
      button.textContent = active ? `${base} ${state.sortOrder === 'asc' ? '↑' : '↓'}` : base;
    });
  }

  async function load({ resetPage = false } = {}) {
    if (state.loading) return;
    if (resetPage) state.page = 1;
    setLoading(true);
    setMessage(els.message, 'Đang tải dữ liệu tổng hợp...');
    if (!state.loadedOnce) els.body.innerHTML = '<tr><td colspan="12">Đang tải Sổ quỹ tổng hợp...</td></tr>';
    try {
      const response = await fetch(`/api/funds/summary?${buildParams().toString()}`, { headers: { Accept: 'application/json' } });
      const data = await readJson(response, 'Không tải được Sổ quỹ tổng hợp');
      renderTotals(data.totals || {});
      renderRows(Array.isArray(data.rows) ? data.rows : [], data.pagination || {});
      state.loadedOnce = true;
      setMessage(els.message, `Đã tổng hợp ${money(data.pagination?.totalRows || 0)} người trong khoảng ${els.fromDate.value} đến ${els.toDate.value}.`);
      updateSortButtons();
    } catch (error) {
      renderTotals({});
      els.body.innerHTML = `<tr><td colspan="12">${escapeHtml(error.message || 'Không tải được dữ liệu')}</td></tr>`;
      setMessage(els.message, error.message || 'Không tải được dữ liệu', true);
    } finally {
      setLoading(false);
      renderRowsAfterLoading();
    }
  }

  function renderRowsAfterLoading() {
    if (els.prev) els.prev.disabled = state.pagination.page <= 1;
    if (els.next) els.next.disabled = state.pagination.page >= state.pagination.totalPages;
  }

  function resetFilters() {
    const today = todayInVietnam();
    els.fromDate.value = today;
    els.toDate.value = today;
    if (els.person) els.person.value = '';
    if (els.role) els.role.value = '';
    if (els.transactionType) els.transactionType.value = 'all';
    if (els.fund) els.fund.value = '';
    state.page = 1;
    state.sortBy = 'netAmount';
    state.sortOrder = 'desc';
    return load();
  }

  async function exportExcel() {
    if (state.loading) return;
    setLoading(true);
    setMessage(els.message, 'Đang tạo file Excel từ cùng bộ lọc...');
    try {
      const response = await fetch(`/api/funds/summary/export?${buildParams({ includePaging: false }).toString()}`);
      if (!response.ok) {
        const data = await readJson(response, 'Không xuất được Excel');
        throw new Error(data.message || 'Không xuất được Excel');
      }
      const blob = await response.blob();
      const disposition = safeText(response.headers.get('content-disposition'));
      const utfName = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const fileName = utfName ? decodeURIComponent(utfName[1]) : `So_quy_tong_hop_${els.fromDate.value}_den_${els.toDate.value}.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(els.message, 'Đã xuất Excel Sổ quỹ tổng hợp.');
    } catch (error) {
      setMessage(els.message, error.message || 'Không xuất được Excel', true);
    } finally {
      setLoading(false);
      renderRowsAfterLoading();
    }
  }

  function renderDetailTotals(totals = {}) {
    if (els.detailDeposited) els.detailDeposited.textContent = money(totals.depositedAmount);
    if (els.detailExpense) els.detailExpense.textContent = money(totals.expenseAmount);
    if (els.detailNet) els.detailNet.textContent = money(totals.netAmount);
    if (els.detailTransfer) els.detailTransfer.textContent = money(totals.internalTransferAmount);
  }

  function renderDetailRows(rows = []) {
    if (!rows.length) {
      els.detailBody.innerHTML = '<tr><td colspan="9">Không có chứng từ phù hợp.</td></tr>';
      return;
    }
    els.detailBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(dateTimeVN(row.transactionAt || row.transactionDate) || '—')}</td>
        <td>${escapeHtml(safeText(row.voucherCode, '—'))}</td>
        <td>${escapeHtml(transactionLabel(row.transactionClass))}</td>
        <td>${escapeHtml(fundLabel(row) || '—')}</td>
        <td>${escapeHtml((Array.isArray(row.notes) ? row.notes : []).map((item) => safeText(item)).filter(Boolean).join(' | ') || '—')}</td>
        <td class="numeric">${money(row.depositedAmount)}</td>
        <td class="numeric">${money(row.expenseAmount)}</td>
        <td>${escapeHtml((Array.isArray(row.creators) ? row.creators : []).map((item) => safeText(item)).filter(Boolean).join(' | ') || '—')}</td>
        <td>${escapeHtml((Array.isArray(row.statuses) ? row.statuses : []).map((item) => safeText(item)).filter(Boolean).join(' | ') || 'posted')}</td>
      </tr>`).join('');
  }

  async function loadDetail() {
    if (!state.detail.personKey) return;
    setMessage(els.detailMessage, 'Đang tải chi tiết...');
    els.detailBody.innerHTML = '<tr><td colspan="9">Đang tải chi tiết chứng từ...</td></tr>';
    try {
      const params = buildParams({ page: state.detail.page, limit: state.detail.limit });
      const response = await fetch(`/api/funds/summary/${encodeURIComponent(state.detail.personKey)}/transactions?${params.toString()}`, { headers: { Accept: 'application/json' } });
      const data = await readJson(response, 'Không tải được chi tiết');
      renderDetailTotals(data.totals || {});
      renderDetailRows(Array.isArray(data.transactions) ? data.transactions : []);
      state.detail.totalPages = Math.max(1, Number(data.pagination?.totalPages || 0));
      if (els.detailPageInfo) els.detailPageInfo.textContent = `Trang ${state.detail.page}/${state.detail.totalPages} · ${money(data.pagination?.totalRows || 0)} chứng từ`;
      if (els.detailPrev) els.detailPrev.disabled = state.detail.page <= 1;
      if (els.detailNext) els.detailNext.disabled = state.detail.page >= state.detail.totalPages;
      setMessage(els.detailMessage, 'Chi tiết dùng cùng điều kiện lọc với dòng tổng hợp.');
    } catch (error) {
      renderDetailTotals({});
      els.detailBody.innerHTML = `<tr><td colspan="9">${escapeHtml(error.message || 'Không tải được chi tiết')}</td></tr>`;
      setMessage(els.detailMessage, error.message || 'Không tải được chi tiết', true);
    }
  }

  function openDetail(personKey, personName) {
    state.detail.personKey = safeText(personKey);
    state.detail.personName = safeText(personName, 'Chưa xác định');
    state.detail.page = 1;
    if (els.detailTitle) els.detailTitle.textContent = `Chi tiết: ${state.detail.personName}`;
    if (els.detailSubtitle) els.detailSubtitle.textContent = `Khóa nhóm: ${state.detail.personKey}`;
    if (els.modal) {
      els.modal.classList.add('show');
      els.modal.setAttribute('aria-hidden', 'false');
    }
    loadDetail();
  }

  function closeDetail() {
    if (!els.modal) return;
    els.modal.classList.remove('show');
    els.modal.setAttribute('aria-hidden', 'true');
  }

  const initialToday = todayInVietnam();
  if (!els.fromDate.value) els.fromDate.value = initialToday;
  if (!els.toDate.value) els.toDate.value = initialToday;

  els.apply?.addEventListener('click', () => load({ resetPage: true }));
  els.reset?.addEventListener('click', resetFilters);
  els.export?.addEventListener('click', exportExcel);
  els.person?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    load({ resetPage: true });
  });
  els.prev?.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    load();
  });
  els.next?.addEventListener('click', () => {
    if (state.page >= state.pagination.totalPages) return;
    state.page += 1;
    load();
  });
  document.querySelectorAll('.fund-summary-sort').forEach((button) => {
    button.addEventListener('click', () => {
      const field = safeText(button.dataset.sort);
      if (!field) return;
      if (state.sortBy === field) state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      else {
        state.sortBy = field;
        state.sortOrder = 'desc';
      }
      load({ resetPage: true });
    });
  });
  els.detailClose?.addEventListener('click', closeDetail);
  els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeDetail(); });
  els.detailPrev?.addEventListener('click', () => {
    if (state.detail.page <= 1) return;
    state.detail.page -= 1;
    loadDetail();
  });
  els.detailNext?.addEventListener('click', () => {
    if (state.detail.page >= state.detail.totalPages) return;
    state.detail.page += 1;
    loadDetail();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.modal?.classList.contains('show')) closeDetail();
  });

  updateSortButtons();
  window.FundSummaryBook = { load, reset: resetFilters, openDetail, closeDetail };
})();
