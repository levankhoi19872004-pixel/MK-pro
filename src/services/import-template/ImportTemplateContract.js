'use strict';

const IMPORT_TEMPLATE_METHODS = Object.freeze([
  'getBuiltInTemplates',
  'buildBuiltInTemplateFile',
  'getFields',
  'listCustomTemplates',
  'saveCustomTemplate',
  'deleteCustomTemplate',
  'buildCustomTemplateFile'
]);

function assertImportTemplateContract(service, label = 'ImportTemplateService') {
  if (!service || typeof service !== 'object') {
    throw new TypeError(`${label} must be an object`);
  }

  const missing = IMPORT_TEMPLATE_METHODS.filter((method) => typeof service[method] !== 'function');
  if (missing.length) {
    throw new TypeError(`${label} is missing methods: ${missing.join(', ')}`);
  }

  return service;
}

function createImportTemplateContract(service, label) {
  const implementation = assertImportTemplateContract(service, label);
  return Object.freeze({
    getBuiltInTemplates: (...args) => implementation.getBuiltInTemplates(...args),
    buildBuiltInTemplateFile: (...args) => implementation.buildBuiltInTemplateFile(...args),
    getFields: (...args) => implementation.getFields(...args),
    listCustomTemplates: (...args) => implementation.listCustomTemplates(...args),
    saveCustomTemplate: (...args) => implementation.saveCustomTemplate(...args),
    deleteCustomTemplate: (...args) => implementation.deleteCustomTemplate(...args),
    buildCustomTemplateFile: (...args) => implementation.buildCustomTemplateFile(...args)
  });
}

module.exports = {
  IMPORT_TEMPLATE_METHODS,
  assertImportTemplateContract,
  createImportTemplateContract
};
