(function (global) {
  'use strict';

  function createLifecycle() {
    var cleanups = [];
    function add(cleanup) {
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return cleanup;
    }
    function listen(target, type, handler, options) {
      if (!target || !target.addEventListener) return function () {};
      target.addEventListener(type, handler, options);
      return add(function () { target.removeEventListener(type, handler, options); });
    }
    function delegate(target, type, selector, handler, options) {
      return listen(target, type, function (event) {
        var node = event.target && event.target.closest ? event.target.closest(selector) : null;
        if (!node || !target.contains(node)) return;
        handler(event, node);
      }, options);
    }
    function destroy() {
      cleanups.splice(0).reverse().forEach(function (cleanup) {
        try { cleanup(); } catch (_) { /* best effort cleanup */ }
      });
    }
    return { add: add, listen: listen, delegate: delegate, destroy: destroy };
  }

  function debounce(fn, wait) {
    var timer = null;
    var lastArgs = null;
    var lastThis = null;
    function invoke() {
      timer = null;
      fn.apply(lastThis, lastArgs || []);
      lastArgs = lastThis = null;
    }
    function wrapped() {
      lastArgs = arguments;
      lastThis = this;
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(invoke, Number(wait || 0));
    }
    wrapped.cancel = function () {
      if (timer) global.clearTimeout(timer);
      timer = lastArgs = lastThis = null;
    };
    wrapped.flush = function () {
      if (!timer) return;
      global.clearTimeout(timer);
      invoke();
    };
    return wrapped;
  }

  function createRequestGate() {
    var sequence = 0;
    var controller = null;
    return {
      begin: function () {
        sequence += 1;
        if (controller && controller.abort) controller.abort();
        controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
        return { sequence: sequence, signal: controller ? controller.signal : undefined };
      },
      isCurrent: function (token) {
        return !!token && token.sequence === sequence;
      },
      cancel: function () {
        sequence += 1;
        if (controller && controller.abort) controller.abort();
        controller = null;
      },
      currentSequence: function () { return sequence; }
    };
  }

  function appendTrustedHtml(container, html) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    container.appendChild(template.content.cloneNode(true));
  }

  function renderState(container, options) {
    if (!container) return;
    options = options || {};
    container.className = String(options.className || options.baseClass || 'mobile-list-state') + ' mobile-list-state ' + String(options.state || 'empty');
    container.replaceChildren();
    var content = document.createElement('div');
    content.className = options.state === 'loading' ? 'mobile-skeleton' : 'mobile-state-content';
    if (options.state === 'loading') {
      content.setAttribute('aria-label', String(options.title || 'Đang tải dữ liệu'));
      for (var i = 0; i < 3; i += 1) content.appendChild(document.createElement('span'));
      container.appendChild(content);
      return;
    }
    var title = document.createElement('strong');
    title.textContent = String(options.title || '');
    content.appendChild(title);
    if (options.detail) {
      var detail = document.createElement('span');
      detail.textContent = String(options.detail);
      content.appendChild(detail);
    }
    if (options.retryAction) {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = String(options.retryClass || 'ghost-btn');
      retry.dataset.mobileRetry = String(options.retryAction);
      retry.textContent = String(options.retryLabel || 'Thử lại');
      content.appendChild(retry);
    }
    container.appendChild(content);
  }

  function createChunkedHtmlRenderer(container, options) {
    options = options || {};
    var generation = 0;
    var scheduled = null;
    var scheduler = global.requestIdleCallback
      ? function (callback) { return global.requestIdleCallback(callback, { timeout: 50 }); }
      : function (callback) { return global.setTimeout(callback, 0); };
    var cancelScheduler = global.cancelIdleCallback
      ? function (handle) { global.cancelIdleCallback(handle); }
      : function (handle) { global.clearTimeout(handle); };

    function cancel() {
      generation += 1;
      if (scheduled != null) cancelScheduler(scheduled);
      scheduled = null;
    }

    function render(rows, renderItem, renderOptions) {
      renderOptions = renderOptions || {};
      cancel();
      var current = generation;
      var list = Array.isArray(rows) ? rows : [];
      var initialCount = Math.max(1, Number(renderOptions.initialCount || options.initialCount || 60));
      var chunkSize = Math.max(1, Number(renderOptions.chunkSize || options.chunkSize || 80));
      container.replaceChildren();
      if (renderOptions.className) container.className = renderOptions.className;
      if (!list.length) {
        if (typeof renderOptions.renderEmpty === 'function') renderOptions.renderEmpty(container);
        if (typeof renderOptions.onComplete === 'function') renderOptions.onComplete({ rendered: 0, total: 0 });
        return { rendered: 0, total: 0, cancel: cancel };
      }

      var index = 0;
      function appendUntil(limit) {
        if (current !== generation) return;
        var end = Math.min(list.length, limit);
        var html = '';
        for (; index < end; index += 1) html += renderItem(list[index], index);
        appendTrustedHtml(container, html);
      }
      appendUntil(initialCount);

      function appendNext() {
        scheduled = null;
        if (current !== generation) return;
        appendUntil(index + chunkSize);
        if (index < list.length) scheduled = scheduler(appendNext);
        else if (typeof renderOptions.onComplete === 'function') renderOptions.onComplete({ rendered: index, total: list.length });
      }
      if (index < list.length) scheduled = scheduler(appendNext);
      else if (typeof renderOptions.onComplete === 'function') renderOptions.onComplete({ rendered: index, total: list.length });
      return { rendered: index, total: list.length, cancel: cancel };
    }

    return { render: render, cancel: cancel };
  }

  function bindDebouncedInput(lifecycle, input, handler, options) {
    options = options || {};
    if (!input) return function () {};
    var debounced = debounce(function (event) { handler(event, input.value); }, Number(options.wait || 250));
    var cleanup = (lifecycle || createLifecycle()).listen(input, 'input', debounced);
    return function () { debounced.cancel(); cleanup(); };
  }

  global.MobileUiRuntime = Object.freeze({
    createLifecycle: createLifecycle,
    debounce: debounce,
    createRequestGate: createRequestGate,
    createChunkedHtmlRenderer: createChunkedHtmlRenderer,
    renderState: renderState,
    bindDebouncedInput: bindDebouncedInput,
    appendTrustedHtml: appendTrustedHtml
  });
}(window));
