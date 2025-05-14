const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, quotationController.createQuotation);
router.get('/', protect, quotationController.getAllQuotations);
router.get('/:id', protect, quotationController.getQuotationById);
router.get('/pdf/:filename', quotationController.getQuotationPDF);  // Changed this route

module.exports = router;