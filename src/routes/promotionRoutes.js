'use strict';

const express = require('express');
const promotionController = require('../controllers/promotionController');

const router = express.Router();

router.get('/product-rules', promotionController.listProductRules);
router.post('/product-rules', promotionController.saveProductRule);
router.delete('/product-rules/:id', promotionController.deleteProductRule);

router.get('/group-items', promotionController.listGroupItems);
router.post('/group-items', promotionController.saveGroupItem);
router.delete('/group-items/:id', promotionController.deleteGroupItem);

router.get('/group-rules', promotionController.listGroupRules);
router.post('/group-rules', promotionController.saveGroupRule);
router.delete('/group-rules/:id', promotionController.deleteGroupRule);


router.get('/programs', promotionController.listPrograms);
router.get('/programs/:programCode', promotionController.getProgramDetail);
router.put('/programs/:programCode', promotionController.updateProgram);
router.post('/programs/:programCode/cancel', promotionController.cancelProgram);

router.post('/programs/:programCode/products', promotionController.addPromotionProduct);
router.put('/programs/:programCode/products/:id', promotionController.updatePromotionProduct);
router.delete('/programs/:programCode/products/:id', promotionController.deletePromotionProduct);

router.post('/programs/:programCode/group-products', promotionController.addGroupProduct);
router.put('/programs/:programCode/group-products/:id', promotionController.updateGroupProduct);
router.delete('/programs/:programCode/group-products/:id', promotionController.deleteGroupProduct);

router.post('/programs/:programCode/tiers', promotionController.addPromotionTier);
router.put('/programs/:programCode/tiers/:id', promotionController.updatePromotionTier);
router.delete('/programs/:programCode/tiers/:id', promotionController.deletePromotionTier);


router.post('/calculate', promotionController.calculate);

router.get('/', promotionController.list);
router.post('/', promotionController.save);
router.delete('/:id', promotionController.remove);

module.exports = router;
