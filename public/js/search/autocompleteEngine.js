/*
 * Autocomplete Engine - module dùng chung cho toàn hệ thống.
 * Phase 3.6: hỗ trợ getItems async để server-side search + lazy cache.
 */
(function(){
  'use strict';

  const wiredInputs = new WeakMap();

  function normalizeText(value){
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d')
      .trim();
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
  }

  function matchText(keyword, terms){
    const q = normalizeText(keyword);
    if(!q) return true;
    return (terms || []).some(term => normalizeText(term).includes(q));
  }

  function ensureHost(input, box){
    if(!input || !box) return;
    const host = input.closest('.autocomplete') || input.parentElement;
    if(host){
      host.classList.add('autocomplete-host');
      if(box.parentElement !== host) input.insertAdjacentElement('afterend', box);
    }
    box.classList.add('suggestions');
    box.setAttribute('role','listbox');
  }

  function show(box){
    if(!box) return;
    box.hidden = false;
    box.style.display = 'block';
  }

  function hide(box){
    if(!box) return;
    box.hidden = true;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function clearSelected(input){
    if(!input) return;
    const currentId = input.dataset.selectedId || '';
    if(!currentId) return;
    input.dataset.selectedId = '';
    if(input.dataset.targetHidden){
      const hidden = document.getElementById(input.dataset.targetHidden);
      if(hidden) hidden.value = '';
    }
  }

  function render({box, items, label, onPick, emptyText='Không tìm thấy dữ liệu'}){
    if(!box) return [];
    const originalCount = (items || []).length;
    const list = (items || []).slice(0, 50);
    show(box);
    box.classList.toggle('has-many', box.id === 'productSuggestions' && originalCount > 6);
    if(!list.length){
      box.classList.remove('has-many');
      box.innerHTML = `<div class="suggestion-item muted">${escapeHtml(emptyText)}</div>`;
      return list;
    }
    const headerHtml = (box.id === 'productSuggestions' && originalCount > 6)
      ? `<div class="suggestion-empty suggestion-scroll-note">Có ${originalCount} sản phẩm. Kéo trong khung để xem thêm.</div>`
      : '';
    box.innerHTML = headerHtml + list.map((item, index) => {
      const rawLabel = label(item);
      const htmlLabel = (box.id === 'productSuggestions'
        && window.UnifiedProductSearch
        && typeof window.UnifiedProductSearch.labelHtml === 'function')
        ? window.UnifiedProductSearch.labelHtml(item, 'sales')
        : escapeHtml(rawLabel);
      return `<button type="button" class="suggestion-item" role="option" data-index="${index}">${htmlLabel}</button>`;
    }).join('');
    box.querySelectorAll('.suggestion-item[data-index]').forEach(button => {
      button.addEventListener('mousedown', event => {
        event.preventDefault();
        const picked = list[Number(button.dataset.index)];
        if(picked) onPick(picked);
      });
    });
    return list;
  }

  function renderStatus(box, text){
    if(!box) return;
    show(box);
    box.innerHTML = `<div class="suggestion-item muted">${escapeHtml(text)}</div>`;
  }

  function debounce(fn, delay){
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function wire(options){
    const {
      input,
      box,
      getItems,
      label,
      select,
      emptyText='Không tìm thấy dữ liệu',
      loadingText='Đang tìm...',
      minChars=0,
      debounceMs=180,
      clearOnInput=true
    } = options || {};

    if(!input || !box || typeof getItems !== 'function' || typeof label !== 'function' || typeof select !== 'function') return;

    const oldCleanup = wiredInputs.get(input);
    if(typeof oldCleanup === 'function') oldCleanup();

    ensureHost(input, box);

    let activeIndex = -1;
    let currentItems = [];
    let requestSeq = 0;

    const doRefresh = async () => {
      const seq = ++requestSeq;
      const q = String(input.value || '').trim();
      activeIndex = -1;
      if(minChars > 0 && q.length < minChars){
        renderStatus(box, `Gõ ít nhất ${minChars} ký tự để tìm`);
        currentItems = [];
        return;
      }
      try{
        const result = getItems();
        if(result && typeof result.then === 'function') renderStatus(box, loadingText);
        const items = await Promise.resolve(result);
        if(seq !== requestSeq) return;
        currentItems = render({
          box,
          items,
          label,
          onPick: item => { select(item); hide(box); },
          emptyText
        });
      }catch(err){
        if(seq !== requestSeq) return;
        currentItems = [];
        renderStatus(box, err.message || emptyText);
      }
    };

    const refresh = debounceMs > 0 ? debounce(doRefresh, debounceMs) : doRefresh;

    const moveActive = step => {
      const buttons = [...box.querySelectorAll('.suggestion-item[data-index]')];
      if(!buttons.length) return;
      activeIndex = (activeIndex + step + buttons.length) % buttons.length;
      buttons.forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-selected','false'); });
      buttons[activeIndex].classList.add('active');
      buttons[activeIndex].setAttribute('aria-selected','true');
      buttons[activeIndex].scrollIntoView({block:'nearest'});
    };

    const onInput = () => {
      if(clearOnInput) clearSelected(input);
      refresh();
    };
    const onFocus = () => refresh();
    const onKeydown = event => {
      if(event.key === 'ArrowDown'){
        event.preventDefault();
        if(box.hidden) refresh();
        moveActive(1);
        return;
      }
      if(event.key === 'ArrowUp'){
        event.preventDefault();
        if(box.hidden) refresh();
        moveActive(-1);
        return;
      }
      if(event.key === 'Enter'){
        const picked = currentItems[activeIndex >= 0 ? activeIndex : 0];
        if(picked){
          event.preventDefault();
          select(picked);
          hide(box);
        }
        return;
      }
      if(event.key === 'Escape') hide(box);
    };
    const onDocumentMouseDown = event => {
      if(event.target === input || box.contains(event.target)) return;
      hide(box);
    };

    input.setAttribute('autocomplete','off');
    input.addEventListener('input', onInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('keydown', onKeydown);
    document.addEventListener('mousedown', onDocumentMouseDown);

    const cleanup = () => {
      requestSeq++;
      input.removeEventListener('input', onInput);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('keydown', onKeydown);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      hide(box);
    };
    wiredInputs.set(input, cleanup);
  }

  window.SearchAutocomplete = { normalizeText, escapeHtml, matchText, show, hide, wire };
})();
