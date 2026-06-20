'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const contract = require('../src/services/import-template/ImportTemplateContract');
const domainService = require('../src/services/importTemplateService');
const applicationService = require('../src/services/import-template/ImportTemplateApplicationService');
const legacyAdapter = require('../src/services/import-template/LegacyImportTemplateAdapter');
const templateFacade = require('../src/services/import-export/TemplateFacade');
const publicFacade = require('../src/services/importExportService');
const legacyBundle = require('../src/services/importExportLegacy.service');

const sortedMethods = (value) => Object.keys(value)
  .filter((key) => typeof value[key] === 'function')
  .sort();

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test('import template contract keeps the seven public methods stable', () => {
  const expected = [...contract.IMPORT_TEMPLATE_METHODS].sort();
  assert.deepEqual(sortedMethods(applicationService), expected);
  assert.deepEqual(sortedMethods(legacyAdapter), expected);
  assert.deepEqual(sortedMethods(templateFacade), expected);
  expected.forEach((method) => assert.equal(typeof publicFacade[method], 'function'));
  expected.forEach((method) => assert.equal(typeof legacyBundle[method], 'function'));
});

test('runtime template call sites use the application contract instead of loading legacy directly', () => {
  const templateFacadeSource = read('src/services/import-export/TemplateFacade.js');
  const importTemplateController = read('src/controllers/importTemplateController.js');
  const importExportController = read('src/controllers/importExportController.js');
  const legacySource = read('src/services/importExportLegacy.service.source/part-01.jsfrag');

  assert.doesNotMatch(templateFacadeSource, /importExportLegacy\.service/);
  assert.match(templateFacadeSource, /ImportTemplateApplicationService/);
  assert.match(importTemplateController, /import-template\/ImportTemplateApplicationService/);
  assert.match(importExportController, /import-template\/ImportTemplateApplicationService/);
  assert.match(legacySource, /import-template\/LegacyImportTemplateAdapter/);
  assert.doesNotMatch(legacySource, /require\('\.\/importTemplateService'\)/);
});

test('synchronous template catalog and field contracts are behavior-equivalent', () => {
  const expectedTemplates = domainService.getBuiltInTemplates();
  assert.deepEqual(applicationService.getBuiltInTemplates(), expectedTemplates);
  assert.deepEqual(legacyAdapter.getBuiltInTemplates(), expectedTemplates);
  assert.deepEqual(templateFacade.getBuiltInTemplates(), expectedTemplates);
  assert.deepEqual(legacyBundle.getBuiltInTemplates(), expectedTemplates);

  expectedTemplates.forEach((definition) => {
    const type = definition.type;
    const expectedFields = domainService.getFields(type);
    assert.deepEqual(applicationService.getFields(type), expectedFields);
    assert.deepEqual(legacyAdapter.getFields(type), expectedFields);
    assert.deepEqual(templateFacade.getFields(type), expectedFields);
    assert.deepEqual(legacyBundle.getFields(type), expectedFields);
  });
});

test('built-in workbook output remains byte-equivalent through new and legacy contracts', async () => {
  for (const definition of domainService.getBuiltInTemplates()) {
    const type = definition.type;
    const expected = await domainService.buildBuiltInTemplateFile(type);
    const modern = await applicationService.buildBuiltInTemplateFile(type);
    const legacy = await legacyBundle.buildBuiltInTemplateFile(type);

    assert.equal(modern.fileName, expected.fileName);
    assert.equal(legacy.fileName, expected.fileName);
    assert.equal(sha256(modern.buffer), sha256(expected.buffer));
    assert.equal(sha256(legacy.buffer), sha256(expected.buffer));
  }
});

test('async custom-template methods delegate without changing arguments or result shape', async () => {
  const scenarios = [
    ['listCustomTemplates', [], [{ id: 'IT1', name: 'Mẫu 1' }]],
    ['saveCustomTemplate', [{ name: 'Mẫu 1', type: 'products', fields: [{ excelHeader: 'Mã', dbField: 'code' }] }], { template: { id: 'IT1' } }],
    ['deleteCustomTemplate', ['IT1'], { deleted: true }],
    ['buildCustomTemplateFile', ['IT1'], { fileName: 'mau-1.xlsx', buffer: Buffer.from('test') }]
  ];

  for (const [method, args, result] of scenarios) {
    const original = domainService[method];
    const received = [];
    domainService[method] = async (...actualArgs) => {
      received.push(actualArgs);
      return result;
    };
    try {
      assert.deepEqual(await applicationService[method](...args), result);
      assert.deepEqual(await legacyAdapter[method](...args), result);
      assert.deepEqual(await templateFacade[method](...args), result);
      assert.deepEqual(await legacyBundle[method](...args), result);
      assert.deepEqual(received, [args, args, args, args]);
    } finally {
      domainService[method] = original;
    }
  }
});


test('both template controllers preserve response contracts through the application service', async () => {
  const importTemplateController = require('../src/controllers/importTemplateController');
  const importExportController = require('../src/controllers/importExportController');
  const original = domainService.getBuiltInTemplates;
  const templates = [{ type: 'products', title: 'Mẫu import sản phẩm', fileName: 'mau.xlsx' }];
  domainService.getBuiltInTemplates = () => templates;

  const makeResponse = () => ({
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  });

  try {
    const first = makeResponse();
    importTemplateController.listBuiltIn({}, first);
    assert.deepEqual(first.body, { ok: true, templates });

    const second = makeResponse();
    await importExportController.listBuiltInTemplates({}, second);
    assert.deepEqual(second.body, { ok: true, templates });
  } finally {
    domainService.getBuiltInTemplates = original;
  }
});

test('contract validation fails fast for an incomplete implementation', () => {
  assert.throws(
    () => contract.createImportTemplateContract({ getBuiltInTemplates() {} }, 'BrokenTemplateService'),
    /missing methods/
  );
});
