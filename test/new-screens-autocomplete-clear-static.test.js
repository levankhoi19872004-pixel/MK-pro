'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const debtUi = read('public/js/app/new/92-debt-new.js');
const deliveryUi = read('public/js/app/new/91-delivery-today-new.js');
const debtService = read('src/services/v2/debtNew.service.js');
const deliveryService = read('src/services/v2/deliveryTodayNew.service.js');
const routes = read('src/routes/newOperationsRoutes.js');

test('Công nợ New autocomplete is guarded and writes selected identity codes', () => {
  assert.match(debtUi, /\/api\/new\/debt\/suggestions\?/);
  assert.match(debtUi, /type:\s*'customerOrder'/);
  assert.match(debtUi, /type:\s*'salesman'/);
  assert.match(debtUi, /type:\s*'delivery'/);
  assert.match(debtUi, /value\.length < 2[\s\S]{0,180}closeSuggestion\(scope\)/);
  assert.match(debtUi, /state\.selectedFilters\.customerCode\s*=\s*firstText/);
  assert.match(debtUi, /state\.selectedFilters\.orderCode\s*=\s*firstText/);
  assert.match(debtUi, /state\.selectedFilters\.salesStaffCode\s*=\s*firstText/);
  assert.match(debtUi, /state\.selectedFilters\.deliveryStaffCode\s*=\s*firstText/);
  assert.match(debtService, /q\.length < 2[\s\S]{0,120}emptySuggestionResult/);
  assert.match(debtService, /Math\.min\(10/);
});

test('Công nợ New has per-field clear buttons that clear hidden selected codes', () => {
  ['debtNewSearchClear', 'debtNewSalesmanClear', 'debtNewDeliveryClear', 'debtNewStatusClear'].forEach((id) => assert.match(debtUi, new RegExp(id)));
  assert.match(debtUi, /data-debt-clear="search"/);
  assert.match(debtUi, /data-debt-clear="salesman"/);
  assert.match(debtUi, /data-debt-clear="delivery"/);
  assert.match(debtUi, /function clearDebtFilter\(scope\)[\s\S]*resetSelectedFilters\('search'\)/);
  assert.match(debtUi, /function clearDebtFilter\(scope\)[\s\S]*resetSelectedFilters\('salesman'\)/);
  assert.match(debtUi, /function clearDebtFilter\(scope\)[\s\S]*resetSelectedFilters\('delivery'\)/);
  assert.match(debtUi, /!hasValidSearchCriteria\(\)[\s\S]{0,180}resetResultsState/);
  assert.doesNotMatch(debtUi, /selectedFilters\.[a-zA-Z]+\s*\|\|/);
});

test('Đơn giao hôm nay New uses New suggestions API instead of broad local/empty autocomplete', () => {
  assert.match(routes, /\/delivery-today\/suggestions/);
  assert.match(deliveryUi, /\/api\/new\/delivery-today\/suggestions\?/);
  assert.match(deliveryUi, /type:\s*'orderCustomer'/);
  assert.match(deliveryUi, /type:\s*'salesman'/);
  assert.match(deliveryUi, /type:\s*'delivery'/);
  assert.match(deliveryUi, /value\.length < 2[\s\S]{0,180}closeSuggestion\(scope\)/);
  assert.doesNotMatch(deliveryUi, /UnifiedSearchEngine/);
  assert.doesNotMatch(deliveryUi, /allowEmpty/);
  assert.match(deliveryService, /async function suggestions/);
  assert.match(deliveryService, /q\.length < 2[\s\S]{0,120}emptySuggestionResult/);
  assert.match(deliveryService, /Math\.min\(10/);
});

test('Đơn giao hôm nay New has per-field clear buttons and selected-code state reset', () => {
  ['deliveryTodayNewDateClear', 'deliveryTodayNewSearchClear', 'deliveryTodayNewDeliveryClear', 'deliveryTodayNewSalesmanClear'].forEach((id) => assert.match(deliveryUi, new RegExp(id)));
  assert.match(deliveryUi, /data-delivery-clear="date"/);
  assert.match(deliveryUi, /data-delivery-clear="search"/);
  assert.match(deliveryUi, /data-delivery-clear="delivery"/);
  assert.match(deliveryUi, /data-delivery-clear="salesman"/);
  assert.match(deliveryUi, /state\.selectedFilters\.orderCode\s*=\s*firstText/);
  assert.match(deliveryUi, /state\.selectedFilters\.customerCode\s*=\s*firstText/);
  assert.match(deliveryUi, /state\.selectedFilters\.deliveryStaffCode\s*=\s*firstText/);
  assert.match(deliveryUi, /state\.selectedFilters\.salesStaffCode\s*=\s*firstText/);
  assert.match(deliveryUi, /function clearDeliveryFilter\(scope\)[\s\S]*resetSelectedFilter\('search'\)/);
  assert.match(deliveryUi, /function clearDeliveryFilter\(scope\)[\s\S]*resetSelectedFilter\('delivery'\)/);
  assert.match(deliveryUi, /function clearDeliveryFilter\(scope\)[\s\S]*resetSelectedFilter\('salesman'\)/);
  assert.match(deliveryUi, /state\.deliveryDateTouched\s*=\s*false/);
  assert.match(deliveryUi, /!hasValidSearchCriteria\(\)[\s\S]{0,180}resetResultsState/);
  assert.doesNotMatch(deliveryUi, /selectedFilters\.[a-zA-Z]+\s*\|\|/);
});
