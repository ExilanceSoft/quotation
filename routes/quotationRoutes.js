const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, quotationController.createQuotation);
router.get('/', protect, quotationController.getAllQuotations);


module.exports = router;