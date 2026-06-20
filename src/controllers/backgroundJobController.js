'use strict';

const BackgroundJob = require('../models/BackgroundJob');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const ArtifactStore = require('../services/background-jobs/GridFsArtifactStore');
const { tenantIdOf } = require('../utils/tenant.util');

async function status(req, res) {
  const job = await BackgroundJobService.getById(req.params.id, req.user || {});
  if (!job) return res.status(404).json({ ok: false, message: 'Không tìm thấy background job' });
  return res.json({ ok: true, job });
}

async function cancel(req, res) {
  const result = await BackgroundJobService.requestCancel(req.params.id, req.user || {});
  if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, code: result.code });
  return res.json({ ok: true, job: result.job });
}

async function artifact(req, res) {
  const tenantId = tenantIdOf({ user: req.user || {} });
  const job = await BackgroundJob.findOne({ id: String(req.params.id || '').trim(), tenantId }).lean();
  if (!job) return res.status(404).json({ ok: false, message: 'Không tìm thấy background job' });
  if (job.status !== 'completed' || !job.artifact?.fileId || job.artifact?.deletedAt) {
    return res.status(409).json({ ok: false, message: 'Artifact chưa sẵn sàng hoặc đã hết hạn' });
  }
  res.setHeader('Content-Type', job.artifact.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(job.artifact.fileName || 'artifact.bin')}`);
  res.setHeader('Content-Length', String(Number(job.artifact.size || 0)));
  res.setHeader('X-Export-Order-Count', String(Number(job.result?.orderCount || 0)));
  res.setHeader('X-Export-Row-Count', String(Number(job.result?.rows || 0)));
  res.setHeader('X-Export-Warning-Count', String(Number(job.result?.warningCount || 0)));
  const stream = ArtifactStore.openDownloadStream(job.artifact.fileId);
  stream.once('error', (error) => {
    if (!res.headersSent) res.status(404).json({ ok: false, message: 'Không đọc được artifact' });
    else res.destroy(error);
  });
  stream.pipe(res);
}

module.exports = { status, cancel, artifact };
