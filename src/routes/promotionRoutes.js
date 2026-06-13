'use strict';

const express = require('express');
const promotionController = require('../controllers/promotionController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const managePromotions = requireRole(['admin', 'manager', 'accountant']);
const viewPromotionAdmin = managePromotions;

router.get('/product-rules', viewPromotionAdmin, promotionController.listProductRules);
router.post('/product-rules', managePromotions, promotionController.saveProductRule);
router.delete('/product-rules/:id', managePromotions, promotionController.deleteProductRule);

router.get('/group-items', viewPromotionAdmin, promotionController.listGroupItems);
router.post('/group-items', managePromotions, promotionController.saveGroupItem);
router.delete('/group-items/:id', managePromotions, promotionController.deleteGroupItem);

router.get('/group-rules', viewPromotionAdmin, promotionController.listGroupRules);
router.post('/group-rules', managePromotions, promotionController.saveGroupRule);
router.delete('/group-rules/:id', managePromotions, promotionController.deleteGroupRule);


router.get('/programs', viewPromotionAdmin, promotionController.listPrograms);
router.get('/programs/:programCode', viewPromotionAdmin, promotionController.getProgramDetail);
router.put('/programs/:programCode', managePromotions, promotionController.updateProgram);
router.post('/programs/:programCode/cancel', managePromotions, promotionController.cancelProgram);

router.post('/programs/:programCode/products', managePromotions, promotionController.addPromotionProduct);
router.put('/programs/:programCode/products/:id', managePromotions, promotionController.updatePromotionProduct);
router.delete('/programs/:programCode/products/:id', managePromotions, promotionController.deletePromotionProduct);

router.post('/programs/:programCode/group-products', managePromotions, promotionController.addGroupProduct);
router.put('/programs/:programCode/group-products/:id', managePromotions, promotionController.updateGroupProduct);
router.delete('/programs/:programCode/group-products/:id', managePromotions, promotionController.deleteGroupProduct);

router.post('/programs/:programCode/tiers', managePromotions, promotionController.addPromotionTier);
router.put('/programs/:programCode/tiers/:id', managePromotions, promotionController.updatePromotionTier);
router.delete('/programs/:programCode/tiers/:id', managePromotions, promotionController.deletePromotionTier);


router.post('/calculate', promotionController.calculate);

router.get('/', viewPromotionAdmin, promotionController.list);
router.post('/', managePromotions, promotionController.save);
router.delete('/:id', managePromotions, promotionController.remove);

module.exports = router;
