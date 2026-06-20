(function initSafeDom(global) {
  'use strict';

  function clear(node) {
    if (node) node.replaceChildren();
    return node;
  }

  function text(tagName, value, options) {
    const node = document.createElement(tagName || 'span');
    const opts = options || {};
    if (opts.className) node.className = String(opts.className);
    if (opts.title) node.title = String(opts.title);
    node.textContent = String(value ?? '');
    return node;
  }

  function setText(node, value) {
    if (node) node.textContent = String(value ?? '');
    return node;
  }

  function option(value, label) {
    const node = document.createElement('option');
    node.value = String(value ?? '');
    node.textContent = String(label ?? value ?? '');
    return node;
  }

  function button(label, options) {
    const opts = options || {};
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = String(label ?? '');
    if (opts.className) node.className = String(opts.className);
    Object.entries(opts.dataset || {}).forEach(([key, value]) => {
      node.dataset[key] = String(value ?? '');
    });
    return node;
  }


  function renderSummary(container, options) {
    if (!container) return;
    const opts = options || {};
    clear(container);
    if (opts.prefix) {
      container.appendChild(document.createTextNode(String(opts.prefix)));
      container.appendChild(document.createElement('br'));
    }
    if (opts.heading) {
      const heading = document.createElement('strong');
      heading.textContent = String(opts.heading);
      container.appendChild(heading);
    }
    (opts.lines || []).forEach((value) => {
      container.appendChild(document.createElement('br'));
      container.appendChild(text('span', value));
    });
  }

  function renderMetricCard(container, options) {
    if (!container) return;
    const opts = options || {};
    clear(container);
    container.appendChild(text('div', opts.title || '', { className: opts.titleClass || '' }));
    const meta = document.createElement('div');
    meta.className = String(opts.metaClass || '');
    (opts.metrics || []).forEach((metric) => {
      const item = document.createElement('span');
      if (metric.className) item.className = String(metric.className);
      item.appendChild(document.createTextNode(String(metric.label || '')));
      item.appendChild(text('strong', metric.value));
      meta.appendChild(item);
    });
    container.appendChild(meta);
    if (opts.note) container.appendChild(text('div', opts.note, { className: opts.noteClass || '' }));
  }

  global.SafeDom = Object.freeze({ clear, text, setText, option, button, renderSummary, renderMetricCard });
})(window);
