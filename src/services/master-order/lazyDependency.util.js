'use strict';

function lazyFunction(modulePath, exportName) {
  return (...args) => {
    const implementation = require(modulePath);
    const target = implementation && implementation[exportName];
    if (typeof target !== 'function') {
      throw new TypeError(`Missing lazy dependency ${modulePath}.${exportName}`);
    }
    return target(...args);
  };
}

module.exports = { lazyFunction };
