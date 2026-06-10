'use strict';

const importTemplateService = require('../services/importTemplateService');

function sendWorkbook(res, file) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  res.send(file.buffer);
}

async function listCustom(req, res) {
  try {
    const templates = await importTemplateService.listCustomTemplates();
    res.json({ ok: true, templates });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được mẫu import tự tạo', error: err.message });
  }
}

async function saveCustom(req, res) {
  try {
    const result = await importTemplateService.saveCustomTemplate(req.body);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã lưu mẫu import', template: result.template });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được mẫu import', error: err.message });
  }
}

async function removeCustom(req, res) {
  try {
    const result = await importTemplateService.deleteCustomTemplate(req.params.id);
    if (result.error) return res.status(result.status || 404).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã xóa mẫu import' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được mẫu import', error: err.message });
  }
}

async function downloadCustom(req, res) {
  try {
    const result = await importTemplateService.buildCustomTemplateFile(req.params.id);
    if (result.error) return res.status(result.status || 404).json({ ok: false, message: result.error });
    sendWorkbook(res, result);
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được file mẫu import', error: err.message });
  }
}

function listBuiltIn(req, res) {
  res.json({ ok: true, templates: importTemplateService.getBuiltInTemplates() });
}

function downloadBuiltIn(req, res) {
  try {
    sendWorkbook(res, importTemplateService.buildBuiltInTemplateFile(req.params.type));
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không tạo được file mẫu import' });
  }
}

function fields(req, res) {
  res.json({ ok: true, fields: importTemplateService.getFields(req.params.type) });
}

module.exports = { listCustom, saveCustom, removeCustom, downloadCustom, listBuiltIn, downloadBuiltIn, fields };
