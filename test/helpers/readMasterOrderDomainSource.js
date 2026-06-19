'use strict';
const readSourceTree = require('./readSourceTree');
module.exports = (root) => readSourceTree(root, ['src/services/master-order']);
