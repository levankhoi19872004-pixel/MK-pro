'use strict';

const XLSX = require('xlsx');
const importTemplateRepository = require('../repositories/importTemplateRepository');
const { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS } = require('../../services/excelTemplateService');
const { makeId } = require('../utils/common.util');

const FIELD_OPTIONS = Object.entries(TEMPLATE_DEFINITIONS).reduce((acc, [type, definition]) => {
  acc[type] = definition.columns.map((field, index) => ({ field, label: definition.headers[index] || field }));
  return acc;
}, {});

async function listCustomTemplates() {
  return importTemplateRepository.findAll();
}

async function saveCustomTemplate(body = {}) {
  const fields = Array.isArray(body.fields) ? body.fields : [];
  const payload = {
    id: String(body.id || makeId('IT')).trim(),
    name: String(body.name || '').trim(),
    type: String(body.type || '').trim(),
    fields: fields
      .map((field) => ({
        excelHeader: String(field.excelHeader || '').trim(),
        dbField: String(field.dbField || '').trim(),
        required: Boolean(field.required),
        defaultValue: field.defaultValue ?? ''
      }))
      .filter((field) => field.excelHeader || field.dbField),
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!payload.name) return { error: 'Thiếu tên mẫu import', status: 400 };
  if (!payload.type) return { error: 'Thiếu loại dữ liệu import', status: 400 };
  if (!payload.fields.length) return { error: 'Mẫu import cần ít nhất một dòng mapping', status: 400 };
  const template = await importTemplateRepository.upsert(payload);
  return { template };
}

async function deleteCustomTemplate(id) {
  const deleted = await importTemplateRepository.remove(id);
  if (!deleted) return { error: 'Không tìm thấy mẫu import', status: 404 };
  return { deleted: true };
}

async function buildCustomTemplateFile(id) {
  const template = await importTemplateRepository.findById(id);
  if (!template) return { error: 'Không tìm thấy mẫu import', status: 404 };
  const headers = (template.fields || []).map((field) => field.excelHeader || field.dbField).filter(Boolean);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), 'Import');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Tên mẫu', template.name || ''],
    ['Loại dữ liệu', template.type || ''],
    [],
    ['Cột Excel', 'Trường dữ liệu', 'Bắt buộc', 'Giá trị mặc định'],
    ...(template.fields || []).map((field) => [field.excelHeader, field.dbField, field.required ? 'Có' : 'Không', field.defaultValue || ''])
  ]), 'HuongDan');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, fileName: `${String(template.name || 'mau-import').replace(/[^\p{L}\p{N}]+/gu, '-')}.xlsx` };
}

function getBuiltInTemplates() {
  return getTemplateTypes();
}

function buildBuiltInTemplateFile(type) {
  return buildImportTemplate(type);
}

function getFields(type) {
  return FIELD_OPTIONS[type] || [];
}

module.exports = {
  listCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  buildCustomTemplateFile,
  getBuiltInTemplates,
  buildBuiltInTemplateFile,
  getFields
};
