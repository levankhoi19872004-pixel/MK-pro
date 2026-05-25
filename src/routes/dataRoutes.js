const router = require('express').Router();
const ctrl = require('../controllers/dataController');
const { auth, requirePermission } = require('../middleware/auth');

router.get('/health', ctrl.health);
router.get('/data', auth, requirePermission('data:view'), ctrl.getData);
router.post('/data', auth, requirePermission('data:save'), ctrl.saveData);

module.exports = router;
