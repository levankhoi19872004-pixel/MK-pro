'use strict';

const XLSX = require('xlsx');
const excelImportService = require('./excelImportService');
const importTemplateService = require('./importTemplateService');
const exportRepository = require('../repositories/exportRepository');

function stripMongoFields(row = {}) {
  const plain = { ...row };
  delete plain._id;
  delete plain.__v;
  return plain;
}

function flattenValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rowsToSheetRows(rows = []) {
  const plainRows = rows.map(stripMongoFields);
  const headerSet = new Set();
  plainRows.forEach((row) => Object.keys(row).forEach((key) => headerSet.add(key)));
  const headers = Array.from(headerSet);
  const body = plainRows.map((row) => headers.map((header) => flattenValue(row[header])));
  return { headers, body };
}

function buildWorkbook({ type, rows }) {
  const { headers, body } = rowsToSheetRows(rows);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Export');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Loại dữ liệu', type],
    ['Số dòng', rows.length],
    ['Thời gian xuất', new Date().toISOString()]
  ]), 'ThongTin');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function previewImport(params) {
  return excelImportService.preview(params);
}

async function commitImport(params) {
  return excelImportService.commit(params);
}

async function getImportLogs() {
  return excelImportService.logs();
}

function getBuiltInTemplates() {
  return importTemplateService.getBuiltInTemplates();
}

function buildBuiltInTemplateFile(type) {
  return importTemplateService.buildBuiltInTemplateFile(type);
}

function getFields(type) {
  return importTemplateService.getFields(type);
}

async function listCustomTemplates() {
  return importTemplateService.listCustomTemplates();
}

async function saveCustomTemplate(payload) {
  return importTemplateService.saveCustomTemplate(payload);
}

async function deleteCustomTemplate(id) {
  return importTemplateService.deleteCustomTemplate(id);
}

async function buildCustomTemplateFile(id) {
  return importTemplateService.buildCustomTemplateFile(id);
}

function getExportTypes() {
  return exportRepository.getExportTypes();
}

async function exportToExcel(type, query = {}) {
  const rows = await exportRepository.findForExport(type, query);
  if (!rows) return { error: 'Loại dữ liệu export không hợp lệ', status: 400 };
  const buffer = buildWorkbook({ type, rows });
  const safeType = String(type || 'data').replace(/[^a-zA-Z0-9_-]/g, '-');
  return { buffer, rows: rows.length, fileName: `${safeType}-export-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

module.exports = {
  previewImport,
  commitImport,
  getImportLogs,
  getBuiltInTemplates,
  buildBuiltInTemplateFile,
  getFields,
  listCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  buildCustomTemplateFile,
  getExportTypes,
  exportToExcel
};
