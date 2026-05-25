const router = require('express').Router();
router.use('/', require('./v42Routes'));
router.use('/', require('./s3imReportRoutes'));
router.use('/', require('./professionalRoutes'));
router.use('/', require('./businessApiRoutes'));
router.use('/', require('./dataRoutes'));
router.use('/', require('./authRoutes'));
router.use('/', require('./coreRoutes'));
module.exports = router;
