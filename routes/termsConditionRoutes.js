const express = require('express');
const router = express.Router();
const termsConditionController = require('../controllers/termsConditionController');

router.route('/')
  .get(termsConditionController.getTermsConditions)
  .post(termsConditionController.createTermsCondition);

router.route('/:id')
  .get(termsConditionController.getTermsCondition)
  .put(termsConditionController.updateTermsCondition)
  .delete(termsConditionController.deleteTermsCondition);

module.exports = router;