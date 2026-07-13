'use strict';

const importSessionService = require('../importSessionService');
const BackgroundJobService = require('./BackgroundJobService');
const JobSubmissionService = require('./JobSubmissionService');

function prefersAsync(req = {}) {
  const prefer = String(req.headers?.prefer || '').toLowerCase();
  return prefer.includes('respond-async') || String(req.query?.async || '') === '1' || String(req.body?.async || '') === '1';
}

function acceptedPayload(submitted = {}, extra = {}) {
  return {
    ok: true,
    accepted: true,
    status: 'queued',
    jobId: submitted.job.id,
    job: submitted.job,
    statusUrl: `/api/background-jobs/${encodeURIComponent(submitted.job.id)}`,
    ...extra
  };
}

async function submitImportCommit(req) {
  return JobSubmissionService.submitImportCommit({
    type: String(req.body?.type || '').trim(),
    rows: req.body?.rows,
    shortageMode: String(req.body?.shortageMode || '').trim(),
    shortageReviewFingerprint: String(req.body?.shortageReviewFingerprint || '').trim(),
    selectedScopeFingerprint: String(req.body?.selectedScopeFingerprint || '').trim(),
    sessionId: String(req.body?.sessionId || req.body?.importSessionId || '').trim(),
    selectedOrderCodes: req.body?.selectedOrderCodes || [],
    selectedRowNumbers: req.body?.selectedRowNumbers || [],
    selectedProgramCodes: req.body?.selectedProgramCodes || [],
    selectedRowKeys: req.body?.selectedRowKeys || [],
    importMode: String(req.body?.importMode || '').trim(),
    userName: String(req.body?.userName || '').trim()
  }, req.user || {});
}

async function waitImportCompatibility(submitted, sessionId) {
  const terminal = await BackgroundJobService.waitForTerminal(submitted.job.id, {
    timeoutMs: Number(process.env.BACKGROUND_JOB_COMPAT_WAIT_MS || 15 * 60 * 1000)
  });
  if (!terminal) return { timeout: true };
  const status = await importSessionService.getSession(sessionId);
  if (terminal.status === 'completed' && status) {
    const result = status.result && typeof status.result === 'object' ? status.result : {};
    return { result: { ...result, sessionId, importSessionId: sessionId } };
  }
  return {
    error: terminal.lastError?.message || status?.errorMessage || 'Import worker thất bại',
    status: terminal.status === 'dead_letter' ? 500 : 409,
    code: terminal.lastError?.code || terminal.status
  };
}

module.exports = { prefersAsync, acceptedPayload, submitImportCommit, waitImportCompatibility };
