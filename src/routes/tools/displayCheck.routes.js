'use strict';

/**
 * Display Check Manager routes.
 * Only display-check collections may be written here. Do not call order/accounting/inventory write services.
 */

const express = require('express');
const service = require('../../services/tools/displayCheck/displayCheck.service');

const router = express.Router();
router.use(express.json({ limit: '5mb' }));

function ok(res, data) { res.json({ ok: true, ...data }); }
function fail(res, error, status = 400) { res.status(status).json({ ok: false, message: error.message || 'Không xử lý được yêu cầu Quản lý chấm Trưng bày.' }); }
function userCode(req) { return service.currentUserCode(req); }

router.get('/bootstrap', async (req, res) => {
  try { ok(res, { data: await service.bootstrap(req.query || {}) }); } catch (error) { fail(res, error); }
});

router.get('/groups', async (req, res) => {
  try { ok(res, { groups: await service.listGroups() }); } catch (error) { fail(res, error); }
});
router.post('/groups', async (req, res) => {
  try { ok(res, { group: await service.createGroup(req.body || {}, userCode(req)) }); } catch (error) { fail(res, error); }
});
router.put('/groups/:id', async (req, res) => {
  try { ok(res, { group: await service.updateGroup(req.params.id, req.body || {}, userCode(req)) }); } catch (error) { fail(res, error); }
});
router.delete('/groups/:id', async (req, res) => {
  try { ok(res, { group: await service.deleteGroup(req.params.id, userCode(req)) }); } catch (error) { fail(res, error); }
});

router.get('/store-setups', async (req, res) => {
  try { ok(res, { setups: await service.listStoreSetups(req.query.date || req.query.workingDate) }); } catch (error) { fail(res, error); }
});
router.post('/store-setups', async (req, res) => {
  try { ok(res, { setup: await service.upsertStoreSetup(req.body || {}, userCode(req)) }); } catch (error) { fail(res, error); }
});
router.put('/store-setups/:id', async (req, res) => {
  try { ok(res, { setup: await service.upsertStoreSetup(req.body || {}, userCode(req), req.params.id) }); } catch (error) { fail(res, error); }
});
router.delete('/store-setups/:id', async (req, res) => {
  try { ok(res, { setup: await service.cancelStoreSetup(req.params.id, userCode(req)) }); } catch (error) { fail(res, error); }
});

router.post('/generate-preview', async (req, res) => {
  try { ok(res, { preview: await service.generatePreview(req.body || {}) }); } catch (error) { fail(res, error); }
});
router.post('/confirm-plan', async (req, res) => {
  try { ok(res, { plan: await service.confirmPlan(req.body || {}, userCode(req)) }); } catch (error) { fail(res, error); }
});

router.get('/plans', async (req, res) => {
  try { ok(res, { plans: await service.listPlans(req.query.date || req.query.workingDate) }); } catch (error) { fail(res, error); }
});
router.get('/plans/:id', async (req, res) => {
  try { ok(res, { plan: await service.getPlan(req.params.id) }); } catch (error) { fail(res, error, 404); }
});
router.post('/plans/:id/cancel', async (req, res) => {
  try { ok(res, { plan: await service.cancelPlan(req.params.id, req.body?.reason || '', userCode(req)) }); } catch (error) { fail(res, error); }
});

module.exports = router;
