const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect ,authorize } = require('../middlewares/auth');

router.post('/', protect, quotationController.createQuotation);
router.get('/', protect,  quotationController.getAllQuotations);
router.get('/:id', protect, quotationController.getQuotationById);
router.get('/pdf/:filename', quotationController.getQuotationPDF);  
router.get('/count/today', protect, quotationController.getTodaysQuotationCount);
router.get('/count/month', protect, quotationController.getThisMonthQuotationCount);

module.exports = router;