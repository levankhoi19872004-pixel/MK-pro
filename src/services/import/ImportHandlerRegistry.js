'use strict';

class ImportHandlerRegistry {
  constructor(handlers = []) {
    this.handlers = new Map();
    handlers.forEach((handler) => this.register(handler));
  }

  register(handler) {
    if (!handler || !handler.type || typeof handler.commit !== 'function') {
      throw new TypeError('Import handler phải có type và commit(rows, context)');
    }
    if (this.handlers.has(handler.type)) {
      throw new Error(`Import handler bị trùng: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
    return this;
  }

  has(type) {
    return this.handlers.has(String(type || '').trim());
  }

  get(type) {
    return this.handlers.get(String(type || '').trim()) || null;
  }

  listTypes() {
    return [...this.handlers.keys()];
  }

  async commit(type, rows, context = {}) {
    const handler = this.get(type);
    if (!handler) {
      const error = new Error(`Loại import không hợp lệ: ${type || '(trống)'}`);
      error.code = 'IMPORT_TYPE_UNSUPPORTED';
      error.status = 400;
      throw error;
    }
    return handler.commit(rows, context);
  }
}

module.exports = ImportHandlerRegistry;
