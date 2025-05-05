const express = require('express');
const router = express.Router();
const financeDocumentController = require('../controllers/financeDocumentController');
const { protect, authorize } = require('../middlewares/auth');

// Public routes (if needed)
// router.get('/', financeDocumentController.getFinanceDocuments);

// Protected routes
router.use(protect);
router.use(authorize(['admin', 'super_admin']));

router.route('/')
  .get(financeDocumentController.getFinanceDocuments)
  .post(financeDocumentController.createFinanceDocument);

router.route('/:id')
  .get(financeDocumentController.getFinanceDocument)
  .put(financeDocumentController.updateFinanceDocument)
  .delete(financeDocumentController.deleteFinanceDocument);

module.exports = router;