'use strict';
const readSourceTree = require('./readSourceTree');
module.exports = (root) => readSourceTree(root, ['src/services/excelImportService.js', 'src/services/import']);
