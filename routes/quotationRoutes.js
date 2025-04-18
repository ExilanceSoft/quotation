const express = require('express');
const {
  createQuotation,
  getQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
} = require('../controllers/quotationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router
  .route('/')
  .get(protect, getQuotations)
  .post(protect, authorize('sales', 'admin'), createQuotation);

router
  .route('/:id')
  .get(protect, getQuotation)
  .put(protect, authorize('sales', 'admin'), updateQuotation)
  .delete(protect, authorize('admin'), deleteQuotation);

module.exports = router;