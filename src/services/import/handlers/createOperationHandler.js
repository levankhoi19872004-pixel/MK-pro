'use strict';

module.exports = function createOperationHandler(type, operationName, defaultOptions = {}) {
  return Object.freeze({
    type,
    async commit(rows, context = {}) {
      const operation = context.operations && context.operations[operationName];
      if (typeof operation !== 'function') {
        const error = new Error(`Thiếu import operation: ${operationName}`);
        error.code = 'IMPORT_OPERATION_MISSING';
        throw error;
      }
      return operation(rows, { ...defaultOptions, ...(context.options || {}) });
    }
  });
};
