const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect, authorize } = require('../middlewares/auth');

router
  .route('/')
  .get(protect, quotationController.getQuotations)
  .post(protect, authorize('quotation', 'create'), quotationController.createQuotation);

router
  .route('/:id')
  .get(protect, quotationController.getQuotation)
  .put(protect, authorize('quotation', 'update'), quotationController.updateQuotation)
  .delete(protect, authorize('quotation', 'delete'), quotationController.deleteQuotation);

router.get('/:id/pdf', protect, quotationController.generateQuotationPDF);
router.get('/stats', protect, authorize('quotation', 'read'), quotationController.getQuotationStats);

module.exports = router;